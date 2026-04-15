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

// ─── Context helpers for lazy-loaded modules (app-insights.js, etc.) ────────
// DATA is a local `let` — expose via getter so lazy modules always see the
// latest value even after DATA is reassigned (e.g. cache render).
Object.defineProperty(window, '_sgDATA', { get: () => DATA, configurable: true });
window._sgGetTodayStr = () => getTodayStr();
window._sgGetOptUrl = (url, w) => getOptimizedUrl(url, w);
// Allow app-insights.js to clear the error-tracking Set without importing it
window._sgClearErrorTrackedUrls = () => _errorTrackedUrls.clear();
// Expose refreshData for resetInsightsData in app-insights.js
window.refreshData = (...args) => refreshData(...args);
// Expose state + wishlist badge for app-auth.js
Object.defineProperty(window, '_sgState', { get: () => state, configurable: true });
window._sgRefreshMainAuthUI = () => refreshMainAuthUI();
// Expose helpers for lazy modules (app-spotlight.js etc.)
window._sgGetBadgeLabel = (b) => getBadgeLabel(b);
window._sgGetProductDetailUrl = (id) => getProductDetailUrl(id);
// Expose Firestore refs for app-popup.js
window._sgLeadsCol = null; // set below after leadsCol is defined
window._sgPopupSettingsCol = null;

const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const sliderCol = collection(db, 'artifacts', appId, 'public', 'data', 'sliders');
const megaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mega_menus');
const popupSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'popupSettings');
const landingSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'landingSettings');
const leadsCol = collection(db, 'artifacts', appId, 'public', 'data', 'leads');
// Wire refs for app-popup.js lazy module
window._sgLeadsCol = leadsCol;
window._sgPopupSettingsCol = popupSettingsCol;

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
// iti (intl-tel-input) is now managed inside app-popup.js
const wishlistChannel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel(WISHLIST_SYNC_CHANNEL)
    : null;

