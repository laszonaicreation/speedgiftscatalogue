import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, doc, setDoc, increment } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { renderProductDetailView } from "./product-detail-renderer.js";
import { registerProductDetailInteractions } from "./product-detail-interactions.js";
import { getProductIdFromSearch, getProductDetailUrl } from "./product-detail-utils.js";

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);
const appId = firebaseConfig.projectId;
const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');

const DATA = { p: [], c: [] };
const state = { wishlist: [], currentVar: null };
const WISHLIST_KEY = 'speedgifts_detail_wishlist';
const DETAIL_CACHE_KEY = 'speedgifts_detail_cache';
const HOME_SNAPSHOT_KEY = 'speedgifts_home_snapshot';
const trackedProductViews = new Set();

registerProductDetailInteractions({ getOptimizedUrl, state });

const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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

async function initTrafficTracking() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSrc = (urlParams.get('utm_source') || '').toLowerCase();
    const utmMed = (urlParams.get('utm_medium') || '').toLowerCase();

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
    } else if (urlParams.has('utm_source')) {
        sessionStorage.setItem('traffic_source', urlParams.get('utm_source'));
    } else if (!sessionStorage.getItem('traffic_source')) {
        sessionStorage.setItem('traffic_source', 'Normal');
    }
}

async function trackAdVisit() {
    const today = getTodayStr();
    const sessionKey = `ad_visit_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');
    await waitForAuth();
    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
    await setDoc(statsRef, { adVisits: increment(1) }, { merge: true });
}

async function trackNormalVisit() {
    const today = getTodayStr();
    const sessionKey = `normal_visit_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');
    await waitForAuth();
    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
    await setDoc(statsRef, { normalVisits: increment(1) }, { merge: true });
}

async function trackProductView(id) {
    if (!id || trackedProductViews.has(id)) return;
    trackedProductViews.add(id);
    await waitForAuth();
    const today = getTodayStr();
    const isAd = sessionStorage.getItem('traffic_source') === 'Google Ads';
    const globalField = isAd ? 'adProductClicks' : 'normalProductClicks';

    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
    await setDoc(statsRef, { [globalField]: increment(1) }, { merge: true });

    const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
    const prodField = isAd ? 'adViews' : 'views';
    await setDoc(dailyProdRef, { [prodField]: increment(1), productId: id, date: today }, { merge: true });
}

window.trackWhatsAppInquiry = async (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (sessionStorage.getItem('traffic_source') !== 'Google Ads') return;
    await waitForAuth();
    const today = getTodayStr();
    const dailyStatsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
    await setDoc(dailyStatsRef, { adInquiries: increment(1) }, { merge: true });
    for (const id of idList) {
        if (id !== 'bulk_inquiry') {
            const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
            await setDoc(dailyProdRef, { adInquiries: increment(1), productId: id, date: today }, { merge: true });
        }
    }
};

function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('res.cloudinary.com') && width) {
        return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
    }
    return url;
}

function getBadgeLabel(badge) {
    const labels = {
        new: 'New',
        best: 'Best Seller',
        limited: 'Limited',
        sale: 'Sale',
        trending: 'Trending'
    };
    return labels[badge] || badge;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 2500);
}

function loadWishlist() {
    try {
        const raw = localStorage.getItem(WISHLIST_KEY);
        state.wishlist = raw ? JSON.parse(raw) : [];
    } catch {
        state.wishlist = [];
    }
}

function saveWishlist() {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(state.wishlist));
}

window.toggleWishlist = (event, id) => {
    event?.stopPropagation?.();
    const idx = state.wishlist.findIndex(x => (typeof x === 'string' ? x : x.id) === id);
    if (idx >= 0) {
        state.wishlist.splice(idx, 1);
        showToast('Removed from favorites');
    } else {
        state.wishlist.push(id);
        showToast('Added to favorites');
    }
    saveWishlist();
    const icon = document.querySelector('#detail-wish-btn i');
    if (icon) {
        const active = state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === id);
        icon.className = `${active ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'} text-xl`;
    }
};

