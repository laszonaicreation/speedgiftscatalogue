// ============================================================================
// admin-page.js — Standalone Admin Panel Entry Point
// Completely independent from app.js / index.html.
// Handles: Firebase init, auth guard, data fetch, initAdmin(ctx)
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc, setDoc,
    increment, writeBatch, arrayUnion, query, where, documentId
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

// ─── Firebase Init ────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speedgifts.net",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const _app = initializeApp(firebaseConfig);
const db = initializeFirestore(_app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(_app);
const appId = firebaseConfig.projectId;

// Expose for app-insights.js and other lazy modules that read these globals
window._sgDb = db;
window._sgAuth = auth;
window._sgAppId = appId;
window._isMinBuild = import.meta.url?.includes('.min.js');

// ─── Firestore Collection Refs ────────────────────────────────────────────────
const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const sliderCol = collection(db, 'artifacts', appId, 'public', 'data', 'sliders');
const megaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mega_menus');
const popupSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'popupSettings');
const landingSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'landingSettings');
const leadsCol = collection(db, 'artifacts', appId, 'public', 'data', 'leads');

window._sgLeadsCol = leadsCol;
window._sgPopupSettingsCol = popupSettingsCol;

// ─── DATA + STATE ─────────────────────────────────────────────────────────────
let DATA = {
    p: [], c: [], m: [], s: [],
    announcements: [], leads: [],
    popupSettings: { title: '', msg: '', img: '' },
    landingSettings: null, homeSettings: null,
    stats: { adVisits: 0, adHops: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0 }
};
let state = {
    filter: 'all', sort: 'all', search: '', adminTab: 'products',
    user: null, authUser: null, cart: [], selected: [], selectionId: null
};

// Expose for lazy modules
Object.defineProperty(window, '_sgDATA', { get: () => DATA, configurable: true });
Object.defineProperty(window, '_sgState', { get: () => state, configurable: true });

// ─── Helper Functions (same as app.js) ───────────────────────────────────────
const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
window._sgGetTodayStr = () => getTodayStr();

function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string') return '';
    if (!url.includes('cloudinary.com')) return url;
    const baseTransform = 'f_auto,q_auto';
    const widthTransform = width ? `,w_${width},c_limit` : '';
    const fullTransform = baseTransform + widthTransform;
    if (url.includes('/upload/f_auto,q_auto')) {
        if (width && !url.includes(',w_')) return url.replace('/upload/f_auto,q_auto', `/upload/${fullTransform}`);
        return url;
    }
    return url.replace('/upload/', `/upload/${fullTransform}/`);
}
window._sgGetOptUrl = (url, w) => getOptimizedUrl(url, w);

function getBadgeLabel(badge) {
    const labels = { 'new': 'New Arrival', 'best': 'Best Seller', 'limited': 'Limited Stock', 'sale': 'On Sale', 'trending': 'Trending' };
    return labels[badge] || badge;
}
window._sgGetBadgeLabel = (b) => getBadgeLabel(b);

function getColumnsCount() { return 5; } // Admin always uses 5-col layout

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
}
window.showToast = showToast;

// renderHome is a no-op on admin page (no home page DOM to render)
function renderHome() { /* no-op on admin.html */ }

// renderSlider is a no-op on admin page
function renderSlider() { /* no-op on admin.html */ }

// ─── Data Fetch ───────────────────────────────────────────────────────────────
async function fetchAdminData() {
    // safeGet: if one collection fails (permission denied etc.), others still load
    const safeGet = async (col, name) => {
        try {
            const snap = await getDocs(col);
            console.log(`[Admin] ✅ ${name}: ${snap.docs.length} docs`);
            return snap;
        } catch (e) {
            console.warn(`[Admin] ⚠️ ${name} fetch failed (${e.code}):`, e.message);
            return { docs: [] };
        }
    };

    setLoadingStatus('Loading data...');
    console.log('[Admin] Starting data fetch...');

    const [
        productsSnap, catsSnap, megaSnap, slidersSnap,
        popupSnap, landingSnap, leadSnap
    ] = await Promise.all([
        safeGet(prodCol, 'products'),
        safeGet(catCol, 'categories'),
        safeGet(megaCol, 'mega_menus'),
        safeGet(sliderCol, 'sliders'),
        safeGet(popupSettingsCol, 'popupSettings'),
        safeGet(landingSettingsCol, 'landingSettings'),
        safeGet(leadsCol, 'leads')
    ]);

    // Config docs stored inside products collection (same as home-data.js)
    const CONFIG_IDS = ['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_'];
    const allProductDocs = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Extract config docs from products collection
    const homeDoc = allProductDocs.find(p => p.id === '_home_settings_');
    const landingDoc = allProductDocs.find(p => p.id === '_landing_settings_');
    const announcementsDoc = allProductDocs.find(p => p.id === '_announcements_');

    DATA.homeSettings = homeDoc ? { ...homeDoc } : null;
    DATA.landingSettings = landingDoc ? { ...landingDoc } : (DATA.landingSettings || null);
    DATA.announcements = announcementsDoc?.messages || [];

    // Real products — exclude config docs
    DATA.p = allProductDocs.filter(p => !CONFIG_IDS.includes(p.id));
    DATA.c = catsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    DATA.m = megaSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    DATA.s = slidersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    DATA.leads = leadSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // popupSettings: first doc in collection (same as home-data.js line 69)
    if (popupSnap.docs?.length) DATA.popupSettings = popupSnap.docs[0].data();
    // landingSettingsCol fallback (products collection _landing_settings_ takes priority)
    if (!DATA.landingSettings && landingSnap.docs?.length) {
        DATA.landingSettings = landingSnap.docs[0].data();
    }



    // Daily stats for insights
    try {
        const today = getTodayStr();
        const statsDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today));
        if (statsDoc.exists()) DATA.stats = { ...DATA.stats, ...statsDoc.data() };
    } catch (e) { /* stats not critical */ }

    console.log('[Admin] ✅ Data loaded:', DATA.p.length, 'products,', DATA.c.length, 'categories,', DATA.s.length, 'sliders');
}

