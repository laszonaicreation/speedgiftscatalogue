import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc, setDoc, increment, writeBatch, arrayUnion, query, where, documentId, onSnapshot } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut, updateProfile, verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { isStandaloneDetailPage, getProductDetailUrl } from "./product-detail-utils.js";
import { initSharedNavbar } from "./shared-navbar.js";
import { initSharedAuth } from "./shared-auth.js";
import { mountSharedShell } from "./shared-shell.js?v=2";
import { renderCategoriesSidebarMainLike, renderFavoritesSidebarMainLike } from "./shared-sidebar-renderers.js";
import { createAdminProxyFactory } from "./home-admin-bridge.js";
import { fetchHomeDataBundle } from "./home-data.js";
import { getHomeEmptyStateHtml, getHomeBestLoadMoreMarkup, ensureHomeLoadMoreContainer, syncHomeSearchUi, setHomeMobileNavActive, applyHomePostRenderScroll, renderHomeBestGridSection, renderHomeCategoryRow, getHomeBestsellerProducts, applyHomeBestsellerSeo, ensureHomeViewScaffold, getHomeRenderElements, runHomePostRenderTasks } from "./home-ui.js";
import { initCart, openCartSidebar, closeCartSidebar, updateCartBadges, mergeCartOnLogin, clearCart } from "./cart.js";

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
// Use new cache API instead of deprecated enableIndexedDbPersistence()
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);
const appId = firebaseConfig.projectId;

// Expose to cart.js and other modules for cloud sync
window._sgAuth = auth;
window._sgDb = db;
window._sgAppId = appId;

const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const sliderCol = collection(db, 'artifacts', appId, 'public', 'data', 'sliders');
const megaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mega_menus');
const popupSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'popupSettings');
const landingSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'landingSettings');
const leadsCol = collection(db, 'artifacts', appId, 'public', 'data', 'leads');

let DATA = { p: [], c: [], m: [], s: [], announcements: [], leads: [], popupSettings: { title: '', msg: '', img: '' }, landingSettings: null, homeSettings: null, stats: { adVisits: 0, adHops: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0 } };
let state = { filter: 'all', sort: 'all', search: '', user: null, authUser: null, wishlist: [], cart: [], scrollPos: 0, currentVar: null, visibleChunks: 1, homeBestExpanded: false, authMode: 'login' };
let sharedNavMain = null;
let wishlistRealtimeUnsub = null;
const PAGE_SIZE = 16;
const HOME_SNAPSHOT_KEY = 'speedgifts_home_snapshot';
const WISHLIST_LOCAL_KEY = 'speedgifts_wishlist';
const WISHLIST_SYNC_CHANNEL = 'speedgifts_wishlist_sync';
const WISHLIST_SYNC_PING_KEY = 'speedgifts_wishlist_sync_ping';
const INITIAL_EAGER_IMAGES = 4;
const INITIAL_PRELOAD_PRODUCTS = 4;
const INITIAL_PRELOAD_SLIDERS = 2;
const INITIAL_EAGER_CATEGORY_IMAGES = 6;
let clicks = 0, lastClickTime = 0;
let iti; // Phone input instance
const wishlistChannel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel(WISHLIST_SYNC_CHANNEL)
    : null;

// Legacy route support: old links used /?tab=shop.
// Redirect them to the faster dedicated shop page while preserving filter/search/share params.
(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') !== 'shop') return;
    const forward = new URLSearchParams();
    ['c', 'q', 's'].forEach((key) => {
        const val = params.get(key);
        if (val) forward.set(key, val);
    });
    const target = `shop.html${forward.toString() ? `?${forward.toString()}` : ''}`;
    window.location.replace(target);
})();

function setupHomeSharedShell() {
    // Home already has its own full shell markup in index.html.
    // Avoid mounting shared shell here to prevent duplicate/invalid DOM state.
    if (document.querySelector('body > nav.sticky')) return;

    let root = document.getElementById('shared-shell-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'shared-shell-root';
        document.body.prepend(root);
    }
    mountSharedShell('home');

    // Remove legacy duplicate shell nodes so IDs remain unique.
    const duplicateIds = [
        'mobile-bottom-nav',
        'favorites-sidebar-overlay',
        'favorites-sidebar',
        'categories-sidebar-overlay',
        'categories-sidebar',
        'auth-modal-overlay',
        'auth-login-modal',
        'auth-account-modal',
        'auth-reset-modal',
        'nav-user-btn',
        'desk-search',
        'desk-clear-btn',
        'nav-wishlist-count',
        'nav-wishlist-count-mob',
        'cart-sidebar-overlay',
        'cart-sidebar'
    ];
    duplicateIds.forEach(id => {
        const nodes = document.querySelectorAll(`#${id}`);
        nodes.forEach((el, idx) => {
            if (idx > 0) el.remove();
        });
    });



    const legacyTopNav = document.querySelector('body > nav.sticky');
    const sharedTopNav = document.querySelector('#shared-shell-root nav.sticky');
    if (legacyTopNav && sharedTopNav) {
        legacyTopNav.remove();
    }
}

setupHomeSharedShell();
initCart({ getProducts: () => DATA.p, getOptimizedUrl });

// ─────────────────────────────────────────────────────────────────────────────
// INSTANT CACHE RENDER — runs at module level after DOM is fully parsed
// Provides zero-flash product display before Firebase auth resolves
// ─────────────────────────────────────────────────────────────────────────────
window._sgTryInstantCacheRender = function() {
    try {
        if (DATA.p && DATA.p.length > 0) return; // Firebase already loaded — skip
        const raw = localStorage.getItem('speedgifts_home_cache');
        if (!raw) return;
        const cache = JSON.parse(raw);
        if (!cache || !Array.isArray(cache.p) || cache.p.length === 0) return;
        DATA = cache;
        console.log('[Cache] Instant render from cache — products:', DATA.p.length);
        if (typeof renderAnnouncementBar === 'function') renderAnnouncementBar();
        if (typeof window.renderDesktopMegaMenu === 'function') window.renderDesktopMegaMenu();
        if (typeof renderHome === 'function') renderHome();
    } catch(e) {
        console.warn('[Cache] Render failed:', e);
    }
};
// Fire after one event-loop tick so the DOM template is fully parsed & available
setTimeout(window._sgTryInstantCacheRender, 0);

// Wire cart globals for home page
window.handleCartClick = () => { window.location.href = 'cart.html'; };
window.openCartSidebar = openCartSidebar;
window.closeCartSidebar = closeCartSidebar;
window.cartCheckoutWhatsApp = () => {
    import('./cart.js').then(m => m.checkoutViaWhatsApp());
};

// Format Date to YYYY-MM-DD (Robust)
const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// SEO HELPERS
function updateMetaDescription(description) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = "description";
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
}

function updateCanonicalURL(queryString) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
    }
    const baseUrl = 'https://speedgifts.ae/';
    canonical.setAttribute('href', baseUrl + queryString);
}

let lastWhatsAppTrackTime = 0;

// SINGLE PAGE APPLICATION (SPA) TRACKING
function trackPageView() {
    if (typeof gtag === 'function') {
        const path = window.location.pathname + window.location.search;
        gtag('config', 'AW-789546339', { 'page_path': path });
        gtag('config', 'G-98ZMG3ZF7Z', { 'page_path': path });
        console.log(`[Ad Tracking] Page View recorded: ${path}`);
    }
}
window.trackWhatsAppInquiry = async (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    const now = Date.now();
    if (now - lastWhatsAppTrackTime < 2000) return;
    lastWhatsAppTrackTime = now;

    console.log(`[Ad Tracking] WhatsApp Inquiry for: ${idList.join(', ')}`);

    // GTM Event
    if (window.dataLayer) {
        window.dataLayer.push({
            'event': 'whatsapp_inquiry',
            'product_ids': idList,
            'is_bulk': idList.length > 1
        });
    }

    // Record Ad Inquiry (Conversion)
    if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
        await waitForAuth();
        try {
            const today = getTodayStr();
            const dailyStatsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
            await setDoc(dailyStatsRef, { adInquiries: increment(1) }, { merge: true });

            for (const id of idList) {
                if (id !== 'bulk_inquiry') {
                    const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
                    await setDoc(dailyProdRef, { adInquiries: increment(1), productId: id, date: today }, { merge: true });
                }
            }
            // LOCAL UPDATE: Increment local state for immediate feedback in debug tool
            if (DATA.stats) DATA.stats.adInquiries++;
            console.log("[Ad Tracking] Daily Inquiry recorded successfully.");
        } catch (e) {
            console.error("[Ad Tracking] Inquiry tracking error:", e);
        }
    }
};

/* DEBUG MODE HELPER: Run 'checkAdData()' in console to verify tracking */
window.checkAdData = () => {
    console.log("--- AD TRACKING DEBUG ---");
    console.log("Traffic Source Detected:", sessionStorage.getItem('traffic_source'));
    console.log("Tracked this session?:", sessionStorage.getItem('ad_visit_tracked_v3'));
    console.log("Current Data Memory State:", DATA.stats);
    const testProd = DATA.p.find(p => p.adInquiries > 0);
    console.log("Example Product with Inquiries:", testProd ? `${testProd.name}: ${testProd.adInquiries}` : "None found yet");
    console.log("-------------------------");
};

async function initTrafficTracking() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSrc = (urlParams.get('utm_source') || '').toLowerCase();
    const utmMed = (urlParams.get('utm_medium') || '').toLowerCase();

    console.log("[Traffic] Detecting source...");

    if (urlParams.has('gclid') ||
        urlParams.has('gbraid') ||
        urlParams.has('wbraid') ||
        urlParams.has('gad_source') ||
        utmSrc === 'google' ||
        utmSrc === 'google_ads' ||
        utmSrc === 'googleads' ||
        utmMed === 'cpc' ||
        utmMed === 'ppc' ||
        utmMed === 'google_ads') {
        sessionStorage.setItem('traffic_source', 'Google Ads');
        console.log("[Traffic] Google Ads source verified.");
    } else if (urlParams.has('utm_source')) {
        sessionStorage.setItem('traffic_source', urlParams.get('utm_source'));
        console.log(`[Traffic] UTM Source identified: ${urlParams.get('utm_source')}`);
    } else if (!sessionStorage.getItem('traffic_source')) {
        sessionStorage.setItem('traffic_source', 'Normal');
        console.log("[Traffic] Normal traffic source set.");
    }
}

// Global Image Error Tracking (Site Health)
// Session-scoped deduplication: each unique broken URL counted only ONCE per session
const _errorTrackedUrls = new Set();

window.addEventListener('error', function (e) {
    if (e.target.tagName !== 'IMG') return;
    const src = e.target.src || '';
    // Skip: placeholder images, empty src, data URIs, already-tracked this session
    if (!src || src.startsWith('data:') || src.includes('placehold.co') || src.includes('placeholder')) return;
    // Skip: non-http URLs, directory-style paths (e.g. "/img/"), and site-own-page URLs
    if (!src.startsWith('http')) return;
    const ownOrigin = window.location.origin;
    const srcPath = src.replace(ownOrigin, '');
    if (!srcPath || srcPath === '/' || srcPath.startsWith('/admin') || srcPath === '/img/' || !srcPath.includes('.')) return;
    if (_errorTrackedUrls.has(src)) return;  // Already counted this session — skip
    _errorTrackedUrls.add(src);
    trackImageError(src);
}, true);

async function trackImageError(src) {
    try {
        const today = getTodayStr();
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        // Save both the count AND the specific broken URL for admin visibility
        await setDoc(statsRef, {
            imageLoadFail: increment(1),
            brokenImages: arrayUnion(src)
        }, { merge: true });
        console.warn("[Health Check] Image failed to load:", src);
    } catch (e) { }
}

async function trackNormalVisit() {
    const today = getTodayStr();
    const sessionKey = `normal_visit_tracked_${today}`; // Daily tracking
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        console.log(`[Traffic] Recording normal visit to: daily_stats/${today}`);
        await setDoc(statsRef, { normalVisits: increment(1) }, { merge: true });
        console.log("[Traffic] Normal visit recorded.");
    } catch (e) {
        console.error("[Traffic] Normal visit tracking failed:", e);
    }
}

// Helper: Ensure authentication is ready before tracking
async function waitForAuth() {
    if (auth.currentUser) return auth.currentUser;
    return new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                unsubscribe();
                resolve(user);
            }
        });
        setTimeout(() => { unsubscribe(); resolve(null); }, 6000);
    });
}

// ADVANCED AD TRACKING: SESSION DURATION & ENGAGEMENT
let sessionStartTime = Date.now();
let lastEngagementTime = Date.now();
let totalActiveSeconds = 0;

// Track active time every 5 seconds if user is engaged
setInterval(() => {
    if (document.visibilityState === 'visible' && (Date.now() - lastEngagementTime < 60000)) {
        totalActiveSeconds += 5;
    }
}, 5000);

// Record engagement on interactions
['mousedown', 'touchstart', 'scroll', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => { lastEngagementTime = Date.now(); }, { passive: true });
});

async function syncSessionDuration() {
    if (sessionStorage.getItem('traffic_source') !== 'Google Ads') return;
    if (totalActiveSeconds < 5) return;

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(statsRef, { totalSessionSeconds: increment(totalActiveSeconds) }, { merge: true });
        console.log(`[Ad Tracking] Synced ${totalActiveSeconds}s session duration.`);
        totalActiveSeconds = 0; // Reset after sync
    } catch (e) {
        console.error("[Ad Tracking] Session sync failed:", e);
    }
}

// Sync on leave
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncSessionDuration();
});
window.addEventListener('beforeunload', syncSessionDuration);

// IMPRESSION TRACKING
const impressionCache = new Set();
let impressionObserver = null;

function initImpressionTracking() {
    // Disabled as per User request to only track manual detail page views.
}

// recordImpression removed as per User request


async function trackAdHop() {
    const today = getTodayStr();
    const sessionKey = `ad_hop_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true'); // Immediate set to prevent race

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        console.log(`[Ad Tracking] Recording hop to: daily_stats/${today}`);
        await setDoc(statsRef, { adHops: increment(1) }, { merge: true });
        console.log("[Ad Tracking] Daily Hop recorded.");
    } catch (e) {
        console.error("[Ad Tracking] Hop tracking error:", e);
    }
}

async function trackAdVisit() {
    const today = getTodayStr();
    const sessionKey = `ad_visit_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        await setDoc(statsRef, { adVisits: increment(1) }, { merge: true });
        console.log("[Ad Tracking] Daily Ad Visit recorded.");
    } catch (e) {
        console.error("[Ad Tracking] Ad visit recording failed:", e);
    }
}

