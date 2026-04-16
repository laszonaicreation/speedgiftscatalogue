/**
 * ═══════════════════════════════════════════════════════════════
 *  SPEED GIFTS — Centralized Wishlist Manager
 *  Single source of truth for wishlist across all pages.
 *
 *  ARCHITECTURE:
 *  - _wishlistData  : in-memory array, always normalized
 *  - localStorage   : persisted backup for guest/offline
 *  - Firestore      : cloud store for authenticated users
 *
 *  FLOW:
 *  1. initWishlist() → load from localStorage, start polling
 *  2. loadWishlist() → called when user signs in, merges cloud
 *  3. toggleWishlist() → add/remove, save local + cloud
 *  4. clearWishlistOnLogout() → wipe everything on sign-out
 * ═══════════════════════════════════════════════════════════════
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const WISHLIST_KEY       = 'speedgifts_wishlist';
const WISHLIST_PING_KEY  = 'speedgifts_wishlist_ping';
const CHANNEL_NAME       = 'speedgifts_wishlist_sync';

// ── In-memory state ───────────────────────────────────────────────────────────
let _data = [];           // Normalized wishlist entries [{id, ...}]
let _realtimeUnsub = null;
let _cloudLoaded = false;
let _initialized = false;

// ── Cross-tab channel ─────────────────────────────────────────────────────────
const _channel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Get the string ID from any entry format */
function getId(entry) {
    return typeof entry === 'string' ? entry : (entry?.id || null);
}

/**
 * Normalize and deduplicate entries.
 * Strips undefined values so Firestore never rejects the data.
 */
function normalize(entries = []) {
    const seen = new Set();
    const result = [];
    for (const entry of entries) {
        const id = getId(entry);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        // Build a clean, Firestore-safe object
        const safe = { id };
        if (entry && typeof entry === 'object' && entry.var) {
            const v = {};
            for (const k of Object.keys(entry.var)) {
                if (entry.var[k] !== undefined && entry.var[k] !== null) {
                    v[k] = entry.var[k];
                }
            }
            if (Object.keys(v).length > 0) safe.var = v;
        }
        result.push(safe);
    }
    return result;
}

/** Save normalized entries to localStorage */
function saveLocal() {
    try {
        const json = JSON.stringify(_data);
        localStorage.setItem(WISHLIST_KEY, json);
        localStorage.setItem(WISHLIST_PING_KEY, String(Date.now()));
    } catch (_) {}
}

/** Get current logged-in (non-anonymous) user from shared global state */
function getAuthUser() {
    const user = window._sgState?.user;
    if (!user || user.isAnonymous) return null;
    return user;
}