window.shareProduct = async (id, name) => {
    const url = getProductDetailUrl(id);
    if (navigator.share) {
        try {
            await navigator.share({ title: name, url });
            return;
        } catch { /* user cancelled */ }
    }
    try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied');
    } catch {
        showToast('Unable to copy link');
    }
};

window.inquireOnWhatsApp = (id, selectedSize = null, selectedPrice = null, selectedColor = null) => {
    const p = DATA.p.find(x => x.id === id);
    if (!p) return;
    const price = selectedPrice || p.price;
    let details = "";
    if (selectedSize) details += `\n*Size:* ${selectedSize}`;
    if (selectedColor) details += `\n*Color:* ${selectedColor}`;
    if (!selectedSize && !selectedColor && p.size) details += `\n*Size:* ${p.size}`;
    const pUrl = getProductDetailUrl(id);
    const msg = `*Inquiry regarding:* ${p.name}\n*Price:* ${price} AED${details}\n\n*Product Link:* ${pUrl}\n\nPlease let me know the availability.`;
    window.trackWhatsAppInquiry(id);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.viewDetail = (id) => {
    const url = getProductDetailUrl(id);
    window.history.pushState({}, '', url);
    renderById(id);
};

async function renderById(id) {
    const product = DATA.p.find(x => x.id === id);
    if (!product) {
        document.getElementById('app').innerHTML = '<p class="text-center text-gray-500 mt-20">Product not found.</p>';
        return;
    }
    document.title = `${product.name} | Speed Gifts`;
    renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel });
    trackProductView(id).catch(() => { /* no-op */ });
}

function readDetailCache(id) {
    try {
        const raw = sessionStorage.getItem(DETAIL_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // keep cache short-lived to avoid stale detail render
        const isFresh = parsed?.ts && (Date.now() - parsed.ts) < 5 * 60 * 1000;
        if (!isFresh || parsed?.id !== id || !parsed?.product) return null;
        return parsed;
    } catch {
        return null;
    }
}

async function bootstrap() {
    onAuthStateChanged(auth, async (u) => {
        if (!u) {
            await signInAnonymously(auth).catch(() => { /* no-op */ });
            return;
        }
        await initTrafficTracking();
        if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
            await trackAdVisit().catch(() => { /* no-op */ });
        } else {
            await trackNormalVisit().catch(() => { /* no-op */ });
        }
    });

    const id = getProductIdFromSearch();
    if (!id) {
        window.location.replace('index.html');
        return;
    }

    loadWishlist();

    // Fast-path: render from session cache immediately (if available),
    // then sync with Firestore in background.
    const cached = readDetailCache(id);
    if (cached) {
        DATA.p = [cached.product];
        DATA.c = Array.isArray(cached.categories) ? cached.categories : [];
        await renderById(id);
    }

    const [prodSnap, catSnap] = await Promise.all([getDocs(prodCol), getDocs(catCol)]);
    DATA.p = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(p => !['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_'].includes(p.id));
    DATA.c = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    await renderById(id);
}

window.addEventListener('popstate', () => {
    const id = getProductIdFromSearch();
    if (id) renderById(id);
});

const backBtn = document.getElementById('detail-back-btn');
if (backBtn) {
    backBtn.addEventListener('click', () => {
        // 1. If came from shop page, go back there (preserves filters/scroll)
        const shopUrl = sessionStorage.getItem('speedgifts_shop_url');
        if (shopUrl && shopUrl.includes('shop.html')) {
            window.location.href = shopUrl;
            return;
        }
        // 2. If came from index (home snapshot)
        try {
            const raw = sessionStorage.getItem(HOME_SNAPSHOT_KEY);
            if (raw) {
                const snapshot = JSON.parse(raw);
                const isFresh = snapshot?.ts && (Date.now() - snapshot.ts) < 10 * 60 * 1000;
                if (isFresh && snapshot?.url) {
                    window.location.href = snapshot.url;
                    return;
                }
            }
        } catch {
            // ignore and fallback
        }
        // 3. Browser back or fallback
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'index.html';
        }
    });
}

bootstrap().catch((err) => {
    console.error(err);
    document.getElementById('app').innerHTML = '<p class="text-center text-red-500 mt-20">Failed to load product detail.</p>';
});