onAuthStateChanged(auth, async (u) => {
    state.user = u;

    if (!u) {
        console.log("[Auth] No session found, initializing guest session...");
        await signInAnonymously(auth).catch(e => console.error("[Auth] Guest sync failed:", e));
        return; // Wait for the next trigger with the anonymous user
    }

    // CUSTOMER AUTH UI
    if (u && !u.isAnonymous) {
        state.authUser = u;
        const navBtn = document.getElementById('nav-user-btn');
        if (navBtn) navBtn.classList.add('text-black');

        const accountName = document.getElementById('account-user-name');
        const accountEmail = document.getElementById('account-user-email');
        if (accountName) accountName.innerText = u.displayName || "User";
        if (accountEmail) accountEmail.innerText = u.email || "";

        // Merge guest cart + cloud cart on login
        mergeCartOnLogin(u.uid);
    } else {
        state.authUser = null;
        const navBtn = document.getElementById('nav-user-btn');
        if (navBtn) navBtn.classList.remove('text-black');
    }

    // INSTANT badge refresh from localStorage — no Firebase wait needed
    // This runs synchronously so badges update immediately on every auth state change
    try {
        const localWish = localStorage.getItem(WISHLIST_LOCAL_KEY);
        if (localWish) {
            const parsed = JSON.parse(localWish);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.wishlist = parsed;
                updateWishlistBadge();
            }
        }
    } catch(_) {}
    updateCartBadges(); // Cart is always in localStorage, update instantly

    if (u) {
        console.log("[Auth] Session active. Updating data...");
        await initTrafficTracking();
        await refreshData();

        if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
            trackAdHop();
            trackAdVisit();
        } else {
            trackNormalVisit();
        }
        await loadWishlist();
    }
});

// ============================================================================
// CART MERGE ON LOGIN
// ============================================================================

const handleReentry = () => {
    if (DATA.p.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const pId = urlParams.get('p');
        if (pId) viewDetail(pId, true, null, false); // Enable tracking for initial entry
        else {
            renderHome();
            updateMetaDescription("Discover premium gifts and personalized items at Speed Gifts. From engraved wood to custom cushions, find the perfect gift for every occasion.");
            updateCanonicalURL('');
        }
    } else if (auth.currentUser) {
        refreshData();
    }
};

window.addEventListener('pageshow', (e) => {
    if (e.persisted || (window.performance && window.performance.navigation.type === 2)) {
        setTimeout(handleReentry, 150);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        setTimeout(handleReentry, 250);
    }
});

window.onfocus = () => { handleReentry(); };

window.onpopstate = () => {
    refreshData(true);
    trackPageView();
};


async function loadWishlist() {
    const getWishId = (entry) => (typeof entry === 'string' ? entry : entry?.id);
    const normalizeWishlistEntries = (entries = []) => {
        const seen = new Set();
        const normalized = [];
        entries.forEach((entry) => {
            const id = getWishId(entry);
            if (!id || seen.has(id)) return;
            seen.add(id);
            if (typeof entry === 'string') normalized.push({ id });
            else normalized.push(entry?.id ? { ...entry } : { id });
        });
        return normalized;
    };
    try {
        const localRaw = localStorage.getItem(WISHLIST_LOCAL_KEY);
        const localList = localRaw ? JSON.parse(localRaw) : [];
        state.wishlist = normalizeWishlistEntries(localList);
    } catch (_) { /* no-op */ }

    if (!state.user) return;
    try {
        const wishRef = doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist');
        const wishDoc = await getDoc(wishRef);

        // Get local (guest) wishlist
        const localIds = state.wishlist.map(e => typeof e === 'string' ? e : e?.id).filter(Boolean);

        if (wishDoc.exists()) {
            const cloudIds = normalizeWishlistEntries(wishDoc.data().ids || [])
                .map(e => typeof e === 'string' ? e : e?.id).filter(Boolean);
            // MERGE: combine cloud + local, deduplicate by id
            const merged = [...cloudIds];
            for (const id of localIds) {
                if (!merged.includes(id)) merged.push(id);
            }
            state.wishlist = normalizeWishlistEntries(merged);
        } else {
            // First login: use local data as base
            state.wishlist = normalizeWishlistEntries(localIds);
        }

        // Save merged result to both localStorage and Firestore
        localStorage.setItem(WISHLIST_LOCAL_KEY, JSON.stringify(state.wishlist));
        // IMPORTANT: await the cloud write BEFORE starting realtime sync.
        // This prevents the first onSnapshot (which fires with stale pre-merge data)
        // from overwriting the freshly merged wishlist.
        try {
            await setDoc(wishRef, { ids: state.wishlist });
        } catch(e) { console.error('[Wishlist] Cloud save failed:', e); }
        updateWishlistBadge();
        updateAllWishlistUI();
        startWishlistRealtimeSync();
    } catch (err) { console.error("Wishlist Load Error", err); }
}

function startWishlistRealtimeSync() {
    if (!state.user) return;
    const wishRef = doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist');
    wishlistRealtimeUnsub?.();

    // Skip the FIRST snapshot event — it fires immediately with whatever is in
    // Firestore cache (potentially stale / pre-merge data) and would overwrite
    // the freshly merged wishlist we just saved in loadWishlist().
    let skipFirst = true;

    wishlistRealtimeUnsub = onSnapshot(wishRef, (snap) => {
        if (skipFirst) {
            skipFirst = false;
            return; // Ignore the immediate-fire snapshot
        }
        const raw = snap.exists() ? (snap.data().ids || []) : [];
        const seen = new Set();
        const incoming = raw.filter((entry) => {
            const wishId = typeof entry === 'string' ? entry : entry?.id;
            if (!wishId || seen.has(wishId)) return false;
            seen.add(wishId);
            return true;
        }).map((entry) => (typeof entry === 'string' ? { id: entry } : entry));

        // Merge incoming cloud data with current local state to prevent data loss
        const localIds = new Set(state.wishlist.map(e => (typeof e === 'string' ? e : e?.id)).filter(Boolean));
        const merged = [...state.wishlist];
        incoming.forEach(entry => {
            const id = typeof entry === 'string' ? entry : entry?.id;
            if (id && !localIds.has(id)) merged.push(entry);
        });

        state.wishlist = merged;
        localStorage.setItem(WISHLIST_LOCAL_KEY, JSON.stringify(state.wishlist));
        updateWishlistBadge();
        updateAllWishlistUI();
        if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();
    }, (err) => {
        console.error("Wishlist Realtime Sync Error", err);
    });
}

async function syncWishlistToCurrentUserCloud() {
    if (!state.user) return;
    try {
        await setDoc(
            doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'),
            { ids: state.wishlist }
        );
    } catch (err) {
        console.error("Wishlist Cloud Sync From Local Error", err);
    }
}

function updateAllWishlistUI() {
    const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

    // Update all visible product cards
    document.querySelectorAll('.product-card').forEach(card => {
        const id = card.getAttribute('data-id');
        if (id) {
            card.classList.toggle('wish-active', isInWishlist(id));
        }
    });

    // Update detail view if open
    const detailHeart = document.getElementById('detail-wish-btn');
    if (detailHeart) {
        const id = detailHeart.getAttribute('data-id');
        if (id) {
            const icon = detailHeart.querySelector('i');
            if (isInWishlist(id)) {
                icon.className = 'fa-solid fa-heart text-red-500 text-xl';
            } else {
                icon.className = 'fa-regular fa-heart text-xl';
            }
        }
    }
}

function updateWishlistBadge() {
    const badge = document.getElementById('nav-wishlist-count');
    const sidebarCount = document.getElementById('sidebar-count');
    const count = state.wishlist.length;

    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (sidebarCount) {
        sidebarCount.innerText = `${count} ${count === 1 ? 'Item' : 'Items'} Saved`;
    }

    const mobBadge = document.getElementById('nav-wishlist-count-mob');
    if (mobBadge) {
        if (count > 0) {
            mobBadge.innerText = count;
            mobBadge.classList.remove('hidden');
        } else {
            mobBadge.classList.add('hidden');
        }
    }

    sharedNavMain?.refresh();
}

window.toggleWishlist = async (e, id) => {
    if (e) e.stopPropagation();
    if (!state.user) return showToast("Authenticating...");

    // Find if product exists in wishlist
    const existingIndex = state.wishlist.findIndex(x => (typeof x === 'string' ? x : x.id) === id);

    if (existingIndex > -1) {
        state.wishlist.splice(existingIndex, 1);
    } else {
        const entry = { id };
        if (state.currentVar) entry.var = { ...state.currentVar };
        state.wishlist.push(entry);
    }

    // UI Updates
    updateWishlistBadge();

    // Helper to check if any version of ID is in wishlist
    const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

    // Update main grid cards if visible
    const gridCards = document.querySelectorAll(`.product-card[data-id="${id}"]`);
    gridCards.forEach(card => {
        card.classList.toggle('wish-active', isInWishlist(id));
    });

    // Update detail view heart icon
    const detailHeart = document.getElementById('detail-wish-btn');
    if (detailHeart && detailHeart.getAttribute('data-id') === id) {
        const icon = detailHeart.querySelector('i');
        if (isInWishlist(id)) {
            icon.className = 'fa-solid fa-heart text-red-500 text-xl';
        } else {
            icon.className = 'fa-regular fa-heart text-xl';
        }
    }

    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();

    try {
        const seen = new Set();
        state.wishlist = state.wishlist.filter((entry) => {
            const wishId = typeof entry === 'string' ? entry : entry?.id;
            if (!wishId || seen.has(wishId)) return false;
            seen.add(wishId);
            return true;
        }).map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
        localStorage.setItem(WISHLIST_LOCAL_KEY, JSON.stringify(state.wishlist));
        localStorage.setItem(WISHLIST_SYNC_PING_KEY, String(Date.now()));
        wishlistChannel?.postMessage({ wishlist: state.wishlist, at: Date.now() });
    } catch (_) { /* no-op */ }

    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'), { ids: state.wishlist });
    } catch (err) { showToast("Sync Error"); }
};