/** Get Firestore reference — returns null if not ready */
function getWishRef() {
    const db    = window._sgDb;
    const appId = window._sgAppId;
    const user  = getAuthUser();
    if (!db || !appId || !user) return null;
    return { db, appId, uid: user.uid };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE — lazy loaded
// ─────────────────────────────────────────────────────────────────────────────
let _fsModule = null;
async function getFS() {
    if (_fsModule) return _fsModule;
    _fsModule = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js');
    return _fsModule;
}

/** Write current _data to Firestore. Silent on failure. */
async function cloudWrite() {
    const ref = getWishRef();
    if (!ref) return;
    try {
        const { doc, setDoc } = await getFS();
        const wishRef = doc(ref.db, 'artifacts', ref.appId, 'users', ref.uid, 'data', 'wishlist');
        await setDoc(wishRef, { ids: _data });
        console.log('[Wishlist] Cloud saved:', _data.length, 'items');
    } catch (err) {
        console.error('[Wishlist] Cloud write failed:', err.code, err.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI UPDATES
// ─────────────────────────────────────────────────────────────────────────────

function isInWishlist(id) {
    return _data.some(x => getId(x) === id);
}

function updateBadge() {
    const count = _data.length;
    ['nav-wishlist-count', 'nav-wishlist-count-mob'].forEach(elId => {
        const el = document.getElementById(elId);
        if (!el) return;
        if (count > 0) {
            el.innerText = count;
            el.style.display = 'flex';
            el.classList.remove('hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('hidden');
        }
    });
    const sidebarCount = document.getElementById('sidebar-count');
    if (sidebarCount) sidebarCount.innerText = `${count} ${count === 1 ? 'Item' : 'Items'} Saved`;
    if (window.sharedNavMain) window.sharedNavMain.refresh();
    if (window._sgWishlistCallback) window._sgWishlistCallback();
}

function updateHeartIcons() {
    // All product cards on page
    document.querySelectorAll('.product-card[data-id]').forEach(card => {
        const id = card.getAttribute('data-id');
        if (id) card.classList.toggle('wish-active', isInWishlist(id));
    });
    // Detail page heart button
    const heartBtn = document.getElementById('detail-wish-btn');
    if (heartBtn) {
        const id = heartBtn.getAttribute('data-id');
        const icon = heartBtn.querySelector('i');
        if (id && icon) {
            icon.className = isInWishlist(id)
                ? 'fa-solid fa-heart text-red-500 text-xl'
                : 'fa-regular fa-heart text-xl';
        }
    }
}

function refreshUI() {
    updateBadge();
    updateHeartIcons();
}

// ─────────────────────────────────────────────────────────────────────────────
// REALTIME LISTENER
// ─────────────────────────────────────────────────────────────────────────────

async function startRealtimeListener() {
    const ref = getWishRef();
    if (!ref) return;

    // Stop any previous listener
    if (_realtimeUnsub) { _realtimeUnsub(); _realtimeUnsub = null; }

    const { doc, onSnapshot } = await getFS();
    const wishRef = doc(ref.db, 'artifacts', ref.appId, 'users', ref.uid, 'data', 'wishlist');

    // Skip first snapshot (we just wrote it ourselves in loadWishlist)
    let skipFirst = true;

    _realtimeUnsub = onSnapshot(wishRef, (snap) => {
        if (skipFirst) { skipFirst = false; return; }
        if (!snap.exists()) return;
        const incoming = normalize(snap.data().ids || []);
        _data = incoming;
        saveLocal();
        refreshUI();
        if (_isSidebarOpen()) renderFavoritesSidebar();
        console.log('[Wishlist] Realtime update:', _data.length, 'items');
    }, (err) => {
        console.error('[Wishlist] Realtime listener error:', err.code);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Returns current wishlist array */
export function getWishlistItems() {
    return _data;
}

/**
 * Step 1 — Call on page load (before auth resolves).
 * Loads from localStorage so UI is instant, wires cross-tab sync.
 */
export function initWishlist() {
    if (_initialized) return;
    _initialized = true;

    // Load from localStorage immediately
    try {
        const raw = localStorage.getItem(WISHLIST_KEY);
        _data = normalize(raw ? JSON.parse(raw) : []);
    } catch (_) { _data = []; }
    refreshUI();

    // Cross-tab sync via storage event
    window.addEventListener('storage', (e) => {
        if (e.key !== WISHLIST_KEY && e.key !== WISHLIST_PING_KEY) return;
        try {
            const raw = localStorage.getItem(WISHLIST_KEY);
            _data = normalize(raw ? JSON.parse(raw) : []);
        } catch (_) { _data = []; }
        refreshUI();
        if (_isSidebarOpen()) renderFavoritesSidebar();
    });

    // Cross-tab sync via BroadcastChannel
    _channel?.addEventListener('message', (e) => {
        if (!e.data?.wishlist) return;
        _data = normalize(e.data.wishlist);
        saveLocal();
        refreshUI();
        if (_isSidebarOpen()) renderFavoritesSidebar();
    });
}

/**
 * Step 2 — Call when user sign-in is confirmed (onAuthStateChanged).
 * Merges guest local items with cloud, then writes authoritative state.
 */
export async function loadWishlist() {
    const ref = getWishRef();
    if (!ref) {
        console.warn('[Wishlist] loadWishlist: no auth user, skipping cloud sync');
        return;
    }

    console.log('[Wishlist] Loading from cloud for uid:', ref.uid);

    try {
        const { doc, getDoc, setDoc } = await getFS();
        const wishRef = doc(ref.db, 'artifacts', ref.appId, 'users', ref.uid, 'data', 'wishlist');
        const snap = await getDoc(wishRef);

        const cloudItems  = snap.exists() ? normalize(snap.data().ids || []) : [];
        const cloudIds    = new Set(cloudItems.map(getId));
        const localItems  = _data;

        // Guest items not yet in cloud
        const newItems = localItems.filter(e => !cloudIds.has(getId(e)));

        // Merged = cloud authoritative + any new guest items
        _data = normalize([...cloudItems, ...newItems]);

        // Persist merged result
        saveLocal();
        await setDoc(wishRef, { ids: _data });

        _cloudLoaded = true;
        refreshUI();

        // Start realtime listener for live updates (e.g. other tabs/devices)
        await startRealtimeListener();

        console.log('[Wishlist] Cloud loaded:', _data.length, 'items');
    } catch (err) {
        console.error('[Wishlist] loadWishlist failed:', err.code, err.message);
    }
}

/**
 * Step 3 — Toggle a product in/out of the wishlist.
 * Always saves locally. Saves to cloud if user is signed in.
 */
export async function toggleWishlist(e, id) {
    if (e) e.stopPropagation();
    if (!id) return;

    const existingIdx = _data.findIndex(x => getId(x) === id);
    if (existingIdx > -1) {
        _data.splice(existingIdx, 1);
    } else {
        const entry = { id };
        // Attach current variation (size/color) if selected
        const currentVar = window._sgState?.currentVar;
        if (currentVar && typeof currentVar === 'object') {
            const v = {};
            for (const k of Object.keys(currentVar)) {
                if (currentVar[k] !== undefined && currentVar[k] !== null) v[k] = currentVar[k];
            }
            if (Object.keys(v).length > 0) entry.var = v;
        }
        _data.push(entry);
    }

    _data = normalize(_data);

    // Always save locally + broadcast
    saveLocal();
    _channel?.postMessage({ wishlist: _data, at: Date.now() });

    // Update UI immediately
    refreshUI();
    if (_isSidebarOpen()) renderFavoritesSidebar();

    // Save to cloud if signed in
    const user = getAuthUser();
    if (user) {
        await cloudWrite();
    }
}

/**
 * Step 4 — Call on sign-out. Wipes all local state.
 */
export function clearWishlistOnLogout() {
    if (_realtimeUnsub) { _realtimeUnsub(); _realtimeUnsub = null; }
    _data = [];
    _cloudLoaded = false;
    // Don't reset _initialized — the listeners are still valid
    try {
        localStorage.removeItem(WISHLIST_KEY);
        localStorage.removeItem(WISHLIST_PING_KEY);
        // Clean up legacy keys
        localStorage.removeItem('speedgifts_guest_additions');
    } catch (_) {}
    refreshUI();
    if (_isSidebarOpen()) renderFavoritesSidebar();
    console.log('[Wishlist] Cleared on logout');
}

// ─────────────────────────────────────────────────────────────────────────────
// FAVORITES SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

function _isSidebarOpen() {
    return document.getElementById('favorites-sidebar')?.classList.contains('open') ?? false;
}

export function openFavoritesSidebar() {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (!sidebar || !overlay) return;
    renderFavoritesSidebar();
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeFavoritesSidebar() {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = 'auto';
}

export async function renderFavoritesSidebar() {
    const { renderFavoritesSidebarMainLike } = await import('./shared-sidebar-renderers.js');
    const products = window._sgDATA?.p || window._sgDATA?.products || [];
    const getUrl   = typeof window.getOptimizedUrl === 'function'
        ? window.getOptimizedUrl
        : (window._sgGetOptUrl || (url => url));

    renderFavoritesSidebarMainLike({
        wishlist: _data,
        products,
        getOptimizedUrl: getUrl,
        onItemClickJs:  (p) => `window.closeFavoritesSidebar(); viewDetail('${p.originalId}', false, ${p.preSelect ? JSON.stringify(p.preSelect) : 'null'})`,
        onRemoveClickJs:(p) => `window.toggleWishlist(null, '${p.originalId}')`
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS — also expose on window so non-module code can call them
// ─────────────────────────────────────────────────────────────────────────────
export { updateHeartIcons as updateAllWishlistUI };
export { updateBadge as updateWishlistBadge };
export { startRealtimeListener as startWishlistRealtimeSync };
export { cloudWrite as syncWishlistToCurrentUserCloud };

window.toggleWishlist         = toggleWishlist;
window.getWishlistItems       = getWishlistItems;
window.openFavoritesSidebar   = openFavoritesSidebar;
window.closeFavoritesSidebar  = closeFavoritesSidebar;
window.renderFavoritesSidebar = renderFavoritesSidebar;