// refreshData for admin use — re-fetches all data and re-renders the admin UI

async function refreshData() {
    await fetchAdminData();
    if (typeof window.renderAdminUI === 'function') window.renderAdminUI();
    // Re-populate dropdowns
    if (typeof window.populateCatSelect === 'function') window.populateCatSelect();
    if (typeof window.populateAdminCatFilter === 'function') window.populateAdminCatFilter();
}
window.refreshData = (...args) => refreshData(...args);

// ─── Loading Status UI ────────────────────────────────────────────────────────
function setLoadingStatus(msg) {
    const el = document.getElementById('admin-loading-status');
    if (el) el.textContent = msg;
}

function hideLoadingScreen() {
    const el = document.getElementById('admin-loading-screen');
    if (el) el.style.display = 'none';
}

// ─── Load admin-panel.html into the mount point ───────────────────────────────
async function loadAdminPanelHTML() {
    const mount = document.getElementById('admin-panel-mount');
    if (!mount) return;

    try {
        const res = await fetch('./admin-panel.html');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        mount.outerHTML = html;
        await new Promise(r => requestAnimationFrame(r));
        console.log('[Admin] admin-panel.html loaded');
    } catch (e) {
        console.error('[Admin] Failed to load admin-panel.html:', e);
        setLoadingStatus('Failed to load admin panel HTML. Please refresh.');
        throw e;
    }
}

// ─── populateCatSelect / populateAdminCatFilter (same as app.js) ──────────────
window.populateCatSelect = function () {
    const selects = [
        document.getElementById('p-cat-id'),
        document.getElementById('landing-sec1-cat'),
        document.getElementById('landing-sec2-cat'),
        document.getElementById('spotlight-cat-id')
    ];
    const optionsHtml = `<option value="">Select Category</option>` +
        DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    selects.forEach(select => { if (select) select.innerHTML = optionsHtml; });
};

window.populateAdminCatFilter = function () {
    const select = document.getElementById('admin-cat-filter');
    if (select) select.innerHTML = `<option value="all">All Categories</option>` +
        DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
};

// ─── Insights stub (lazy-loaded same as in app.js) ────────────────────────────
let _insightsModuleReady = false;
async function _loadInsights() {
    if (_insightsModuleReady) return;
    try {
        const isMin = window._isMinBuild;
        const { initInsights } = await import(isMin ? './app-insights.min.js' : './app-insights.js');
        initInsights();
        _insightsModuleReady = true;
    } catch (e) {
        console.error('[Insights] Failed to load:', e);
        throw e;
    }
}
window.renderInsights = async function (container, rangeData) {
    await _loadInsights();
    window.renderInsights(container, rangeData);
};
window.updateInsightsRange = async function (...args) {
    await _loadInsights();
    window.updateInsightsRange(...args);
};
window.resetInsightsData = async function (...args) {
    await _loadInsights();
    window.resetInsightsData(...args);
};

// ─── Auth Guard + Main Boot ───────────────────────────────────────────────────
const ADMIN_EMAIL = 'laszonaicreation@gmail.com';