window.addEventListener('storage', (event) => {
    if (event.key !== WISHLIST_LOCAL_KEY && event.key !== WISHLIST_SYNC_PING_KEY) return;
    try {
        const raw = localStorage.getItem(WISHLIST_LOCAL_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const seen = new Set();
        state.wishlist = (parsed || []).filter((entry) => {
            const wishId = typeof entry === 'string' ? entry : entry?.id;
            if (!wishId || seen.has(wishId)) return false;
            seen.add(wishId);
            return true;
        }).map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
    } catch {
        state.wishlist = [];
    }
    updateWishlistBadge();
    updateAllWishlistUI();
    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();
    syncWishlistToCurrentUserCloud();
});

wishlistChannel?.addEventListener('message', (event) => {
    try {
        const parsed = event?.data?.wishlist || [];
        const seen = new Set();
        state.wishlist = (parsed || []).filter((entry) => {
            const wishId = typeof entry === 'string' ? entry : entry?.id;
            if (!wishId || seen.has(wishId)) return false;
            seen.add(wishId);
            return true;
        }).map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
        localStorage.setItem(WISHLIST_LOCAL_KEY, JSON.stringify(state.wishlist));
    } catch {
        state.wishlist = [];
    }
    updateWishlistBadge();
    updateAllWishlistUI();
    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();
    syncWishlistToCurrentUserCloud();
});

let wishlistPollSignature = '';
setInterval(() => {
    try {
        const raw = localStorage.getItem(WISHLIST_LOCAL_KEY) || '[]';
        if (raw === wishlistPollSignature) return;
        wishlistPollSignature = raw;
        const parsed = JSON.parse(raw);
        const seen = new Set();
        state.wishlist = (parsed || []).filter((entry) => {
            const wishId = typeof entry === 'string' ? entry : entry?.id;
            if (!wishId || seen.has(wishId)) return false;
            seen.add(wishId);
            return true;
        }).map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
        updateWishlistBadge();
        updateAllWishlistUI();
        if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();
    } catch (_) {
        // no-op
    }
}, 700);

window.renderDesktopMegaMenu = () => {
    const container = document.getElementById('desk-mega-menu');
    if (!container) return;

    const sorted = [...(DATA.m || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const wrapper = document.getElementById('desktop-mega-menu-wrapper');

    if (sorted.length === 0) {
        if (wrapper) wrapper.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    if (wrapper) wrapper.style.display = '';
    container.innerHTML = '';

    sorted.forEach((m) => {
        const mappedCats = (m.categoryIds || [])
            .map(cId => DATA.c.find(c => c.id === cId))
            .filter(Boolean);

        const li = document.createElement('li');
        li.className = 'mega-menu-li';

        const a = document.createElement('a');
        a.className = 'mega-menu-link';
        a.innerHTML = `${m.name}${mappedCats.length > 0 ? ' <i class="fa-solid fa-chevron-down mega-menu-arrow"></i>' : ''}`;
        li.appendChild(a);

        if (mappedCats.length > 0) {
            const panel = document.createElement('div');

            // 1. Panel Container Styles (Simplified, letting CSS handle the heavy lifting)
            panel.className = 'mega-dropdown-panel';
            panel.style.display = 'none'; // Overridden on hover

            // RIGID 5-COLUMN GRID (This is the fix)
            // inline styles removed to let CSS govern the 5-column grid cleanly

            mappedCats.forEach(c => {
                const card = document.createElement('div');
                card.className = 'mega-cat-card';

                const thumb = document.createElement('div');
                thumb.style.width = '34px';
                thumb.style.height = '34px';
                thumb.style.flexShrink = '0';
                thumb.style.borderRadius = '9px';
                thumb.style.overflow = 'hidden';
                thumb.style.background = '#f9fafb';
                thumb.style.border = '1px solid #eee';

                const img = document.createElement('img');
                const _catImgUrl = getOptimizedUrl(c.img, 80);
                img.src = _catImgUrl || 'https://placehold.co/80x80?text=?';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                if (_catImgUrl) img.onerror = () => { img.src = 'https://placehold.co/80x80?text=?'; };
                thumb.appendChild(img);

                const label = document.createElement('span');
                label.className = 'mega-cat-name';
                label.textContent = c.name;

                card.appendChild(thumb);
                card.appendChild(label);
                card.addEventListener('click', () => window.applyFilter(c.id));
                panel.appendChild(card);
            });

            li.appendChild(panel);

            let hideTimer;
            const showPanel = () => {
                clearTimeout(hideTimer);
                // Explicitly set display: grid to force 5 columns
                panel.style.display = 'grid';
                const arrow = a.querySelector('.mega-menu-arrow');
                if (arrow) arrow.style.transform = 'rotate(180deg)';
                a.style.color = '#000';
                a.style.borderBottomColor = '#000';
            };
            const hidePanel = (delay = 80) => {
                hideTimer = setTimeout(() => {
                    panel.style.display = 'none';
                    const arrow = a.querySelector('.mega-menu-arrow');
                    if (arrow) arrow.style.transform = '';
                    a.style.color = '';
                    a.style.borderBottomColor = '';
                }, delay);
            };

            li.addEventListener('mouseenter', showPanel);
            li.addEventListener('mouseleave', () => hidePanel(100));
            panel.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            panel.addEventListener('mouseleave', () => hidePanel(100));
        }

        container.appendChild(li);
    });
};

async function refreshData(isNavigationOnly = false) {
    try {
        if (!isNavigationOnly || DATA.p.length === 0) {
            const bundle = await fetchHomeDataBundle({
                db,
                appId,
                getTodayStr,
                doc,
                getDoc,
                getDocs,
                prodCol,
                catCol,
                megaCol,
                sliderCol,
                popupSettingsCol
            });

            DATA.p = bundle.products;
            DATA.c = bundle.categories;
            DATA.m = bundle.megaMenus;
            DATA.s = bundle.sliders;
            DATA.announcements = bundle.announcements;
            DATA.popupSettings = bundle.popupSettings || DATA.popupSettings;
            DATA.landingSettings = bundle.landingSettings;
            DATA.homeSettings = bundle.homeSettings;
            DATA.stats = bundle.stats;
            
            // Save cache for next lightning-fast load
            try {
                localStorage.setItem('speedgifts_home_cache', JSON.stringify(DATA));
            } catch(e) {}
            
            primeHomeCriticalAssets();

            renderAnnouncementBar();
            renderDesktopMegaMenu();
            initMainSharedNavbar();
            sharedNavMain?.refresh();
            // Defer non-critical preloading until the first paint is done.
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => window.preloadInitialBatch(), { timeout: 1200 });
            } else {
                setTimeout(() => window.preloadInitialBatch(), 300);
            }

            console.log("[Ad Tracking] UI Refreshed. Counter is now:", DATA.stats.adVisits);
        }
        const urlParams = new URLSearchParams(window.location.search);
        const prodId = urlParams.get('p');
        const catId = urlParams.get('c');
        const query = urlParams.get('q');
        const isAdminOpen = document.getElementById('admin-panel')?.classList.contains('hidden') === false;

        // Sync state from URL
        let rawCatId = catId || 'all';
        // Sanitization: Remove trailing slashes and handle malformed query markers (e.g. ?c=caricature?gclid=...)
        if (rawCatId !== 'all') {
            rawCatId = rawCatId.split('?')[0].split('&')[0].replace(/\/+$/, '').trim();
        }
        state.filter = rawCatId;
        state.search = query || '';

        // Sync search UI state for popstate (browser back button)
        if (state.search) {
            if (typeof enterSearchMode === 'function') enterSearchMode();
            const discSearch = document.getElementById('customer-search');
            const deskSearch = document.getElementById('desk-search');
            if (discSearch) discSearch.value = state.search;
            if (deskSearch) deskSearch.value = state.search;
            const clearBtn = document.getElementById('clear-search-btn');
            const deskClearBtn = document.getElementById('desk-clear-btn');
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (deskClearBtn) deskClearBtn.classList.remove('hidden');
        } else {
            if (typeof exitSearchMode === 'function') exitSearchMode();
            const discSearch = document.getElementById('customer-search');
            const deskSearch = document.getElementById('desk-search');
            if (discSearch) discSearch.value = '';
            if (deskSearch) deskSearch.value = '';
            const clearBtn = document.getElementById('clear-search-btn');
            const deskClearBtn = document.getElementById('desk-clear-btn');
            if (clearBtn) clearBtn.classList.add('hidden');
            if (deskClearBtn) deskClearBtn.classList.add('hidden');
        }

        // SMART CATEGORY MATCHING: If state.filter is not 'all', check if it's a Name instead of an ID
        if (state.filter !== 'all') {
            const foundById = DATA.c.find(c => c.id === state.filter);
            if (!foundById) {
                // Try matching by name (case-insensitive)
                const foundByName = DATA.c.find(c => c.name.toLowerCase() === state.filter.toLowerCase());
                if (foundByName) {
                    state.filter = foundByName.id;
                } else {
                    // FALLBACK: If requested category is totally invalid, default to 'all'
                    console.warn(`[Routing] Invalid category '${state.filter}' requested. Falling back to 'all'.`);
                    state.filter = 'all';
                    // Clean URL
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('c', 'all');
                    window.history.replaceState({}, '', newUrl);
                }
            }
        }

        if (!isAdminOpen) {
            if (prodId && DATA.p.length > 0) {
                viewDetail(prodId, true);
            } else {
                renderHome();
                applyHomeSnapshotIfAny();
            }
        } else {
            renderHome();
            applyHomeSnapshotIfAny();
        }

        populateCatSelect();
        populateAdminCatFilter();

        // PERSISTENCE: Auto-open admin if in URL
        const openAdmin = urlParams.get('admin') === 'true';
        const activeTab = urlParams.get('atab');
        if (openAdmin) {
            if (activeTab) state.adminTab = activeTab;
            window.showAdminPanel();
        } else {
            renderAdminUI();
        }


        // Preload in background (non-blocking)
        const iconsToLoad = DATA.c.map(c => getOptimizedUrl(c.img)).filter(u => u && u !== 'img/').slice(0, 10);
        const stockFilter = (items) => items.filter(p => p.inStock !== false);
        let filteredForPreload = [];
        if (state.filter !== 'all') filteredForPreload = stockFilter(DATA.p.filter(p => p.catId === state.filter));
        else filteredForPreload = stockFilter(DATA.p);

        filteredForPreload.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        const prodsToLoad = filteredForPreload.slice(0, 8).map(p => getOptimizedUrl(p.img)).filter(u => u && u !== 'img/');
        const allToPreload = [...new Set([...prodsToLoad, ...iconsToLoad])];

        // Fire and forget (don't await)
        allToPreload.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    } catch (err) {
        console.error(err);
    }
}

const safePushState = (params, replace = false) => {
    try {
        const url = new URL(window.location.href);
        // Clear conflicting params if needed, or just handle all
        const keys = ['p', 'c', 'q'];
        keys.forEach(key => {
            if (params.hasOwnProperty(key)) {
                if (params[key] === null) url.searchParams.delete(key);
                else url.searchParams.set(key, params[key]);
            }
        });
        const finalPath = url.pathname + url.search;
        if (replace) window.history.replaceState({}, '', finalPath);
        else window.history.pushState({}, '', finalPath);

        // Track virtual page view
        trackPageView();
    } catch (e) { console.warn("Nav Error"); }
};

window.handleLogoClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 5000) clicks = 0;
    clicks++; lastClickTime = now;
    if (clicks >= 5) {
        clicks = 0; // Reset

        // SECURITY: Only allow real admin to unlock the hidden dashboard button
        const u = state.authUser || window._fbAuth?.currentUser || getAuth().currentUser;
        if (!u || u.email !== "laszonaicreation@gmail.com") {
            showToast("Admin access denied");
            return;
        }

        const btn = document.getElementById('admin-entry-btn');
        const hideBtn = document.getElementById('admin-hide-btn');
        if (btn) {
            btn.classList.remove('hidden');
            if (hideBtn) hideBtn.classList.remove('hidden');
            showToast("Dashboard Unlocked");
            renderHome(); // Re-render to show pin icons
        }
    } else {
        // Stability: Only navigate home if we're not already viewing the main collection
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('p') || state.filter !== 'all' || state.search !== '') {
            goBackToHome(false);
        }
    }
};

window.hideDashboardButton = () => {
    const btn = document.getElementById('admin-entry-btn');
    const hideBtn = document.getElementById('admin-hide-btn');
    if (btn) btn.classList.add('hidden');
    if (hideBtn) hideBtn.classList.add('hidden');
    showToast("Dashboard Hidden");
    renderHome(); // Re-render to hide pin icons
};

window.goBackToHome = (forceReset = false) => {
    if (forceReset) {
        state.filter = 'all';
        state.search = '';
        state.scrollPos = 0;
        state.visibleChunks = 1; // Reset pagination
        safePushState({ p: null, c: null, q: null });
        // Clear search mode UI (body class, hidden elements) — critical after search→detail→back→home flow
        if (typeof exitSearchMode === 'function') exitSearchMode();
        // Clear search input fields
        const searchInput = document.getElementById('customer-search');
        const deskInput = document.getElementById('desk-search');
        if (searchInput) searchInput.value = '';
        if (deskInput) deskInput.value = '';
        const clearBtn = document.getElementById('clear-search-btn');
        const deskClearBtn = document.getElementById('desk-clear-btn');
        if (clearBtn) clearBtn.classList.add('hidden');
        if (deskClearBtn) deskClearBtn.classList.add('hidden');
    } else {
        safePushState({ p: null });
    }
    renderHome();
};

// Detect how many columns the product grid currently shows
function getColumnsCount() {
    const w = window.innerWidth;
    if (w >= 1024) return 5; // lg (max columns in CSS)
    if (w >= 768) return 4; // md
    if (w >= 640) return 3; // sm
    return 2;                // mobile
}

window.loadMoreProducts = () => {
    state.isLoadMore = true;
    state.visibleChunks++;
    renderHome();
};

window.showLessProducts = () => {
    state.isLoadMore = false;
    state.visibleChunks = 1;
    renderHome();

    // Scroll back to the collection title
    setTimeout(() => {
        const title = document.getElementById('active-category-title');
        if (title) {
            const yOffset = -200;
            const y = title.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }, 100);
};


function renderHome() {
    try {
        const outerWrapper = document.getElementById('home-top-elements');
        if (outerWrapper) outerWrapper.classList.remove('hidden');

        const appMain = document.getElementById('app');
        const template = document.getElementById('home-view-template');
        if (!ensureHomeViewScaffold({ appMain, template })) return;

        // SELECT ALL ELEMENTS AFTER INJECTION
        if (typeof window.renderDesktopMegaMenu === 'function') window.renderDesktopMegaMenu();
        const {
            catRow,
            grid,
            mobileSort,
            selectAllBtn,
            activeCatTitle,
            activeCatTitleMob,
            categorySelector
        } = getHomeRenderElements(appMain) || {};

        // NOTE: Event listeners are attached ONCE at init time (see initSearchListeners)
        // Do NOT add listeners here — they would be duplicated on every renderHome() call.

        // 1. Standard customer view (selection/share moved to shop page)
        if (catRow) catRow.classList.remove('hidden');
        if (categorySelector) categorySelector.classList.remove('hidden');

        const isAdminVisible = !document.getElementById('admin-entry-btn').classList.contains('hidden');
        const categories = [...DATA.c].sort((a, b) => {
                const pinA = a.isPinned ? 1 : 0;
                const pinB = b.isPinned ? 1 : 0;
                if (pinA !== pinB) return pinB - pinA;
                if (a.isPinned && b.isPinned) {
                    return (a.pinnedAt || 0) - (b.pinnedAt || 0);
                }
                return 0;
            });
        renderHomeCategoryRow({
            catRow,
            categories,
            activeFilter: state.filter,
            getImageUrl: (c) => getOptimizedUrl(c.img, 200) || 'https://placehold.co/100x100?text=Gift',
            isAdminVisible
        });
        
        const filtered = getHomeBestsellerProducts({ products: DATA.p, sort: state.sort });
        applyHomeBestsellerSeo({
            activeCatTitle,
            activeCatTitleMob,
            activeFilter: state.filter,
            updateMetaDescription,
            updateCanonicalURL
        });

        // Selection/share UI moved to shop page; hide any legacy button if present.
        if (selectAllBtn?.parentElement) selectAllBtn.parentElement.style.display = 'none';
        if (grid) {
            const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);
            renderHomeBestGridSection({
                grid,
                filtered,
                homeBestExpanded: state.homeBestExpanded,
                getColumnsCount,
                isInWishlist,
                getBadgeLabel,
                getOptimizedUrl,
                initialEagerImages: INITIAL_EAGER_IMAGES,
                ensureGridImagesVisible,
                getEmptyStateHtml: getHomeEmptyStateHtml,
                ensureLoadMoreContainer: ensureHomeLoadMoreContainer,
                getLoadMoreMarkup: getHomeBestLoadMoreMarkup
            });
        }

        const scrollResult = runHomePostRenderTasks({
            renderSlider,
            renderSpotlightSection,
            initImpressionTracking,
            syncHomeSearchUi,
            searchValue: state.search,
            mobileSort,
            sortValue: state.sort,
            setHomeMobileNavActive,
            applyHomePostRenderScroll,
            isLoadMore: state.isLoadMore,
            skipScroll: state.skipScroll,
            scrollPos: state.scrollPos
        });
        state.isLoadMore = scrollResult.nextIsLoadMore;
        state.skipScroll = scrollResult.nextSkipScroll;
    } catch (e) {
        console.error("Render Error:", e);
        showToast("UI Display Error");
    }
}

function cacheDetailPayload(id) {
    try {
        const product = DATA.p.find(x => x.id === id);
        if (!product) return;
        const payload = {
            id,
            ts: Date.now(),
            product,
            // keep this lightweight: only categories needed for labels/related rendering
            categories: Array.isArray(DATA.c) ? DATA.c : []
        };
        sessionStorage.setItem('speedgifts_detail_cache', JSON.stringify(payload));
    } catch (e) {
        // non-blocking cache path
    }
}