// ── PRE-FETCH LAZY MODULES (parallel to Firebase auth + data fetch) ──────────
// Slider module download starts immediately at page load time.
// By the time Firebase returns data, the module is already in memory.
const _isMinBuild = import.meta.url?.includes('.min.js');
window._isMinBuild = _isMinBuild; // Exposed so lazily-loaded modules (bridge, admin) can detect build type
const _sliderModulePromise   = import(_isMinBuild ? './app-slider.min.js'   : './app-slider.js');
const _spotlightModulePromise = import(_isMinBuild ? './app-spotlight.min.js' : './app-spotlight.js');

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
window._sgTryInstantCacheRender = function () {
    try {
        if (DATA.p && DATA.p.length > 0) return; // Firebase already loaded — skip
        const raw = localStorage.getItem('speedgifts_home_cache');
        if (!raw) return;
        const cache = JSON.parse(raw);
        if (!cache || !Array.isArray(cache.p) || cache.p.length === 0) return;
        DATA = cache;
        console.log('[Cache] Instant render from cache — products:', DATA.p.length);

        // Ensure hearts are colored immediately on first paint
        try {
            const wRaw = localStorage.getItem('speedgifts_wishlist');
            if (wRaw) {
                const parsedW = JSON.parse(wRaw);
                state.wishlist = parsedW.map(e => typeof e === 'string' ? { id: e } : e);
            }
        } catch (e) { }

        if (typeof renderAnnouncementBar === 'function') renderAnnouncementBar();
        if (typeof window.renderDesktopMegaMenu === 'function') window.renderDesktopMegaMenu();
        // Restore state instantly before first paint
        if (typeof applyHomeSnapshotIfAny === 'function') applyHomeSnapshotIfAny();

        if (typeof renderHome === 'function') renderHome();
    } catch (e) {
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
    } catch (_) { }
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
        if (pId) viewDetail(pId, true, null, false);
        else {
            refreshData(true);
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
        } catch (e) { console.error('[Wishlist] Cloud save failed:', e); }
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

    // Remove pre-init injected style tags so JS fully controls badge visibility
    // (pre-init styles use !important which would block the 'hidden' class)
    if (!window._sgPreInitStylesRemoved) {
        window._sgPreInitStylesRemoved = true;
        document.querySelectorAll('head style').forEach(s => {
            if (s.textContent && s.textContent.includes('nav-wishlist-count')) s.remove();
            if (s.textContent && s.textContent.includes('nav-cart-count')) s.remove();
        });
    }

    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'flex';
            badge.classList.remove('hidden');
        } else {
            badge.style.display = 'none';
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
            mobBadge.style.display = 'flex';
            mobBadge.classList.remove('hidden');
        } else {
            mobBadge.style.display = 'none';
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
        let visualDataChanged = false;

        if (!isNavigationOnly || DATA.p.length === 0) {
            const buildSig = (p, c, m, s) => {
                const ps = (p || []).map(x => `${x.id}-${x.price}`).sort().join('|');
                const cs = (c || []).map(x => `${x.id}`).sort().join('|');
                const ms = (m || []).map(x => `${x.id}`).sort().join('|');
                const ss = (s || []).map(x => `${x.id}`).sort().join('|');
                return `${ps}::${cs}::${ms}::${ss}`;
            };
            const oldVisualSig = buildSig(DATA.p, DATA.c, DATA.m, DATA.s);

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

            const newVisualSig = buildSig(DATA.p, DATA.c, DATA.m, DATA.s);
            visualDataChanged = (oldVisualSig !== newVisualSig);

            // Save cache for next lightning-fast load
            try {
                localStorage.setItem('speedgifts_home_cache', JSON.stringify(DATA));
            } catch (e) { }

            primeHomeCriticalAssets();

            // Lazy-load slider + spotlight modules (non-blocking, parallel to this render)
            _loadSliderModule();
            _loadSpotlightModule();

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

        const grid = document.getElementById('product-grid');
        const needsRender = visualDataChanged || !grid || grid.children.length === 0;

        if (!isAdminOpen) {
            if (prodId && DATA.p.length > 0) {
                viewDetail(prodId, true);
            } else {
                if (needsRender) renderHome();
                applyHomeSnapshotIfAny();
            }
        } else {
            if (needsRender) renderHome();
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
                initialEagerImages: (state.homeBestExpanded || state.scrollPos > 0) ? 9999 : INITIAL_EAGER_IMAGES,
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
            visibleChunks: state.visibleChunks || 1,
            homeBestExpanded: !!state.homeBestExpanded
        };
        sessionStorage.setItem(HOME_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (e) {
        // non-blocking snapshot path
    }
}

function applyHomeSnapshotIfAny() {
    try {
        const raw = sessionStorage.getItem(HOME_SNAPSHOT_KEY);
        const clearStyle = () => {
            const el = document.getElementById('anti-jump-style');
            if (el) el.remove();
        };

        if (!raw) { clearStyle(); return; }

        const snapshot = JSON.parse(raw);
        const isFresh = snapshot?.ts && (Date.now() - snapshot.ts) < 10 * 60 * 1000;
        const currentUrl = window.location.pathname + window.location.search;
        if (!isFresh || !snapshot?.url || snapshot.url !== currentUrl) {
            clearStyle(); return;
        }

        if (Number.isFinite(snapshot.visibleChunks) && snapshot.visibleChunks > 1) {
            state.visibleChunks = snapshot.visibleChunks;
        }
        if (typeof snapshot.homeBestExpanded === 'boolean') {
            state.homeBestExpanded = snapshot.homeBestExpanded;
        }
        if (Number.isFinite(snapshot.scrollY) && snapshot.scrollY > 0) {
            state.scrollPos = snapshot.scrollY;
            state.skipScroll = true;
            setTimeout(() => {
                window.scrollTo({ top: snapshot.scrollY, behavior: 'auto' });
                clearStyle();
            }, 0);
        } else {
            clearStyle();
        }
        sessionStorage.removeItem(HOME_SNAPSHOT_KEY);
    } catch (e) {
        const el = document.getElementById('anti-jump-style');
        if (el) el.remove();
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
    renderSlider, renderInsights: (...args) => window.renderInsights(...args)
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

// Global Image Fallback for bfcache / lazy loading race conditions.
// Ensures that images just magically restored but lacking 'load' events
// do not stay white forever.
setInterval(() => {
    document.querySelectorAll('.img-container img:not(.loaded)').forEach(img => {
        if (img.complete && img.naturalHeight > 0) {
            img.classList.add('loaded');
        } else if (img.complete && img.naturalHeight === 0 && img.src) {
            // Force reload if broken
            const src = img.src;
            img.src = '';
            img.src = src;
        }
    });
}, 400);


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

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS MODULE — lazy-loaded on first admin panel open
// Regular visitors NEVER download or parse the insights code.
// ─────────────────────────────────────────────────────────────────────────────
let _insightsModuleReady = false;
async function _loadInsights() {
    if (_insightsModuleReady) return;
    try {
        // Use minified version in production (app.min.js), dev version otherwise
        const src = document.currentScript?.src || '';
        const isMin = src.includes('.min.js') || import.meta.url?.includes('.min.js');
        const { initInsights } = await import(isMin ? './app-insights.min.js' : './app-insights.js');
        initInsights(); // replaces window.renderInsights, window.updateInsightsRange, etc.
        _insightsModuleReady = true;
    } catch (e) {
        console.error('[Insights] Failed to load app-insights.js:', e);
        throw e; // re-throw so callers can handle it
    }
}

// Each stub: load the module (no-op if already loaded), then call the REAL function
window.renderInsights = async function (container, rangeData) {
    await _loadInsights();
    window.renderInsights(container, rangeData); // now points to real impl from initInsights()
};

window.updateInsightsRange = async function (passedStart, passedEnd, isSilent) {
    await _loadInsights();
    window.updateInsightsRange(passedStart, passedEnd, isSilent);
};

window.resetAdTraffic = async function () { await _loadInsights(); window.resetAdTraffic(); };
window.clearHealthErrors = async function () { await _loadInsights(); window.clearHealthErrors(); };
window.resetAllAnalytics = async function () { await _loadInsights(); window.resetAllAnalytics(); };
window.resetInsightsData = async function () { await _loadInsights(); window.resetInsightsData(); };


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

// ─────────────────────────────────────────────────────────────────────────────
// SLIDER + ANNOUNCEMENT — lazy-loaded from app-slider.js
// Stubs replaced once the module resolves (parallel to Firebase data fetch).
// ─────────────────────────────────────────────────────────────────────────────
let renderSlider         = () => {};
let renderAnnouncementBar = () => {};
let _sliderModuleLoaded  = false;

async function _loadSliderModule() {
    if (_sliderModuleLoaded) return;
    _sliderModuleLoaded = true;
    try {
        const { initSlider } = await _sliderModulePromise; // Already downloading since page load!
        const ctx = initSlider({ db, appId, doc, setDoc });
        renderSlider          = ctx.renderSlider;
        renderAnnouncementBar = ctx.renderAnnouncementBar;
        renderSlider();
        renderAnnouncementBar();
    } catch (e) {
        console.error('[Slider] Failed to load app-slider.js:', e);
    }
}

// (renderSlider body moved to app-slider.js)


// ADMIN SLIDER FUNCTIONS (proxy stubs — admin logic lives in app-admin.js)
window.saveSlider                 = createAdminProxy('saveSlider');
window.cloudinaryBulkSliderUpload = createAdminProxy('cloudinaryBulkSliderUpload');
window.handleSliderBulkDrop      = createAdminProxy('handleSliderBulkDrop');
window.editSlider                 = createAdminProxy('editSlider');
window.deleteSlider               = createAdminProxy('deleteSlider');

// (Announcement bar code lives in app-slider.js — loaded lazily after data fetch)

// ADMIN ANNOUNCEMENTS (proxy stubs)
window.addAnnouncementRow = createAdminProxy('addAnnouncementRow');
window.saveAnnouncements  = createAdminProxy('saveAnnouncements');

// Auth state and data fetching are handled by onAuthStateChanged.


// Auth state and data fetching are handled by onAuthStateChanged.

// Responsive Slider Refresh — handled inside app-slider.js after module loads.

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
// --- LEAD POPUP — lazy-loaded on first trigger (Google Ads visitors only) ---
let _popupModuleReady = false;
async function _loadPopup() {
    if (_popupModuleReady) return;
    try {
        const isMin = import.meta.url?.includes('.min.js');
        const { initPopup } = await import(isMin ? './app-popup.min.js' : './app-popup.js');
        initPopup(); // registers window.forceShowPopup, closeGiftPopup, submitLead
        _popupModuleReady = true;
    } catch (e) {
        console.error('[Popup] Failed to load app-popup.js:', e);
        throw e;
    }
}

// Tiny initPopup stub — runs at startup, loads module only if needed
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

// closeGiftPopup + submitLead: shims so HTML onclick works before module loads.
// Once _loadPopup() runs, initPopup() in app-popup.js replaces these with real impls.
window.forceShowPopup = async () => { await _loadPopup(); window.forceShowPopup(); };
window.closeGiftPopup = () => { document.getElementById('gift-popup-overlay')?.classList.remove('open'); document.body.style.overflow = 'auto'; localStorage.setItem('popup_dismissed', 'true'); };
window.submitLead = async (e) => {
    if (e) e.preventDefault(); // MUST be sync — prevents form reload before module loads
    await _loadPopup();
    window.submitLead(e);
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


// ─────────────────────────────────────────────────────────────────────────────
// SPOTLIGHT SECTION — lazy-loaded from app-spotlight.js
// Stub replaced once the module resolves.
// ─────────────────────────────────────────────────────────────────────────────
window.renderSpotlightSection = () => {}; // no-op stub until module loads
let _spotlightModuleLoaded = false;

async function _loadSpotlightModule() {
    if (_spotlightModuleLoaded) return;
    _spotlightModuleLoaded = true;
    try {
        const { initSpotlight } = await _spotlightModulePromise; // Already downloading since page load!
        initSpotlight({ getOptimizedUrl, getBadgeLabel, getProductDetailUrl });
        window.renderSpotlightSection();
    } catch (e) {
        console.error('[Spotlight] Failed to load app-spotlight.js:', e);
    }
}

// (renderSpotlightSection body moved to app-spotlight.js)


window.renderAdminLeads = createAdminProxy('renderAdminLeads');
window.deleteLead = createAdminProxy('deleteLead');
window.exportLeadsExcel = createAdminProxy('exportLeadsExcel');

window.resetInsightsData = async function () {
    await _loadInsights();
    window.resetInsightsData();
};



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
// Auth UI (openAuthModal, closeAuthModals, handleAuthSubmit, signInWithGoogle,
// handleForgotPassword, handleSignOut) is fully handled by shared-auth.js via
// initSharedAuth() below. Only refreshMainAuthUI and the password reset flow live here.

function refreshMainAuthUI() {
    const u = state.authUser;
    const navBtn = document.getElementById('nav-user-btn');
    if (navBtn) navBtn.classList.toggle('text-black', !!u);
    const accountName = document.getElementById('account-user-name');
    const accountEmail = document.getElementById('account-user-email');
    if (accountName) accountName.innerText = u?.displayName || "User";
    if (accountEmail) accountEmail.innerText = u?.email || '';
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
    if (mode !== 'resetPassword' || !oobCode) return;
    try {
        await verifyPasswordResetCode(auth, oobCode);
        document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
        const resetModal = document.getElementById('auth-reset-modal');
        if (resetModal) {
            resetModal.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
            document.getElementById('auth-reset-oobCode').value = oobCode;
        }
        document.body.style.overflow = 'hidden';
    } catch (err) {
        console.error('Reset Code Error:', err);
        showToast('Password reset link is invalid or expired.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
};

window.handlePasswordResetFormSubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-reset-submit-btn');
    const newPassword = document.getElementById('auth-reset-new-password').value;
    const oobCode = document.getElementById('auth-reset-oobCode').value;
    if (!newPassword || newPassword.length < 6) return showToast('Password must be at least 6 characters');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        showToast('Password Reset Successfully! Please login.');
        window.history.replaceState({}, document.title, window.location.pathname);
        document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        state.authMode = 'login';
        window.updateAuthUI?.();
        document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        document.getElementById('auth-reset-form').reset();
    } catch (err) {
        showToast(err.message.replace('Firebase:', '').trim() || 'Failed to reset password');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// Check for reset links on boot (once only)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.handlePasswordResetFlow);
} else {
    window.handlePasswordResetFlow();
}

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