onAuthStateChanged(auth, async (user) => {
    // If no user, show login UI (handled inline in admin.html)
    if (!user) {
        setLoadingStatus('Please sign in...');
        showAdminLoginUI();
        return;
    }

    // Auth confirmed — check if admin
    if (user.email !== ADMIN_EMAIL) {
        setLoadingStatus('Access Denied. Redirecting...');
        setTimeout(() => { window.location.replace('/'); }, 1500);
        return;
    }

    // Admin confirmed
    state.user = user;
    state.authUser = user;
    window._sgAuth = auth;

    setLoadingStatus('Loading admin panel...');

    try {
        // Load data + HTML in parallel
        await Promise.all([
            fetchAdminData(),
            loadAdminPanelHTML()
        ]);

        // Load app-admin.js and call initAdmin
        const isMin = window._isMinBuild;
        const adminFile = isMin ? './app-admin.min.js' : './app-admin.js';
        const mod = await import(`${adminFile}?v=${Date.now()}`);

        if (typeof mod.initAdmin !== 'function') {
            throw new Error('initAdmin not found in app-admin.js');
        }

        mod.initAdmin({
            db, auth, state, DATA, appId,
            prodCol, catCol, sliderCol, megaCol,
            popupSettingsCol, landingSettingsCol, leadsCol,
            doc, setDoc, addDoc, deleteDoc, updateDoc, getDoc, getDocs,
            collection, increment, writeBatch, arrayUnion,
            query, where, documentId,
            refreshData, renderHome, getAuth,
            getBadgeLabel, getOptimizedUrl, getColumnsCount,
            renderSlider,
            renderInsights: (...args) => window.renderInsights?.(...args)
        });

        window.__adminModuleReady = true;

        // On standalone admin.html, closing the panel should go HOME — not show a blank page.
        // Override hideAdminPanel after app-admin.js sets it up.
        window.hideAdminPanel = () => {
            window.location.href = 'index.html';
        };

        // Set the saved tab in state before showAdminPanel opens
        const urlParams = new URLSearchParams(window.location.search);
        const savedTab = urlParams.get('atab') || state.adminTab || 'products';
        state.adminTab = savedTab;

        // showAdminPanel() only calls populateCatSelect if it had to lazy-load admin-panel.html.
        // Since we pre-loaded it, we must call these manually after showAdminPanel.
        if (typeof window.showAdminPanel === 'function') {
            await window.showAdminPanel();
        } else {
            // Fallback: manual open
            const adminPanel = document.getElementById('admin-panel');
            if (adminPanel) {
                adminPanel.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        }

        // Always populate dropdowns and render — showAdminPanel skips these when HTML is pre-loaded
        if (typeof window.populateCatSelect === 'function') window.populateCatSelect();
        if (typeof window.populateAdminCatFilter === 'function') window.populateAdminCatFilter();
        if (typeof window.populateHomeAdminUI === 'function') window.populateHomeAdminUI();
        if (typeof window.populateLandingProductSelects === 'function') window.populateLandingProductSelects();
        if (typeof window.populateLandingSettingsUI === 'function') window.populateLandingSettingsUI();
        if (typeof window.renderAdminUI === 'function') window.renderAdminUI();

        hideLoadingScreen();
        console.log('[Admin] Panel ready ✅');

    } catch (e) {
        console.error('[Admin] Boot failed:', e);
        setLoadingStatus('Failed to start admin panel. Please refresh the page.');
    }
});

// ─── Admin Login UI (shown when not authenticated) ───────────────────────────
function showAdminLoginUI() {
    hideLoadingScreen();
    const loginEl = document.getElementById('admin-login-screen');
    if (loginEl) loginEl.style.display = 'flex';
}

window.adminSignIn = async function () {
    const emailEl = document.getElementById('admin-login-email');
    const passEl = document.getElementById('admin-login-password');
    const errEl = document.getElementById('admin-login-error');
    if (!emailEl || !passEl) return;

    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
        if (errEl) errEl.textContent = 'Please enter email and password.';
        return;
    }

    try {
        if (errEl) errEl.textContent = '';
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will fire and boot the admin panel
    } catch (e) {
        if (errEl) errEl.textContent = 'Sign in failed. Check credentials.';
        console.error('[Admin Login]', e);
    }
};

window.adminSignInGoogle = async function () {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (e) {
        const errEl = document.getElementById('admin-login-error');
        if (errEl) errEl.textContent = 'Google sign in failed.';
        console.error('[Admin Login Google]', e);
    }
};

// Expose handleImgError (used in admin-panel.html image rendering)
window.handleImgError = function (img) {
    if (img._retried) return;
    img._retried = true;
    const src = img.src || '';
    if (!src.includes('cloudinary.com')) {
        img.classList.add('loaded');
        if (!src || src.endsWith('/img/') || src === 'img/') img.src = 'https://placehold.co/800x800?text=Image';
        return;
    }
    const originalUrl = src.replace(/\/upload\/[^/]+\//, '/upload/');
    if (originalUrl !== src) img.src = originalUrl;
    else img.classList.add('loaded');
};

// Image visibility interval — adds .loaded class to images that are complete
// (same as app.js — required for CSS transition to show images)
setInterval(() => {
    document.querySelectorAll('.img-container img:not(.loaded)').forEach(img => {
        if (img.complete && img.naturalHeight > 0) {
            img.classList.add('loaded');
        } else if (img.complete && img.naturalHeight === 0 && img.src) {
            const src = img.src;
            img.src = '';
            img.src = src;
        }
    });
}, 400);