function cacheHomeSnapshot() {
    try {
        const snapshot = {
            ts: Date.now(),
            url: window.location.pathname + window.location.search,
            scrollY: window.scrollY || state.scrollPos || 0,
            visibleChunks: state.visibleChunks || 1
        };
        sessionStorage.setItem(HOME_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (e) {
        // non-blocking snapshot path
    }
}

function applyHomeSnapshotIfAny() {
    try {
        const raw = sessionStorage.getItem(HOME_SNAPSHOT_KEY);
        if (!raw) return;
        const snapshot = JSON.parse(raw);
        const isFresh = snapshot?.ts && (Date.now() - snapshot.ts) < 10 * 60 * 1000;
        const currentUrl = window.location.pathname + window.location.search;
        if (!isFresh || !snapshot?.url || snapshot.url !== currentUrl) return;
        if (Number.isFinite(snapshot.visibleChunks) && snapshot.visibleChunks > 1) {
            state.visibleChunks = snapshot.visibleChunks;
        }
        if (Number.isFinite(snapshot.scrollY) && snapshot.scrollY > 0) {
            state.scrollPos = snapshot.scrollY;
            state.skipScroll = true;
            setTimeout(() => {
                window.scrollTo({ top: snapshot.scrollY, behavior: 'auto' });
            }, 0);
        }
        sessionStorage.removeItem(HOME_SNAPSHOT_KEY);
    } catch (e) {
        sessionStorage.removeItem(HOME_SNAPSHOT_KEY);
    }
}

window.viewDetail = (id, skipHistory = false, preSelect = null, skipTracking = false) => {
    if (!id) return;
    if (!isStandaloneDetailPage()) {
        cacheHomeSnapshot();
        cacheDetailPayload(id);
        window.preloadProductImage(id, 'high');
        window.location.href = getProductDetailUrl(id);
    }
};

// Admin item editors are lazy-loaded from app-admin.js

const createAdminProxy = createAdminProxyFactory(() => ({
    db, auth, state, DATA, appId,
    prodCol, catCol, sliderCol, megaCol,
    popupSettingsCol, landingSettingsCol, leadsCol,
    doc, setDoc, addDoc, deleteDoc, updateDoc, getDoc, getDocs,
    collection, increment, writeBatch, arrayUnion,
    query, where, documentId,
    showToast, refreshData, renderHome, getAuth,
    getBadgeLabel, getOptimizedUrl, getColumnsCount,
    renderSlider, renderInsights
}));

window.saveProduct = createAdminProxy('saveProduct');
window.saveCategory = createAdminProxy('saveCategory');
window.deleteProduct = createAdminProxy('deleteProduct');
window.deleteCategory = createAdminProxy('deleteCategory');
window.saveMegaMenu = createAdminProxy('saveMegaMenu');
window.deleteMegaMenu = createAdminProxy('deleteMegaMenu');
window.editMegaMenu = createAdminProxy('editMegaMenu');
window.addColorVariationRow = createAdminProxy('addColorVariationRow');
window.addVariationRow = createAdminProxy('addVariationRow');

window.editProduct = createAdminProxy('editProduct');
window.editCategory = createAdminProxy('editCategory');
window.exportData = createAdminProxy('exportData');
window.exportExcel = createAdminProxy('exportExcel');
window.copyUniversalJSON = createAdminProxy('copyUniversalJSON');
window.importData = createAdminProxy('importData');

window.sendBulkInquiry = () => {
    // Customer flow: bulk inquiry is for Favorites only (selection/share moved to shop page).
    const sourceData = state.wishlist || [];
    if (sourceData.length === 0) return showToast("No items saved");

    let msg = `*Hello Speed Gifts!*\nI am interested in these items from my Favorites:\n\n`;

    sourceData.forEach((entry, i) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const p = DATA.p.find(x => x.id === id);
        if (!p) return;

        let details = "";
        const price = (entry.var && entry.var.price) ? entry.var.price : p.price;
        if (entry.var) {
            if (entry.var.size) details += ` (Size: ${entry.var.size})`;
            if (entry.var.color) details += ` (Color: ${entry.var.color})`;
        }

        const pUrl = getProductDetailUrl(id);
        msg += `${i + 1}. *${p.name}* - ${price} AED${details}\nLink: ${pUrl}\n\n`;
    });

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    const productIdsToTrack = sourceData.map(entry => typeof entry === 'string' ? entry : entry.id);
    window.trackWhatsAppInquiry(productIdsToTrack);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.inquireOnWhatsApp = (id, selectedSize = null, selectedPrice = null, selectedColor = null) => {
    const p = DATA.p.find(x => x.id === id);
    if (!p) return;
    const pUrl = getProductDetailUrl(p.id);
    const price = selectedPrice || p.price;
    let details = "";
    if (selectedSize) details += `\n*Size:* ${selectedSize}`;
    if (selectedColor) details += `\n*Color:* ${selectedColor}`;
    if (!selectedSize && !selectedColor && p.size) details += `\n*Size:* ${p.size}`;

    let msg = `*Inquiry regarding:* ${p.name}\n*Price:* ${price} AED${details}\n\n*Product Link:* ${pUrl}\n\nPlease let me know the availability.`;

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    window.trackWhatsAppInquiry(p.id);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.handleFloatingWhatsAppClick = () => {
    let msg = `*Hello Speed Gifts!* \nI visited your website and would like to know more about your premium gift collections.`;

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n\n*Note: Customer joined via Google Ads* 🔍`;
    }

    // Tracking the inquiry specifically from the floating button
    window.trackWhatsAppInquiry('floating_button');
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.renderAdminUI = createAdminProxy('renderAdminUI');

window.handleCategoryRowScroll = (el) => {
    const container = el.parentElement;
    if (!container) return;
    const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
    if (isAtEnd) container.classList.add('scrolled-end');
    else container.classList.remove('scrolled-end');

    // Update progress bar
    const bar = document.getElementById('cat-scroll-bar');
    if (bar && el.scrollWidth > el.clientWidth) {
        const scrollRatio = el.scrollLeft / (el.scrollWidth - el.clientWidth);
        // Bar goes from 20% (at start) to 100% (at end)
        const barWidth = 20 + scrollRatio * 80;
        bar.style.width = barWidth + '%';
    }
};

window.applyFilter = (id, e) => {
    if (e) e.stopPropagation();
    const params = new URLSearchParams();
    if (id && id !== 'all') params.set('c', id);
    const target = `shop.html${params.toString() ? `?${params.toString()}` : ''}`;
    window.location.href = target;
};

function openShopWithSearch(query) {
    const q = (query || '').trim();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    window.location.href = `shop.html${params.toString() ? `?${params.toString()}` : ''}`;
}
window.showSearchSuggestions = (show) => {
    // Both desktop and mobile search tags are scoped by IDs globally now
    // the desktop search tags might have a different ID, but mobile is 'search-tags'
    const tags = document.getElementById('search-tags');
    if (tags) {
        if (show) tags.classList.remove('hidden');
        else setTimeout(() => {
            const currentTags = document.getElementById('search-tags');
            if (currentTags) currentTags.classList.add('hidden');
        }, 200);
    }
};
let searchTimeout;
window.applyCustomerSearch = (val) => {
    const query = (val || '').trim();
    state.search = query; // Keep typed text visible until navigation happens.
    // Do not auto-navigate while typing on home.
    // Navigation is handled only on Enter key (see initSearchListeners).
    clearTimeout(searchTimeout);

    // Update Clear Button UI immediately with safety
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
        if (query) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    const deskClearBtn = document.getElementById('desk-clear-btn');
    if (deskClearBtn) {
        if (query) deskClearBtn.classList.remove('hidden');
        else deskClearBtn.classList.add('hidden');
    }
};
window.clearCustomerSearch = () => {
    state.search = '';
    const input = document.getElementById('customer-search');
    const deskInput = document.getElementById('desk-search');
    if (input) { input.value = ''; input.blur(); }
    if (deskInput) deskInput.value = '';
    // Clear the clear buttons
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const deskClearBtn = document.getElementById('desk-clear-btn');
    if (deskClearBtn) deskClearBtn.classList.add('hidden');
};
window.applyPriceSort = (sort) => { state.sort = sort; renderHome(); };
window.toggleHomeBestView = (expand) => {
    state.homeBestExpanded = !!expand;
    state.skipScroll = true;
    renderHome();
    // UX: when collapsing, bring the user back to the bestsellers heading.
    if (!expand) {
        setTimeout(() => {
            const title = document.getElementById('active-category-title');
            if (!title) return;
            const yOffset = -120;
            const y = title.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        }, 60);
    }
};

window.showAdminPanel = createAdminProxy('showAdminPanel');
window.hideAdminPanel = createAdminProxy('hideAdminPanel');
window.toggleSidebarGroup = createAdminProxy('toggleSidebarGroup');
window.expandSidebarGroupForTab = createAdminProxy('expandSidebarGroupForTab');
window.switchAdminTab = createAdminProxy('switchAdminTab');

/* CATEGORY PICKER LOGIC */

function populateCatSelect() {
    const selects = [document.getElementById('p-cat-id'), document.getElementById('landing-sec1-cat'), document.getElementById('landing-sec2-cat'), document.getElementById('spotlight-cat-id')];

    const optionsHtml = `<option value="">Select Category</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    selects.forEach(select => {
        if (select) select.innerHTML = optionsHtml;
    });
}

function populateAdminCatFilter() {
    const select = document.getElementById('admin-cat-filter');
    if (select) select.innerHTML = `<option value="all">All Categories</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

window.resetForm = createAdminProxy('resetForm');
window.addImageToGrid = createAdminProxy('addImageToGrid');
window.handleMultiDrop = createAdminProxy('handleMultiDrop');
window.cloudinaryMultiUpload = createAdminProxy('cloudinaryMultiUpload');
window.handleDragOver = createAdminProxy('handleDragOver');
window.handleDragLeave = createAdminProxy('handleDragLeave');
window.handleDrop = createAdminProxy('handleDrop');
window.handleVariationDrop = createAdminProxy('handleVariationDrop');
window.cloudinaryUpload = createAdminProxy('cloudinaryUpload');
window.cloudinaryUploadForVariation = createAdminProxy('cloudinaryUploadForVariation');

function showToast(msg) {
    const t = document.getElementById('toast'); if (!t) return;
    t.innerText = msg; t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
}

window.shareProduct = async (id, name) => {
    const url = getProductDetailUrl(id);
    if (navigator.share) {
        try {
            await navigator.share({ title: name, url: url });
        } catch (err) { console.log('Share Cancelled'); }
    } else {
        try {
            await navigator.clipboard.writeText(url);
            showToast("Link Copied to Clipboard");
        } catch (err) { showToast("Copy Failed"); }
    }
};

window.handleFavoritesClick = () => {
    window.openFavoritesSidebar();
};

window.openFavoritesSidebar = () => {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (sidebar && overlay) {
        renderFavoritesSidebar();
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeFavoritesSidebar = () => {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

window.openCategoriesSidebar = () => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (sidebar && overlay) {
        renderCategoriesSidebar();
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeCategoriesSidebar = () => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

window.renderCategoriesSidebar = () => {
    renderCategoriesSidebarMainLike({
        categories: DATA.c,
        products: DATA.p,
        getOptimizedUrl,
        onSelectCategoryJs: "window.closeCategoriesSidebar();"
    });
};

// End of sidebar functions (cleaned duplicates)


window.renderFavoritesSidebar = () => {
    renderFavoritesSidebarMainLike({
        wishlist: state.wishlist,
        products: DATA.p,
        getOptimizedUrl,
        onItemClickJs: (p) => `window.closeFavoritesSidebar(); viewDetail('${p.originalId}', false, ${p.preSelect ? JSON.stringify(p.preSelect) : 'null'})`,
        onRemoveClickJs: (p) => `window.toggleWishlist(null, '${p.originalId}')`
    });
};

window.preloadProductImage = (id, priority = 'low') => {
    const p = DATA.p.find(x => x.id === id);
    if (!p || p._preloaded) return;
    const imgUrl = getOptimizedUrl(p.images?.[0] || p.img, window.innerWidth < 768 ? 600 : 1200);
    const img = new Image();
    if (priority === 'high') img.fetchPriority = 'high';
    img.src = imgUrl;
    p._preloaded = true;
};

// Aggressively preload first 8 products for "instant" feel
// Aggressively preload sliders and first 8 products for "instant" feel
window.preloadInitialBatch = () => {
    // 1. Preload only first few sliders to reduce startup pressure.
    if (DATA.s && DATA.s.length) {
        DATA.s.slice(0, INITIAL_PRELOAD_SLIDERS).forEach(s => {
            const isMobile = window.innerWidth < 768;
            const imgUrl = getOptimizedUrl(isMobile ? s.mobileImg : s.img, isMobile ? 1200 : 1920);
            const img = new Image();
            img.fetchPriority = 'low';
            img.src = imgUrl;
        });
    }
    // 2. Preload only top likely-click products.
    if (DATA.p && DATA.p.length) {
        DATA.p.slice(0, INITIAL_PRELOAD_PRODUCTS).forEach(p => window.preloadProductImage(p.id, 'low'));
    }
};

let homeCriticalAssetsPrimed = false;
function primeHomeCriticalAssets() {
    if (homeCriticalAssetsPrimed) return;
    homeCriticalAssetsPrimed = true;
    try {
        const ensurePreconnect = (href) => {
            if (!href || document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = href;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        };
        ensurePreconnect('https://res.cloudinary.com');
        ensurePreconnect('https://api.cloudinary.com');

        const prime = (src, priority = 'high') => {
            if (!src) return;
            const img = new Image();
            img.fetchPriority = priority;
            img.decoding = 'async';
            img.src = src;
        };

        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        const firstSlider = (DATA.s || []).find((s) => {
            const candidate = isMobile ? s?.mobileImg : s?.img;
            return candidate && candidate !== 'img/';
        });
        if (firstSlider) {
            const sliderSrc = getOptimizedUrl(isMobile ? firstSlider.mobileImg : firstSlider.img, isMobile ? 1200 : 1920);
            prime(sliderSrc, 'high');
        }

        (DATA.c || []).slice(0, INITIAL_EAGER_CATEGORY_IMAGES).forEach((c) => {
            const src = getOptimizedUrl(c?.img, 200);
            if (src) prime(src, 'high');
        });
    } catch (e) {
        // Non-blocking warmup path
    }
}


function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string') return '';
    if (!url.includes('cloudinary.com')) return url;

    const baseTransform = 'f_auto,q_auto';
    const widthTransform = width ? `,w_${width},c_limit` : '';
    const fullTransform = baseTransform + widthTransform;

    if (url.includes('/upload/f_auto,q_auto')) {
        if (width && !url.includes(',w_')) {
            return url.replace('/upload/f_auto,q_auto', `/upload/${fullTransform}`);
        }
        return url;
    }

    return url.replace('/upload/', `/upload/${fullTransform}/`);
}

// Fallback: If Cloudinary transform URL fails, retry with original URL
window.handleImgError = function (img) {
    if (img._retried) return; // Avoid infinite loop
    img._retried = true;
    const src = img.src || '';
    if (!src.includes('cloudinary.com')) {
        img.classList.add('loaded');
        if (!img.src || img.src.endsWith('/img/') || img.src === 'img/' || img.src === window.location.href) {
            img.src = 'https://placehold.co/800x800?text=Image';
        }
        return;
    }
    // Strip all transforms and load the raw original URL
    const originalUrl = src.replace(/\/upload\/[^/]+\//, '/upload/');
    if (originalUrl !== src) {
        img.src = originalUrl;
    } else {
        img.classList.add('loaded');
    }
};

function ensureGridImagesVisible(gridEl) {
    if (!gridEl) return;
    const imgs = gridEl.querySelectorAll('img');
    imgs.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add('loaded');
        }
    });
}


async function trackProductView(id) {
    if (!id || typeof id !== 'string') return;
    const today = getTodayStr();
    const sessionKey = `product_view_tracked_${today}_${id}`;

    // Strict Synchronous Guard to prevent double/triple counting
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    console.log(`[Traffic] Product interaction tracking triggered: ${id}. waiting for auth...`);
    await waitForAuth();

    try {
        const isAd = sessionStorage.getItem('traffic_source') === 'Google Ads';

        // 1. Update Global Stats (Product Journey Pillar)
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        const globalField = isAd ? 'adProductClicks' : 'normalProductClicks';

        // 2. Update Per-Product Stats (Top Items)
        const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
        const prodField = isAd ? 'adViews' : 'views';

        // Perform both updates (Batch would be cleaner but setDoc merge is fine here)
        await Promise.all([
            setDoc(statsRef, { [globalField]: increment(1) }, { merge: true }),
            setDoc(dailyProdRef, { [prodField]: increment(1), productId: id, date: today }, { merge: true })
        ]);

        console.log(`[Traffic] ${isAd ? 'AD' : 'Normal'} Product view recorded for: ${id}`);
    } catch (e) {
        console.error("[Traffic] Consolidated tracking failed:", e);
    }
}

function getBadgeLabel(badge) {
    const labels = {
        'new': 'New Arrival',
        'best': 'Best Seller',
        'limited': 'Limited Stock',
        'sale': 'On Sale',
        'trending': 'Trending'
    };
    return labels[badge] || badge;
}

function renderInsights(container, rangeData = null) {
    // 1. Auto-fetch Today's detailed stats in background if first open
    if (!rangeData) {
        const today = getTodayStr();
        window.updateInsightsRange(today, today, true);
    }

    // 2. Data Aggregation
    const source = rangeData || {
        stats: DATA.stats || {},
        p: DATA.p || []
    };

    // Use current in-memory stats if no range is selected
    const today = getTodayStr();

    // Calculate total views for health rate. If range, use range products. If all-time, use all products.
    const totalViews = source.p.reduce((acc, p) => acc + (p.views || 0) + (p.adViews || 0), 0);
    const adVisits = source.stats.adVisits || 0;
    const normalVisits = source.stats.normalVisits || 0;
    const adProductClicks = source.stats.adProductClicks || 0;
    const normalProductClicks = source.stats.normalProductClicks || 0;
    const adInquiries = source.stats.adInquiries || 0;
    const imageFail = source.stats.imageLoadFail || 0;

    // 2. Calculations
    const adJourneyPercent = adVisits ? Math.round((adProductClicks / adVisits) * 100) : 0;
    const normalJourneyPercent = normalVisits ? Math.round((normalProductClicks / normalVisits) * 100) : 0;
    const leadRate = adVisits ? ((adInquiries / adVisits) * 100).toFixed(1) : 0;
    const healthRate = totalViews ? Math.max(0, Math.min(100, 100 - (imageFail / totalViews * 100))).toFixed(1) : 100;

    const topProducts = [...source.p]
        .filter(p => (p.views || 0) > 0 || (p.adInquiries || 0) > 0 || (p.adViews || 0) > 0 || (p.adImpressions || 0) > 0)
        .sort((a, b) => ((b.views || 0) + (b.adViews || 0)) - ((a.views || 0) + (a.adViews || 0)))
        .slice(0, 50); // Show more in detailed view

    // Default dates for pickers
    const defaultStart = rangeData?.startDate || today;
    const defaultEnd = rangeData?.endDate || today;

    // Error Alert if any
    const errorAlert = source.error ? `
        <div class="bg-red-50 text-red-600 px-6 py-2 rounded-full text-[9px] font-bold uppercase tracking-widest mb-6 flex items-center justify-center gap-2 border border-red-100 w-fit mx-auto animate-bounce">
            <i class="fa-solid fa-circle-exclamation"></i>
            Live sync delayed. Refreshing...
        </div>` : '';

    let html = `
        <div class="space-y-6 px-16">
            ${errorAlert}
            <!-- Header with Compact Controls -->
            <div class="flex justify-between items-center mb-10">
                <h2 class="text-[16px] font-bold text-gray-800 tracking-tight">Insights Dashboard</h2>
                
                <div class="flex items-center gap-4">
                    <!-- Symmetrical Simple Date Filter -->
                    <div class="flex items-center gap-6 bg-white px-8 py-2 rounded-full border border-gray-100 shadow-sm">
                        <div class="flex items-center gap-3">
                            <input type="date" id="insights-start" value="${defaultStart}" class="bg-transparent border-none text-[11px] font-bold text-gray-700 focus:ring-0 p-0 w-32 text-center">
                            <span class="text-gray-300 text-[10px] uppercase font-black">to</span>
                            <input type="date" id="insights-end" value="${defaultEnd}" class="bg-transparent border-none text-[11px] font-bold text-gray-700 focus:ring-0 p-0 w-32 text-center">
                        </div>
                        
                        <div class="flex items-center gap-3">
                            <button onclick="updateInsightsRange()" id="update-range-btn" class="px-5 py-2 bg-black text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                                Update
                            </button>
                            
                            ${rangeData ? `
                                <button title="Clear Filter" onclick="renderInsights(document.getElementById('admin-insights-list'))" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all">
                                    <i class="fa-solid fa-xmark text-[11px]"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <button onclick="resetInsightsData()" class="px-6 py-2 bg-red-50 text-red-600 rounded-full text-[10px] font-bold hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100 uppercase tracking-widest">
                        <i class="fa-solid fa-rotate-left"></i>
                        Reset
                    </button>
                </div>
            </div>

            <!-- PILLARS 1, 2, 3 & 4: TRAFFIC, JOURNEY, LEADS & HEALTH -->
            <div class="grid gap-4" style="grid-template-columns: repeat(4, 1fr);">
                <!-- Website Visitor Card -->
                <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <h5 class="text-[11px] font-semibold text-gray-400 mb-4">Website Visitor</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="border-r border-gray-50 pr-4">
                            <p class="text-[26px] font-semibold text-blue-600 leading-none">${adVisits}</p>
                            <p class="text-[11px] font-medium text-blue-300 mt-1">AD Customer</p>
                        </div>
                        <div class="pl-4">
                            <p class="text-[26px] font-semibold text-green-600 leading-none">${normalVisits}</p>
                            <p class="text-[11px] font-medium text-green-300 mt-1">OG Customer</p>
                        </div>
                    </div>
                </div>

                <!-- Product Detail Page Visitors Card -->
                <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <h5 class="text-[11px] font-semibold text-gray-400 mb-4">Product Journey</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="border-r border-gray-50 pr-4">
                            <p class="text-[26px] font-semibold text-blue-600 leading-none">${adProductClicks}</p>
                            <p class="text-[11px] font-medium text-blue-300 mt-1">AD Customer</p>
                        </div>
                        <div class="pl-4">
                            <p class="text-[26px] font-semibold text-green-600 leading-none">${normalProductClicks}</p>
                            <p class="text-[11px] font-medium text-green-300 mt-1">OG Customer</p>
                        </div>
                    </div>
                </div>

                <!-- Leads Card -->
                <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <h5 class="text-[11px] font-semibold text-gray-400 mb-4">Google AD Leads</h5>
                    <p class="text-[26px] font-semibold text-blue-600 leading-none">${adInquiries}</p>
                    <p class="text-[11px] font-medium text-blue-300 mt-1">Conversion: ${leadRate}%</p>
                </div>

                <!-- Website Health Card -->
                <div class="bg-black p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-4">
                        <h5 class="text-[11px] font-semibold text-gray-400">Website Health</h5>
                        ${(imageFail > 0 || (source.stats.brokenImages || []).length > 0) ? `<button onclick="window.clearHealthErrors()" title="Clear error count" style="background:rgba(255,255,255,0.08);border:none;cursor:pointer;border-radius:999px;padding:4px 10px;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)';this.style.color='#f87171'" onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.color='#9ca3af'">
                            <i class="fa-solid fa-rotate-left" style="margin-right:4px;"></i>Clear
                        </button>` : ''}
                    </div>
                    <p class="text-[26px] font-semibold leading-none ${imageFail === 0 ? 'text-green-400' : imageFail <= 10 ? 'text-yellow-400' : imageFail <= 30 ? 'text-orange-400' : 'text-red-400'}">
                        ${imageFail === 0 ? '✓ Clean' : imageFail + ' Errors'}
                    </p>
                    <p class="text-[11px] font-medium text-gray-500 mt-1">
                        ${imageFail === 0 ? 'All assets loading fine' : imageFail <= 10 ? 'Minor — a few broken images' : imageFail <= 30 ? 'Fair — check product images' : 'Action needed — many broken images'}
                    </p>
                    ${(source.stats.brokenImages || []).length > 0 ? `
                    <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                        <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Broken Image URLs</p>
                        <div style="display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto;">
                            ${(source.stats.brokenImages || []).map(url => {
        // Try to match URL to a product or category name
        const matchedProd = DATA.p.find(p => p.img && url.includes(p.img.split('/').pop().split('?')[0]));
        const matchedCat = DATA.c.find(c => c.img && url.includes(c.img.split('/').pop().split('?')[0]));
        const label = matchedProd ? matchedProd.name : matchedCat ? matchedCat.name + ' (Category)' : url.split('/').pop().split('?')[0].substring(0, 30);
        return `<div style="display:flex;align-items:center;gap:8px;background:rgba(239,68,68,0.1);border-radius:8px;padding:6px 8px;">
                                    <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;font-size:9px;flex-shrink:0;"></i>
                                    <span style="font-size:9px;font-weight:600;color:#d1d5db;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${url}">${label}</span>
                                </div>`;
    }).join('')}
                        </div>
                    </div>` : ''}
                </div>
            </div>

            <!-- Top Products Table -->
            <div class="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-50">
                    <h5 class="text-[12px] font-semibold text-gray-400">Top Performing Items</h5>
                </div>
                <div class="divide-y divide-gray-50">
                    ${topProducts.map((p, i) => `
                        <div class="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors group">
                            <div class="text-[11px] font-medium text-gray-300 w-4">${i + 1}</div>
                            <img src="${getOptimizedUrl(p.img, 100)}" class="w-10 h-10 rounded-xl object-cover shadow-sm">
                            <div class="flex-1">
                                <p class="text-[13px] font-medium text-gray-800 truncate">${p.name}</p>
                                <p class="text-[10px] font-medium text-gray-400">${DATA.c.find(c => c.id === p.catId)?.name || 'General'}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[12px] font-semibold text-green-600">${p.views || 0}</p>
                                <p class="text-[9px] font-medium text-green-400 leading-tight">Og clicks</p>
                            </div>
                            <!-- Ad Views (Clicks) column - Blue -->
                            <div class="text-right pl-3 border-l border-gray-50 min-w-[35px]">
                                <p class="text-[12px] font-semibold text-blue-600">${p.adViews || 0}</p>
                                <p class="text-[9px] font-medium text-blue-300 leading-tight">Ad clicks</p>
                            </div>
                            <div class="text-right pl-3 border-l border-gray-50 min-w-[45px]">
                                <p class="text-[12px] font-semibold text-blue-600">${p.adInquiries || 0}</p>
                                <p class="text-[9px] font-medium text-blue-200 leading-tight">Ad leads</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

window.updateInsightsRange = async function (passedStart = null, passedEnd = null, isSilent = false) {
    if (typeof passedStart !== 'string') passedStart = null;
    if (typeof passedEnd !== 'string') passedEnd = null;
    const start = passedStart || document.getElementById('insights-start')?.value;
    const end = passedEnd || document.getElementById('insights-end')?.value;
    const btn = document.getElementById('update-range-btn');

    if (!start || !end) {
        if (!isSilent) alert("Please select both dates.");
        return;
    }

    if (!isSilent && btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Fetching...';
    }

    try {
        console.log(`[Insights] Fetching range: ${start} to ${end}`);
        // 1. Fetch Global Stats
        // Firebase documentId() inequality queries require full document paths.
        // To avoid issues with existing data, we fetch all daily_stats (1 doc/day) and filter locally.
        const globalRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_stats');
        const globalSnap = await getDocs(globalRef);

        const aggregatedStats = {
            adVisits: 0, normalVisits: 0, adProductClicks: 0,
            normalProductClicks: 0, adInquiries: 0, imageLoadFail: 0,
            landingAdVisits: 0, brokenImages: []
        };

        globalSnap.forEach(doc => {
            const docId = doc.id;
            // Filter by date range in memory
            if (docId >= start && docId <= end) {
                const d = doc.data();
                aggregatedStats.adVisits += (d.adVisits || 0);
                aggregatedStats.normalVisits += (d.normalVisits || 0);
                aggregatedStats.landingAdVisits += (d.landingAdVisits || 0);
                aggregatedStats.adProductClicks += (d.adProductClicks || 0);
                aggregatedStats.normalProductClicks += (d.normalProductClicks || 0);
                aggregatedStats.adInquiries += (d.adInquiries || 0);
                aggregatedStats.imageLoadFail += (d.imageLoadFail || d.imageFail || 0);
                // Collect all unique broken image URLs across the range
                if (Array.isArray(d.brokenImages)) {
                    d.brokenImages.forEach(u => {
                        if (!aggregatedStats.brokenImages.includes(u)) aggregatedStats.brokenImages.push(u);
                    });
                }
            }
        });

        // Combine landing page hits into AD traffic for a unified view
        aggregatedStats.adVisits = (aggregatedStats.adVisits || 0) + (aggregatedStats.landingAdVisits || 0);

        // 2. Fetch Product Stats
        const prodRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats');
        const qProd = query(prodRef, where("date", ">=", start), where("date", "<=", end));
        const prodSnap = await getDocs(qProd);

        const prodMap = {}; // productId -> combined stats
        prodSnap.forEach(doc => {
            const d = doc.data();
            const pid = d.productId;
            if (!pid) return;
            if (!prodMap[pid]) {
                const specialNames = { 'floating_button': 'Main Floating WhatsApp', 'landing_floating': 'Landing Floating WhatsApp', 'bulk_inquiry': 'Cart Checkout Inquiry' };
                const original = DATA.p.find(p => p.id === pid) || { name: specialNames[pid] || 'Unknown', img: '', catId: '' };
                prodMap[pid] = { ...original, views: 0, adViews: 0, adInquiries: 0 };
            }
            prodMap[pid].views += (d.views || 0);
            prodMap[pid].adViews += (d.adViews || 0);
            prodMap[pid].adInquiries += (d.adInquiries || 0);
        });

        const rangeData = {
            stats: aggregatedStats,
            p: Object.values(prodMap),
            startDate: start,
            endDate: end
        };

        console.log("[Insights] Data aggregated, rendering...", rangeData.stats);
        const container = document.getElementById('admin-insights-list');
        if (container) renderInsights(container, rangeData);

    } catch (e) {
        console.error("[Insights] Range update error:", e);
        if (!isSilent) alert("Failed to fetch range data. Please try again.");

        // RECOVERY: Even if it fails, try to show the dashboard with whatever local data we have to clear the spinner.
        const container = document.getElementById('admin-insights-list');
        if (container && container.innerHTML.includes('animate-spin')) {
            renderInsights(container, {
                stats: { adVisits: 0, normalVisits: 0, adProductClicks: 0, normalProductClicks: 0, adInquiries: 0, imageLoadFail: 0 },
                p: [],
                startDate: start,
                endDate: end,
                error: true
            });
        }
    } finally {
        if (!isSilent && btn) {
            btn.disabled = false;
            btn.innerText = 'Update View';
        }
    }
}




window.resetAdTraffic = async () => {
    if (!confirm("Are you sure you want to reset all Ad Traffic, Impressions, and Session data?")) return;
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(statsRef, {
            adVisits: 0,
            adInquiries: 0,
            adImpressions: 0,
            totalSessionSeconds: 0,
            adHops: 0,
            normalVisits: 0,
            adProductClicks: 0,
            normalProductClicks: 0,
            imageLoadFail: 0
        }, { merge: true });
        DATA.stats.adVisits = 0;
        DATA.stats.adInquiries = 0;
        DATA.stats.adImpressions = 0;
        DATA.stats.totalSessionSeconds = 0;
        DATA.stats.adHops = 0;
        DATA.stats.normalVisits = 0;
        DATA.stats.adProductClicks = 0;
        DATA.stats.normalProductClicks = 0;
        DATA.stats.imageLoadFail = 0;
        renderAdminUI();
        showToast("Ad Data Reset Successfully");
    } catch (e) {
        console.error("Reset Error:", e);
        showToast("Error resetting data");
    }
};

// Clear today's image error count (used by admin health card "Clear" button)
window.clearHealthErrors = async () => {
    try {
        const today = getTodayStr();
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        await setDoc(statsRef, { imageLoadFail: 0, brokenImages: [] }, { merge: true });

        // Also clear legacy/all-time counter
        const legacyRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(legacyRef, { imageLoadFail: 0, brokenImages: [] }, { merge: true });

        // Clear in-memory tracking so fresh errors are counted from now
        DATA.stats.imageLoadFail = 0;
        DATA.stats.brokenImages = [];
        _errorTrackedUrls.clear();

        // Re-render the admin UI so health card updates immediately
        const container = document.getElementById('admin-insights-list');
        if (container) {
            window.updateInsightsRange(today, today, false);
        }
        showToast("Health errors cleared ✓");
    } catch (e) {
        console.error("Clear Health Error:", e);
        showToast("Failed to clear errors");
    }
};

window.resetAllAnalytics = async () => {
    if (!confirm("CRITICAL: This will reset ALL VIEWS, AD TRAFFIC, IMPRESSIONS, and LEADS. This cannot be undone. Proceed?")) return;

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        const batch = writeBatch(db);

        // 1. Reset Global Ad Stats
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        batch.set(statsRef, { adVisits: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0, adHops: 0 }, { merge: true });

        // 2. Reset All Products (Views, AdViews, AdInquiries, AdImpressions)
        const products = DATA.p;
        products.forEach(p => {
            const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
            batch.update(pRef, { views: 0, adViews: 0, adInquiries: 0, adImpressions: 0 });
        });

        await batch.commit();

        // Update Local memory
        DATA.stats.adVisits = 0;
        DATA.stats.adInquiries = 0;
        DATA.stats.adImpressions = 0;
        DATA.stats.totalSessionSeconds = 0;
        DATA.stats.adHops = 0;
        DATA.p.forEach(p => {
            p.views = 0;
            p.adViews = 0;
            p.adInquiries = 0;
            p.adImpressions = 0;
        });

        renderAdminUI();
        showToast("All Analytics Reset to Zero");
    } catch (e) {
        console.error("Master Reset Error:", e);
        showToast("Error during Master Reset");
    } finally {
        if (loader) loader.style.display = 'none';
    }
};

window.focusSearch = () => {
    // Navigate home first if we're not there
    if (new URLSearchParams(window.location.search).has('p')) {
        window.goBackToHome(true);
    }

    setTimeout(() => {
        const searchInput = document.getElementById('customer-search');
        if (!searchInput) return;

        // Ensure the container is visible (renderSlider can hide it based on state)
        const topElements = document.getElementById('home-top-elements');
        if (topElements) topElements.classList.remove('hidden');
        const searchContainer = document.getElementById('customer-search-container');
        if (searchContainer) searchContainer.classList.remove('hidden');

        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        searchInput.focus();
    }, 300);
};

// SLIDER LOGIC
let sliderInterval;
let currentSlide = 0;
let sliderMarkupKey = '';

function renderSlider() {
    const wrapper = document.getElementById('home-top-elements');
    const container = document.getElementById('home-slider-container');
    const slider = document.getElementById('home-slider');
    const dots = document.getElementById('slider-dots');

    // Safety: always hide slider when a product detail is open (?p= in URL)
    const isProductDetail = new URLSearchParams(window.location.search).has('p');
    if (!slider || !DATA.s.length || isProductDetail || state.filter !== 'all') {
        if (wrapper) wrapper.classList.add('hidden');
        sliderMarkupKey = '';
        return;
    }

    // When search is active, only hide the slider container — keep the mobile search bar visible
    if (state.search) {
        if (container) container.classList.add('hidden');
        // Keep the wrapper visible so the mobile search bar (md:hidden) stays accessible
        if (wrapper) wrapper.classList.remove('hidden');
        return;
    }

    if (container) container.classList.remove('hidden');
    if (wrapper) wrapper.classList.remove('hidden');

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const sortedSliders = [...DATA.s].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    // RELAXED FILTERING: Block only the default placeholder
    const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';

    const visibleSliders = sortedSliders.filter(s => {
        const hasMobile = isUrl(s.mobileImg);
        const hasDesktop = isUrl(s.img);
        return isMobile ? hasMobile : hasDesktop;
    });

    if (!visibleSliders.length) {
        if (container) container.classList.add('hidden');
        sliderMarkupKey = '';
        return;
    }

    // Avoid rebuilding slider markup when data/layout is unchanged (prevents white blink on mobile).
    const nextMarkupKey = [
        isMobile ? 'm' : 'd',
        ...visibleSliders.map((s) => `${s.id || ''}|${isMobile ? (s.mobileImg || '') : (s.img || '')}|${s.title || ''}|${s.link || ''}`)
    ].join('::');
    const canReuseMarkup = sliderMarkupKey === nextMarkupKey && slider.children.length === visibleSliders.length;
    if (canReuseMarkup) {
        if (container) container.classList.remove('hidden');
        if (wrapper) wrapper.classList.remove('hidden');
        return;
    }

    slider.innerHTML = visibleSliders.map((s, i) => {
        const displayImg = isMobile ? s.mobileImg : s.img;

        // Exact original mobile overlay vs New premium desktop overlay
        const overlayHTML = s.title ? (isMobile
            ? `<div class="absolute bottom-12 left-8 text-white z-20">
                 <h2 class="text-2xl font-black uppercase tracking-tighter">${s.title}</h2>
               </div>`
            : `<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex items-end pb-14 pl-16 z-20 pointer-events-none">
                 <h2 class="text-5xl lg:text-5xl font-black text-white uppercase tracking-[-0.03em] drop-shadow-md max-w-2xl leading-[1]">${s.title}</h2>
               </div>`
        ) : '';

        return `
            <div class="slider-slide relative" data-index="${i}">
                <img src="${getOptimizedUrl(displayImg, isMobile ? 1200 : 1920)}" 
                     class="${i === 0 ? 'no-animation' : ''} w-full h-full object-cover"
                     alt="${s.title || ''}" 
                     ${i === 0 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                     onclick="${s.link ? `window.open('${s.link}', '_blank')` : ''}" 
                     style="${s.link ? 'cursor:pointer' : ''}"
                     draggable="false">
                ${overlayHTML}
            </div>
        `;
    }).join('');
    sliderMarkupKey = nextMarkupKey;

    if (dots) {
        dots.innerHTML = visibleSliders.map((_, i) => `
            <div class="slider-dot ${i === 0 ? 'active' : ''}" onclick="window.goToSlide(${i})"></div>
        `).join('');
    }

    currentSlide = 0;
    startSliderAutoPlay();

    // Sync dots on manual scroll/swipe
    slider.onscroll = () => {
        const index = Math.round(slider.scrollLeft / slider.offsetWidth);
        if (index !== currentSlide && !isNaN(index)) {
            currentSlide = index;
            const allDots = dots.querySelectorAll('.slider-dot');
            allDots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlide);
            });
            // Reset autoplay timer when user interacts manually
            startSliderAutoPlay();
        }
    };

    // Desktop Mouse Drag Support — disabled on mobile to prevent interference with vertical scrolling
    if (!isMobile) initSliderDrag(slider);
}

// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP SLIDER DRAG — click-and-drag for better desktop UX
// ─────────────────────────────────────────────────────────────────────────────
function initSliderDrag(slider) {
    if (!slider || slider._dragInitialized) return;
    slider._dragInitialized = true;

    let isDown = false;
    let startX = 0;
    let moveDistance = 0;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.clientX;
        moveDistance = 0;
        slider.style.cursor = 'grab';
    });

    slider.addEventListener('mouseup', (e) => {
        if (!isDown) return;
        isDown = false;

        const endX = e.clientX;
        const diff = endX - startX;
        moveDistance = Math.abs(diff);

        // TRIGGER ON RELEASE ONLY (Flick)
        if (moveDistance > 40) { // More sensitive for easier swiping
            if (diff > 0) {
                window.moveSlider(-1);
            } else {
                window.moveSlider(1);
            }
        }
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
    });

    slider.addEventListener('mousemove', (e) => {
        if (isDown) {
            e.preventDefault();
        }
    });

    slider.addEventListener('click', (e) => {
        if (moveDistance > 15) { // Threshold to distinguish click from swipe
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

window.moveSlider = (dir) => {
    const slider = document.getElementById('home-slider');
    if (!slider) return;
    const slides = slider.querySelectorAll('.slider-slide');
    currentSlide = (currentSlide + dir + slides.length) % slides.length;
    updateSliderUI();
};

window.goToSlide = (index) => {
    currentSlide = index;
    updateSliderUI();
};

function updateSliderUI() {
    const slider = document.getElementById('home-slider');
    const dots = document.querySelectorAll('.slider-dot');
    if (!slider) return;

    slider.scrollTo({
        left: slider.offsetWidth * currentSlide,
        behavior: 'smooth'
    });

    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });

    startSliderAutoPlay(); // Reset timer
}

function startSliderAutoPlay() {
    clearInterval(sliderInterval);
    sliderInterval = setInterval(() => {
        window.moveSlider(1);
    }, 5000);
}

// ADMIN SLIDER FUNCTIONS
window.saveSlider = createAdminProxy('saveSlider');
window.cloudinaryBulkSliderUpload = createAdminProxy('cloudinaryBulkSliderUpload');
window.handleSliderBulkDrop = createAdminProxy('handleSliderBulkDrop');
window.editSlider = createAdminProxy('editSlider');
window.deleteSlider = createAdminProxy('deleteSlider');

// ANNOUNCEMENT BAR LOGIC
let announcementInterval;
let currentAnnouncement = 0;

function renderAnnouncementBar() {
    const bar = document.getElementById('announcement-bar');
    const nav = document.querySelector('nav');
    if (!bar) return;

    let msgs = DATA.announcements || [];
    if (msgs.length === 0 || (msgs.length === 1 && msgs[0].trim() === "")) {
        bar.style.display = 'none';
        if (nav) nav.style.marginTop = '10px';
        return;
    }
    bar.style.display = 'flex';
    if (nav) nav.style.marginTop = '0px';

    bar.innerHTML = msgs.map((msg, idx) => `
        <div class="announcement-item ${idx === 0 ? 'active' : ''}">
            <span class="announcement-text">${msg}</span>
        </div>
    `).join('');

    initAnnouncementRotation();
}

function initAnnouncementRotation() {
    clearInterval(announcementInterval);
    const items = document.querySelectorAll('.announcement-item');
    if (items.length <= 1) return;

    announcementInterval = setInterval(() => {
        items[currentAnnouncement].classList.remove('active');
        currentAnnouncement = (currentAnnouncement + 1) % items.length;
        items[currentAnnouncement].classList.add('active');
    }, 3000);
}

// ADMIN ANNOUNCEMENTS
window.addAnnouncementRow = createAdminProxy('addAnnouncementRow');
window.saveAnnouncements = createAdminProxy('saveAnnouncements');

// Auth state and data fetching are handled by onAuthStateChanged.

// Responsive Slider Refresh
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (document.getElementById('home-slider-container')) {
            renderSlider();
        }
    }, 250);
});

// Smart Mobile Nav Scroll Behavior
let navScrollTimeout;
window.addEventListener('scroll', () => {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav || window.innerWidth >= 768) return;

    const currentScroll = window.pageYOffset;

    // Hide on down-scroll, show on up-scroll
    if (currentScroll > state.scrollPos && currentScroll > 60) {
        nav.classList.add('nav-hidden');
    } else {
        nav.classList.remove('nav-hidden');
    }

    state.scrollPos = currentScroll;

    // Always show when scrolling stops for a moment
    clearTimeout(navScrollTimeout);
    navScrollTimeout = setTimeout(() => {
        nav.classList.remove('nav-hidden');
    }, 1000);
}, { passive: true });
// --- LEAD POPUP CORE ---
window.initPopup = () => {
    console.log("[Popup] Initializing logic...");
    // Check if user is from Google Ads
    if (sessionStorage.getItem('traffic_source') !== 'Google Ads') {
        console.log("[Popup] Blocked: Non-ads visitor.");
        return;
    }

    // Check if user already submitted or dismissed
    if (localStorage.getItem('popup_submitted')) {
        console.log("[Popup] Blocked: Already submitted.");
        return;
    }
    if (localStorage.getItem('popup_dismissed')) {
        console.log("[Popup] Blocked: Already dismissed.");
        return;
    }

    console.log("[Popup] Timer started: 20s delay...");
    setTimeout(async () => {
        window.forceShowPopup();
    }, 20000); // 20 Seconds Delay
};

window.forceShowPopup = async () => {
    console.log("[Popup] Triggering show...");
    // Fetch current settings from Firestore
    try {
        const snap = await getDocs(popupSettingsCol);
        if (!snap.empty) {
            const settings = snap.docs[0].data();
            DATA.popupSettings = settings;

            // Update UI
            const title = document.getElementById('popup-gift-title');
            const msg = document.getElementById('popup-gift-msg');
            const img = document.getElementById('popup-gift-img');
            const sTitle = document.getElementById('success-title');
            const sMsg = document.getElementById('success-msg');

            if (title) title.innerText = settings.title || "Claim Your Free Gift";
            if (msg) msg.innerText = settings.msg || "Limited Edition • Exclusive Offer";
            if (img) img.src = (settings.img && settings.img !== 'img/') ? getOptimizedUrl(settings.img, 800) : "https://placehold.co/600x400?text=Gift";

            // Success State Content
            if (sTitle) sTitle.innerText = settings.successTitle || "Congratulations!";
            if (sMsg) sMsg.innerText = settings.successMsg || "Your gift has been secured. We will contact you through WhatsApp shortly.";
        }
    } catch (e) {
        console.error("[Popup] Settings fetch failed", e);
    }

    const overlay = document.getElementById('gift-popup-overlay');
    if (overlay) {
        console.log("[Popup] Showing overlay...");
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Initialize Intl-Tel-Input
        const input = document.getElementById('lead-whatsapp');
        const itild = window.intlTelInput;

        if (input && itild) {
            try {
                console.log("[Popup] Initializing ITI...");
                if (iti) iti.destroy(); // Avoid double init
                iti = itild(input, {
                    initialCountry: "ae",
                    separateDialCode: true,
                    autoPlaceholder: "off",
                    useFullscreenPopup: true, // BETTER FOR MOBILE: Avoids keyboard interference
                    dropdownContainer: document.body, // FIX: Appends to body to avoid popup clipping/layering bugs
                    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@24.5.0/build/js/utils.js",
                });

                // Aesthetic: Add a small delay and focus name if visible, but avoid forcing keyboard
                // on the phone input immediately
            } catch (err) {
                console.error("[Popup] ITI Init Error:", err);
            }
        } else {
            console.warn("[Popup] ITI skip: input or itild missing", { input: !!input, itild: !!itild });
        }
    } else {
        console.error("[Popup] Error: gift-popup-overlay element not found!");
    }
};

window.closeGiftPopup = () => {
    const overlay = document.getElementById('gift-popup-overlay');
    if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
        localStorage.setItem('popup_dismissed', 'true');
    }
};

window.submitLead = async (e) => {
    if (e) e.preventDefault();
    const btn = document.getElementById('lead-submit-btn');
    const name = document.getElementById('lead-name').value;
    const whatsapp = document.getElementById('lead-whatsapp').value;
    const age = document.getElementById('lead-age').value;

    console.log("Submitting to:", leadsCol.path);

    if (!name || !whatsapp || !age) return showToast("Please fill all fields");

    // Validate phone number - fallback to basic length check if library is unsure
    const isValid = iti ? (iti.isValidNumber() || whatsapp.trim().length > 7) : whatsapp.trim().length > 7;
    if (!isValid) {
        console.warn("[Popup] Phone validation failed:", { whatsapp, itiValid: iti?.isValidNumber() });
        return showToast("Please enter a valid WhatsApp number");
    }

    // Capture number - fallback to raw value if getNumber fails
    let fullNumber = iti ? iti.getNumber() : whatsapp;
    console.log("[Popup] initial getNumber:", fullNumber);

    // Force country code inclusion
    if (iti) {
        const countryData = iti.getSelectedCountryData();
        const dialCode = countryData.dialCode;
        console.log("[Popup] Selected Dial Code:", dialCode);

        // Remove non-digits and leading zeros from the local part
        const cleanLocal = whatsapp.replace(/\D/g, '').replace(/^0+/, '');

        // If the number doesn't look like it has the dial code, construct it manually
        if (!fullNumber || !fullNumber.startsWith('+') || !fullNumber.includes(dialCode)) {
            console.log("[Popup] Constructing manual international number");
            fullNumber = `+${dialCode}${cleanLocal}`;
        }
    }

    if (!fullNumber || fullNumber === "") {
        fullNumber = whatsapp.trim();
    }

    console.log("[Popup] FINAL Captured number:", fullNumber);

    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const leadData = {
            name: name,
            whatsapp: fullNumber,
            age: parseInt(age) || 0,
            status: 'new',
            createdAt: new Date().toISOString()
        };

        await addDoc(leadsCol, leadData);

        // TRANSITION TO SUCCESS STATE
        const form = document.getElementById('lead-form');
        const imgBox = document.querySelector('.popup-image-box');
        const successState = document.getElementById('lead-success-state');
        const mainTitle = document.getElementById('popup-gift-title');
        const mainMsg = document.getElementById('popup-gift-msg');

        if (form) form.classList.add('hidden');
        if (imgBox) imgBox.classList.add('hidden');
        if (mainTitle) mainTitle.classList.add('hidden');
        if (mainMsg) mainMsg.classList.add('hidden');

        if (successState) {
            successState.classList.remove('hidden');
        }

        showToast("Success! Lead captured.");
        localStorage.setItem('popup_submitted', 'true');

        // Allow user to read the success message before auto-closing (if they don't click Continue)
        setTimeout(() => {
            // Only auto-close if the popup is still open
            if (document.getElementById('gift-popup-overlay')?.classList.contains('open')) {
                window.closeGiftPopup();
            }
        }, 8000); // 8 seconds to read the message
    } catch (err) {
        console.error("Lead Submission Error:", err);
        showToast("Submission Error: " + (err.message || "Please check connection"));
        btn.innerText = "Try Again";
        btn.disabled = false;
    }
};

// --- ADMIN LEAD MANAGEMENT ---
window.savePopupSettings = createAdminProxy('savePopupSettings');
window.searchLandingProducts = createAdminProxy('searchLandingProducts');
window.landingSetCat = createAdminProxy('landingSetCat');
window.addLandingProduct = createAdminProxy('addLandingProduct');
window.removeLandingProduct = createAdminProxy('removeLandingProduct');
window.renderLandingPills = createAdminProxy('renderLandingPills');
window.populateLandingProductSelects = createAdminProxy('populateLandingProductSelects');
window.populateLandingSettingsUI = createAdminProxy('populateLandingSettingsUI');
window.saveLandingSettings = createAdminProxy('saveLandingSettings');
window.addSpotlightProduct = createAdminProxy('addSpotlightProduct');
window.removeSpotlightProduct = createAdminProxy('removeSpotlightProduct');
window.renderSpotlightPills = createAdminProxy('renderSpotlightPills');
window.searchSpotlightProducts = createAdminProxy('searchSpotlightProducts');
window.populateHomeAdminUI = createAdminProxy('populateHomeAdminUI');
window.saveHomeSettings = createAdminProxy('saveHomeSettings');

// Global mousedown to close dropdowns (mousedown fires before click, so dropdown items still register their click)
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#landing-sec1-search') && !e.target.closest('#landing-sec1-dropdown')) {
        document.getElementById('landing-sec1-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#landing-sec2-search') && !e.target.closest('#landing-sec2-dropdown')) {
        document.getElementById('landing-sec2-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#spotlight-product-search') && !e.target.closest('#spotlight-dropdown')) {
        document.getElementById('spotlight-dropdown')?.classList.add('hidden');
    }
});

/* ==============================================================================
   HOME PAGE (SPOTLIGHT) SETTINGS LOGIC
   ============================================================================== */


window.renderSpotlightSection = () => {
    const appMain = document.getElementById('app');
    const container = appMain ? appMain.querySelector('#spotlight-section') : null;
    if (!container) return;

    // Only show if we are on the main collections page (no filter, no search, no product detail open)
    const isProductDetail = new URLSearchParams(window.location.search).has('p');
    if (!DATA.homeSettings || !DATA.homeSettings.spotlightEnabled || state.filter !== 'all' || state.search || isProductDetail) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    const { spotlightTitle, spotlightSubtitle, spotlightCatId, spotlightLimit, spotlightProducts: selectedIds } = DATA.homeSettings;

    // Only show if we have either a category or specific products
    if (!spotlightCatId && (!selectedIds || selectedIds.length === 0)) {
        container.classList.add('hidden');
        return;
    }

    // Get products
    const stockFilter = (items) => items.filter(p => p.inStock !== false);
    let spotlightProducts = [];

    // PRIORitize selected products
    if (selectedIds && selectedIds.length > 0) {
        spotlightProducts = selectedIds.map(id => DATA.p.find(p => p.id === id)).filter(Boolean);
    } else if (spotlightCatId) {
        spotlightProducts = stockFilter(DATA.p.filter(p => p.catId === spotlightCatId));
        // Limit to configured amount only if we are using the category auto-feed
        spotlightProducts = spotlightProducts.slice(0, spotlightLimit || 8);
    }

    const titleText = spotlightTitle || "Featured Spotlight";
    const subText = spotlightSubtitle || "";

    const html = `
        <div class="mt-8 pt-8 md:mt-20 md:pt-12 border-t border-gray-50">
            <!-- MODERN CATEGORY HEADER (Centered) -->
            <div class="relative w-full flex items-center justify-center mb-6 md:mb-12 mt-0 fade-in min-h-0 md:min-h-[90px]">
                <div class="text-center px-4 w-full md:px-48">
                    <h3 class="font-black capitalize tracking-wide text-gray-900"
                        style="font-family: 'Poppins', sans-serif; font-size: clamp(26px, 4vw, 38px); margin-top: 0; margin-bottom: 0; line-height: 1.1;">
                        ${titleText}
                    </h3>
                    ${subText ? `
                    <p class="font-normal capitalize text-gray-400"
                        style="font-family: 'Poppins', sans-serif; font-size: clamp(12px, 2vw, 16px); margin-top: 0.4rem; letter-spacing: 1px;">
                        ${subText}
                    </p>` : ''}
                </div>
                <!-- Interactive Swipe Indicator (Mobile Only) -->
                <div class="md:hidden absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-300 pointer-events-none" style="animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
                    <span class="text-[8px] font-black uppercase tracking-[0.2em]">Swipe</span>
                    <i class="fa-solid fa-chevron-right text-[9px] translate-y-[0.5px]"></i>
                </div>
            </div>
            
            <style>
                /* Prevent horizontal scrollbar purely on mobile */
                .spotlight-mobile-scroll::-webkit-scrollbar { display: none; }
                .spotlight-mobile-scroll { -ms-overflow-style: none; scrollbar-width: none; }
                
                /* Explicit responsive toggles */
                @media (max-width: 767px) {
                    .spotlight-desktop-grid { display: none !important; }
                    .spotlight-mobile-flex { display: flex !important; }
                }
                @media (min-width: 768px) {
                    .spotlight-desktop-grid { display: grid !important; }
                    .spotlight-mobile-flex { display: none !important; }
                }
            </style>
            
            <!-- MOBILE SWIPE VIEW -->
            <div class="spotlight-mobile-flex related-scroll-wrapper snap-x pb-4 spotlight-mobile-scroll">
                ${spotlightProducts.map(p => {
        const pImg = [p.img, ...(p.images || []), p.img2, p.img3].find(u => u && u !== 'img/') || 'img/';
        const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
        return `
                    <div class="product-card group flex-shrink-0 w-[160px] sm:w-[200px] snap-start" data-id="${p.id}" style="margin-right: 12px;"
                         onmouseenter="window.preloadProductImage('${p.id}')" onclick="viewDetail('${p.id}')">
                        <div class="img-container mb-4 relative">
                            ${badgeHtml}
                            <img src="${getOptimizedUrl(pImg, 600)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="window.handleImgError(this)" alt="${p.name}">
                        </div>
                        <div class="px-1 text-left flex justify-between items-start mt-4">
                            <div class="flex-1 min-w-0">
                                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                                ${(() => {
                const origPrice = parseFloat(p.originalPrice); const salePrice = parseFloat(p.price);
                if (p.originalPrice && origPrice > salePrice) {
                    const disc = Math.round((1 - salePrice / origPrice) * 100);
                    return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                        '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + p.originalPrice + ' AED</span>' +
                        '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + p.price + ' AED</span>' +
                        '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span></div>';
                }
                return '<p class="price-tag mt-2 font-bold">' + p.price + ' AED</p>';
            })()}
                            </div>
                        </div>
                    </div>`;
    }).join('')}
            </div>

            <!-- DESKTOP GRID VIEW -->
            <div class="spotlight-desktop-grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-x-3 gap-y-8 md:gap-x-8 md:gap-y-16 lg:gap-x-10 lg:gap-y-20 mt-4 justify-center">
                ${spotlightProducts.map(p => {
        const pImg = [p.img, ...(p.images || []), p.img2, p.img3].find(u => u && u !== 'img/') || 'img/';
        const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
        return `
                    <div class="product-card group" data-id="${p.id}"
                         onmouseenter="window.preloadProductImage('${p.id}')" onclick="viewDetail('${p.id}')">
                        <div class="img-container mb-4 relative">
                            ${badgeHtml}
                            <img src="${getOptimizedUrl(pImg, 600)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="window.handleImgError(this)" alt="${p.name}">
                        </div>
                        <div class="px-1 text-left flex justify-between items-start mt-4">
                            <div class="flex-1 min-w-0">
                                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                                ${(() => {
                const origPrice = parseFloat(p.originalPrice); const salePrice = parseFloat(p.price);
                if (p.originalPrice && origPrice > salePrice) {
                    const disc = Math.round((1 - salePrice / origPrice) * 100);
                    return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                        '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + p.originalPrice + ' AED</span>' +
                        '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + p.price + ' AED</span>' +
                        '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span></div>';
                }
                return '<p class="price-tag mt-2 font-bold">' + p.price + ' AED</p>';
            })()}
                            </div>
                        </div>
                    </div>`;
    }).join('')}
            </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    container.classList.remove('hidden');
};

window.renderAdminLeads = createAdminProxy('renderAdminLeads');
window.deleteLead = createAdminProxy('deleteLead');
window.exportLeadsExcel = createAdminProxy('exportLeadsExcel');

window.resetInsightsData = async () => {
    if (!confirm("Are you sure you want to reset all Insights data? This will clear all visit counts, product views, and leads forever.")) return;

    if (typeof showToast === 'function') showToast("Resetting insights...", "info");
    const topBtn = document.getElementById('update-range-btn');
    if (topBtn) { topBtn.disabled = true; topBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Resetting...'; }
    try {
        const batch1 = writeBatch(db);
        const globalStatsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        batch1.set(globalStatsRef, {
            adVisits: 0, normalVisits: 0, adProductClicks: 0, normalProductClicks: 0,
            adInquiries: 0, imageLoadFail: 0, totalSessionSeconds: 0, brokenImages: []
        }, { merge: true });
        await batch1.commit();

        let batch = writeBatch(db);
        let batchCount = 0;

        const commitBatch = async () => {
            if (batchCount > 0) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        };

        // Fetch and Delete ALL daily_stats
        const dsRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_stats');
        const dsSnap = await getDocs(dsRef);
        for (const docSnap of dsSnap.docs) {
            batch.delete(docSnap.ref);
            batchCount++;
            if (batchCount === 400) await commitBatch();
        }

        // Fetch and Delete ALL daily_product_stats
        const dpsRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats');
        const dpsSnap = await getDocs(dpsRef);
        for (const docSnap of dpsSnap.docs) {
            batch.delete(docSnap.ref);
            batchCount++;
            if (batchCount === 400) await commitBatch();
        }

        // Reset All-Time Per-Product Stats
        const products = DATA.p || [];
        for (const p of products) {
            const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
            batch.set(pRef, { views: 0, adViews: 0, adInquiries: 0, adImpressions: 0 }, { merge: true });
            batchCount++;
            if (batchCount === 400) await commitBatch();
        }

        await commitBatch();

        if (typeof showToast === 'function') showToast("Insights reset successfully!", "success");

        // Local Sync & Refresh
        await refreshData();
        // Recover Insights
        const iList = document.getElementById('admin-insights-list');
        if (iList) renderInsights(iList);

    } catch (e) {
        console.error("Reset Error Details:", e.code, e.message);
        if (typeof showToast === 'function') showToast(`Reset failed: ${e.code || 'See console'}`, "error");
    } finally {
        if (topBtn) { topBtn.disabled = false; topBtn.innerText = 'Update View'; }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// FAST-PATH: Search-only render (skips category row, mega menu, slider, SEO)
// Called by applyCustomerSearch to avoid full renderHome on every keystroke.
// ─────────────────────────────────────────────────────────────────────────────
function renderSearchResults() {
    try {
        const appMain = document.getElementById('app');
        if (!appMain) return;

        const grid = appMain.querySelector('#product-grid');
        if (!grid) {
            // Grid not present yet — fall back to full render
            renderHome();
            return;
        }

        // Enter search mode — hides badges, slider, category row (instant, CSS-driven)
        enterSearchMode();

        // Hide category + sort elements inside #app
        const catContainer = appMain.querySelector('#category-selector-container');
        if (catContainer) catContainer.classList.add('hidden');
        const catScroll = appMain.querySelector('.category-scroll-container');
        if (catScroll) catScroll.classList.add('hidden');
        const mobSortBar = appMain.querySelector('.md\\:hidden.mb-6.px-1');
        if (mobSortBar) mobSortBar.classList.add('hidden');

        // Filter products by current search query
        const q = (state.search || '').toLowerCase().trim();
        const words = q.split(' ').filter(w => w.length > 0);
        const stockFilter = (items) => items.filter(p => p.inStock !== false);
        let filtered = stockFilter(DATA.p);

        if (words.length > 0) {
            filtered = filtered.filter(p => {
                const name = (p.name || '').toLowerCase();
                const keywords = (p.keywords || '').toLowerCase();
                const catObj = DATA.c.find(c => c.id === p.catId);
                const catName = catObj ? catObj.name.toLowerCase() : '';
                return words.every(word => name.includes(word) || catName.includes(word) || keywords.includes(word));
            });
        }

        // Sort: pinned first, then newest
        filtered.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            if (state.sort !== 'all') {
                const priceA = parseFloat(a.price) || 0;
                const priceB = parseFloat(b.price) || 0;
                return state.sort === 'low' ? priceA - priceB : priceB - priceA;
            }
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        const cols = getColumnsCount();
        // In search mode — show ALL results (no pagination limit)
        const limit = filtered.length;
        const visibleProducts = filtered;
        const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

        let gridContent = '';
        if (filtered.length === 0) {
            gridContent = `
            <div class="col-span-full text-center py-40 px-6">
                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fa-solid fa-magnifying-glass text-gray-200 text-xl"></i>
                </div>
                <h3 class="text-gray-900 font-bold text-[14px] mb-2 uppercase tracking-widest">No Results Found</h3>
                <p class="text-gray-400 text-[11px] mb-8 max-w-xs mx-auto">Try a different keyword or browse our categories.</p>
                <button onclick="window.clearCustomerSearch()" class="bg-black text-white px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-105 active:scale-95 transition-all">
                    Clear Search
                </button>
            </div>`;
        } else {
            gridContent = visibleProducts.map((p, idx) => {
                const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
                return `
                <div class="product-card group ${idx < 4 ? '' : 'fade-in'} ${isInWishlist(p.id) ? 'wish-active' : ''}" data-id="${p.id}"
                     onmouseenter="window.preloadProductImage('${p.id}')"
                     onclick="viewDetail('${p.id}', false, null)">
                    <div class="img-container mb-4 relative">
                        ${badgeHtml}
                        <div class="wish-btn shadow-sm hidden-desktop" onclick="toggleWishlist(event, '${p.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
                        
                        <img src="${getOptimizedUrl(p.img, 600)}"
                             class="${idx < 4 ? 'no-animation' : ''}"
                            ${idx < INITIAL_EAGER_IMAGES ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                             decoding="async"
                             onload="this.classList.add('loaded')"
                             alt="${p.name}">
                    </div>
                    <div class="px-1 text-left flex justify-between items-start mt-4">
                        <div class="flex-1 min-w-0">
                            <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                            <p class="price-tag mt-2 font-bold">${p.price} AED</p>
                        </div>
                        <div class="wish-btn desktop-wish-fix hidden-mobile" onclick="toggleWishlist(event, '${p.id}')">
                            <i class="fa-solid fa-heart"></i>
                        </div>
                    </div>
                </div>`;
            }).join('');

            // Ghost cards to fill last row
            const remainder = visibleProducts.length % cols;
            if (remainder > 0 && filtered.length <= limit) {
                const ghosts = cols - remainder;
                for (let g = 0; g < ghosts; g++) {
                    gridContent += `<div style="visibility:hidden;pointer-events:none;" aria-hidden="true"><div style="aspect-ratio:4/5;width:100%;"></div></div>`;
                }
            }
        }

        // Prevent layout jump by locking current height
        const currentHeight = grid.offsetHeight;
        if (currentHeight > 0) grid.style.minHeight = `${currentHeight}px`;

        // Update load-more button (calculate before rAF so values are captured)
        const hasMore = filtered.length > limit;

        // Use requestAnimationFrame to not block the keyboard
        // IMPORTANT: load-more button update is INSIDE rAF so it stays in sync with grid render
        requestAnimationFrame(() => {
            grid.innerHTML = gridContent;
            setTimeout(() => ensureGridImagesVisible(grid), 0);
            setTimeout(() => { grid.style.minHeight = ''; }, 600);

            // In search mode — always hide the View More button
            const loadMoreContainer = document.getElementById('load-more-container');
            if (loadMoreContainer) {
                loadMoreContainer.style.display = 'none';
            }
        });

        // Update slider visibility for search state
        renderSlider();

    } catch (e) {
        console.error('[renderSearchResults] Error:', e);
        // Safe fallback
        renderHome();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MODE — Enter/Exit helpers (professional e-commerce UX)
// ─────────────────────────────────────────────────────────────────────────────
function enterSearchMode() {
    // Always add the class — hides trust badges + slider on ALL screen sizes via CSS
    document.body.classList.add('search-mode');

    // Mobile-only: also hide category row + sort bar from DOM
    if (window.innerWidth < 768) {
        const catContainer = document.getElementById('category-selector-container');
        if (catContainer) catContainer.classList.add('hidden');
        const catScroll = document.querySelector('.category-scroll-container');
        if (catScroll) catScroll.classList.add('hidden');
        const sortBar = document.querySelector('.desktop-select-actions');
        if (sortBar) sortBar.classList.add('hidden');
    }
}

function exitSearchMode() {
    document.body.classList.remove('search-mode');
    // Restore elements hidden by enterSearchMode — renderHome() will fully rebuild them
    // but we proactively un-hide for instant visual feedback
    const catContainer = document.getElementById('category-selector-container');
    if (catContainer) catContainer.classList.remove('hidden');
    const catScroll = document.querySelector('.category-scroll-container');
    if (catScroll) catScroll.classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT: Attach search input listeners exactly ONCE (not on every renderHome)
// ─────────────────────────────────────────────────────────────────────────────
let _searchListenersInit = false;
function initSearchListeners() {
    if (_searchListenersInit) return;
    _searchListenersInit = true;

    // Mobile main search
    const mobileSearch = document.getElementById('customer-search');
    if (mobileSearch) {
        mobileSearch.addEventListener('input', (e) => {
            window.applyCustomerSearch(e.target.value);
        });
        mobileSearch.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            openShopWithSearch(e.target.value);
        });
        mobileSearch.addEventListener('focus', () => {
            enterSearchMode();
        });
        mobileSearch.addEventListener('blur', () => {
            // Small delay so tapping a product card still works
            setTimeout(() => {
                if (!state.search) exitSearchMode();
            }, 200);
        });
    }

    // Desktop nav search
    const desktopSearch = document.getElementById('desk-search');
    if (desktopSearch) {
        desktopSearch.addEventListener('input', (e) => {
            window.applyCustomerSearch(e.target.value);
        });
        desktopSearch.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            openShopWithSearch(e.target.value);
        });
        desktopSearch.addEventListener('focus', () => {
            enterSearchMode();
        });
        desktopSearch.addEventListener('blur', () => {
            setTimeout(() => {
                if (!state.search) exitSearchMode();
            }, 200);
        });
    }
}

initPopup();
// Removed redundant startSync call to prevent session override bugs.
// Attach search listeners once the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchListeners);
} else {
    initSearchListeners();
}

// ============================================================================
// CUSTOMER AUTHENTICATION & PROFILE
// ============================================================================

window.openAuthModal = () => {
    if (state.authUser) {
        document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
        document.getElementById('auth-account-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    } else {
        document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
        document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        state.authMode = 'login';
        window.updateAuthUI();
    }
    document.body.style.overflow = 'hidden';
};

window.closeAuthModals = () => {
    document.getElementById('auth-modal-overlay')?.classList.remove('opacity-100', 'pointer-events-auto');
    document.getElementById('auth-login-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.getElementById('auth-account-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.body.style.overflow = 'auto';
};

window.handleUserAuthClick = () => {
    window.openAuthModal();
};

function autoOpenAuthFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') !== '1') return;
    window.openAuthModal();
    params.delete('auth');
    const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', clean);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoOpenAuthFromQuery);
} else {
    autoOpenAuthFromQuery();
}

window.toggleAuthMode = () => {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    window.updateAuthUI();
};

window.updateAuthUI = () => {
    const title = document.getElementById('auth-form-title');
    const subtitle = document.getElementById('auth-form-subtitle');
    const nameGroup = document.getElementById('auth-name-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const forgotWrap = document.getElementById('auth-forgot-wrap');

    if (!title) return;

    if (state.authMode === 'login') {
        title.innerText = 'Welcome Back';
        subtitle.innerText = 'Login to your account';
        nameGroup.classList.add('hidden');
        forgotWrap.classList.remove('hidden');
        submitBtn.innerHTML = `Sign In <i class="fa-solid fa-arrow-right text-[10px]"></i>`;
        toggleText.innerText = "Don't have an account?";
        toggleBtn.innerText = "Sign Up";
    } else {
        title.innerText = 'Create Account';
        subtitle.innerText = 'Join us today';
        nameGroup.classList.remove('hidden');
        forgotWrap.classList.add('hidden');
        submitBtn.innerHTML = `Sign Up <i class="fa-solid fa-user-plus text-[10px]"></i>`;
        toggleText.innerText = "Already have an account?";
        toggleBtn.innerText = "Sign In";
    }
};

window.handleAuthSubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-submit-btn');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();

    if (!email || !password) return showToast("Please fill all fields");

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

    try {
        if (state.authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Welcome Back!");
        } else {
            if (!name) throw new Error("Please enter your name");
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: name });
            showToast("Account Created!");
        }
        window.closeAuthModals();
        document.getElementById('auth-form').reset();
    } catch (err) {
        console.error("Auth Error:", err);
        showToast(err.message.replace("Firebase:", "").trim() || "Authentication Failed");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

window.signInWithGoogle = async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        window.closeAuthModals();
        showToast("Logged in with Google!");
    } catch (err) {
        console.error("Google Auth Error:", err);
        showToast("Sign-In Failed or Cancelled");
    }
};

window.handleForgotPassword = async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) {
        return showToast("Enter your email address in the field to reset password");
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset email sent! Check your inbox.");
    } catch (err) {
        showToast("Error: " + err.message.replace("Firebase:", "").trim());
    }
};

window.handleSignOut = async () => {
    try {
        await signOut(auth);
        window.closeAuthModals();
        // Since Firebase automatically signs out the real user, onAuthStateChanged 
        // will fire. We need to fall back to an anonymous session so they can still browse.
        // Removed redundant startSync inside auth submissions to maintain single session flow.        state.wishlist = []; // Clear for security
        updateWishlistBadge();
        showToast("Signed Out Successfully");
    } catch (err) {
        showToast("Error signing out");
    }
};

function refreshMainAuthUI() {
    const u = state.authUser;
    const navBtn = document.getElementById('nav-user-btn');
    if (navBtn) navBtn.classList.toggle('text-black', !!u);
    const accountName = document.getElementById('account-user-name');
    const accountEmail = document.getElementById('account-user-email');
    if (accountName) accountName.innerText = u?.displayName || "User";
    if (accountEmail) accountEmail.innerText = u?.email || "";
    const ddName = document.getElementById('dd-user-name');
    const ddEmail = document.getElementById('dd-user-email');
    if (ddName) ddName.textContent = u?.displayName ? `Hi, ${u.displayName.split(' ')[0]}!` : 'Hi there!';
    if (ddEmail) ddEmail.textContent = u?.email || '';
    if (!u) window.closeAccountDropdown?.();
}

initSharedAuth({
    auth,
    firebaseAuth: {
        signInWithEmailAndPassword,
        createUserWithEmailAndPassword,
        GoogleAuthProvider,
        signInWithPopup,
        sendPasswordResetEmail,
        signOut,
        updateProfile
    },
    getAuthUser: () => state.authUser,
    getAuthMode: () => state.authMode,
    setAuthMode: (mode) => { state.authMode = mode; },
    updateAuthUserUI: refreshMainAuthUI,
    showToast
});

// ============================================================================
// CUSTOMER PASSWORD RESET FLOW
// ============================================================================

window.handlePasswordResetFlow = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    if (mode === 'resetPassword' && oobCode) {
        try {
            // Verify link validity before showing modal to prevent confusing users with dead links
            await verifyPasswordResetCode(auth, oobCode);

            // Link is valid, show Reset Modal
            document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
            const resetModal = document.getElementById('auth-reset-modal');
            if (resetModal) {
                resetModal.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
                document.getElementById('auth-reset-oobCode').value = oobCode;
            }
            document.body.style.overflow = 'hidden';

        } catch (err) {
            console.error("Reset Code Error:", err);
            showToast("Password reset link is invalid or expired.");
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

window.handlePasswordResetFormSubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-reset-submit-btn');
    const newPassword = document.getElementById('auth-reset-new-password').value;
    const oobCode = document.getElementById('auth-reset-oobCode').value;

    if (!newPassword || newPassword.length < 6) return showToast("Password must be at least 6 characters");

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

    try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        showToast("Password Reset Successfully! Please login.");

        // Clean up URL and UI
        window.history.replaceState({}, document.title, window.location.pathname);
        document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');

        // Open standard login window automatically
        state.authMode = 'login';
        window.updateAuthUI();
        document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        document.getElementById('auth-reset-form').reset();

    } catch (err) {
        showToast(err.message.replace("Firebase:", "").trim() || "Failed to reset password");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

function initMainSharedNavbar() {
    const hasFavoritesUI = document.getElementById('favorites-sidebar') && document.getElementById('categories-sidebar');
    if (!hasFavoritesUI) return;

    const legacyBulkInquiry = window.sendBulkInquiry;
    const legacyAccountClick = window.handleUserAuthClick;
    const legacyFocusSearch = window.focusSearch;

    if (!sharedNavMain) {
        sharedNavMain = initSharedNavbar({
            getWishlistIds: () => state.wishlist,
            getProductById: (id) => DATA.p.find(p => p.id === id),
            getCategories: () => DATA.c,
            getProductUrl: (id) => getProductDetailUrl(id),
            getCategoryImage: (item) => getOptimizedUrl(item?.img || item?.images?.[0], 140),
            onWishlistToggle: (id) => window.toggleWishlist(null, id),
            onCategorySelect: (catId) => window.applyFilter(catId),
            onSearchFocus: () => {
                if (typeof legacyFocusSearch === 'function') legacyFocusSearch();
            },
            onAccountClick: () => {
                if (typeof legacyAccountClick === 'function') legacyAccountClick();
            },
            onBulkInquiry: () => {
                if (typeof legacyBulkInquiry === 'function') legacyBulkInquiry();
            },
            renderFavorites: () => window.renderFavoritesSidebar?.(),
            renderCategories: () => window.renderCategoriesSidebar?.(),
            onSidebarStateChange: (isOpen) => {
                document.body.style.overflow = isOpen ? 'hidden' : 'auto';
            },
            showToast
        });
    } else {
        sharedNavMain.refresh();
    }
}

// Check for reset links on boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handlePasswordResetFlow);
} else {
    handlePasswordResetFlow();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handlePasswordResetFlow);
} else {
    handlePasswordResetFlow();
}