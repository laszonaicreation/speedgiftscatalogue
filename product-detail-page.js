import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, doc, getDoc, setDoc, increment, addDoc, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { renderProductDetailView } from "./product-detail-renderer.js?v=2";
import { registerProductDetailInteractions } from "./product-detail-interactions.js";
import { getProductIdFromSearch, getProductDetailUrl, getShortShareUrl } from "./product-detail-utils.js";
import { mountSharedShell } from "./shared-shell.js?v=3";
import { renderCategoriesSidebarMainLike } from "./shared-sidebar-renderers.js";
import { initCart, openCartSidebar, closeCartSidebar, addToCart, updateCartBadges, mergeCartOnLogin, clearCart } from "./cart.js";
import { initSharedAuth } from "./shared-auth.js";
import { getWishlistItems, initWishlist, toggleWishlist, loadWishlist, clearWishlistOnLogout } from "./wishlist.js";

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speedgifts.net",
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

window._sgAuth = auth;
window._sgDb = db;
window._sgAppId = appId;
const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');

const DATA = { p: [], c: [] };
Object.defineProperty(window, '_sgDATA', { get: () => DATA, configurable: true });
const state = { wishlist: [], currentVar: null };
state.authMode = 'login';
state.authUser = null;
state.user = null;

// Expose state so wishlist.js can read user, currentVar, etc.
Object.defineProperty(window, '_sgState', { get: () => state, configurable: true });

// ── Cart bridge: called by product-detail-interactions.js window.addToCart ──
window.cartAddItem = ({ id, name, price, img, size, color, qty = 1 }) => {
    addToCart({ id, name, price, img, size, color, qty });
    updateCartBadges();
};
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
    // Firebase Storage: use _thumb.webp for fast loading when width <= 600
    if (url.includes('firebasestorage.googleapis.com') && width && width <= 600 && url.includes('.webp?')) {
        return url.replace('.webp?', '_thumb.webp?');
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
window.showToast = showToast;

// ── Sidebar Renderers ─────────────────────────────────────────────────────────
function renderCategoriesSidebar() {
    renderCategoriesSidebarMainLike({
        categories: DATA.c || [],
        products: DATA.p || [],
        getOptimizedUrl,
        onSelectCategoryJs: "window.closeCategoriesSidebar(); window.location.href='shop.html';"
    });
}


window.goBackToHome = () => { window.location.href = 'index.html'; };
window.focusSearch = () => { window.location.href = 'shop.html'; };
function openShopWithSearch(query) {
    const q = String(query || '').trim();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    window.location.href = `shop.html${params.toString() ? `?${params.toString()}` : ''}`;
}
function wireDetailShellSearch() {
    const deskInput = document.getElementById('desk-search');
    const deskClear = document.getElementById('desk-clear-btn');
    if (!deskInput) return;

    deskInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        openShopWithSearch(deskInput.value);
    });
    deskInput.addEventListener('input', () => {
        const q = (deskInput.value || '').trim();
        if (!deskClear) return;
        if (q) deskClear.style.display = 'flex';
        else deskClear.style.display = 'none';
    });
}
window.clearSearch = () => {
    const deskInput = document.getElementById('desk-search');
    const deskClear = document.getElementById('desk-clear-btn');
    if (deskInput) deskInput.value = '';
    if (deskClear) deskClear.style.display = 'none';
};
window.handleFavoritesClick = () => window.location.href = 'favourites.html';
window.openFavoritesSidebar = () => window.location.href = 'favourites.html';
window.closeFavoritesSidebar = () => { };

// Cart sidebar wired from cart.js module globals
window.openCartSidebar = openCartSidebar;
window.closeCartSidebar = closeCartSidebar;
window.handleCartClick = openCartSidebar;
window.openCategoriesSidebar = () => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (!sidebar || !overlay) return;
    renderCategoriesSidebar();
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
};
window.closeCategoriesSidebar = () => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = 'auto';
};
function updateAuthUserUI() {
    const user = auth.currentUser;
    state.authUser = (user && !user.isAnonymous) ? user : null;

    const deskIcon = document.getElementById('desk-user-icon');
    const mobIcon = document.getElementById('mob-user-icon');
    const mobText = document.getElementById('mob-user-text');
    const accountName = document.getElementById('account-user-name');
    const accountEmail = document.getElementById('account-user-email');

    const signedIn = !!state.authUser;
    if (deskIcon) deskIcon.className = 'fa-solid fa-user text-[18px]';
    if (mobIcon) mobIcon.className = 'fa-solid fa-user';
    if (mobText) mobText.innerText = signedIn ? 'Account' : 'Login';
    if (accountName) accountName.innerText = state.authUser?.displayName || 'User';
    if (accountEmail) accountEmail.innerText = state.authUser?.email || '';
}

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
    if (selectedSize) details += `\n   Size: ${selectedSize}`;
    if (selectedColor) details += `\n   Color: ${selectedColor}`;
    if (!selectedSize && !selectedColor && p.size) details += `\n   Size: ${p.size}`;
    const pUrl = getShortShareUrl(id);
    const msg = `Hi Speed Gifts Team,\n\nI would like to inquire about this product:\n\n1. ${p.name}\n   Price: ${price} AED${details}\n\nPlease let me know the availability.\n\nThank you.\n\n${pUrl}`;
    window.trackWhatsAppInquiry(id);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.viewDetail = (id) => {
    const url = getProductDetailUrl(id);
    window.history.pushState({}, '', url);
    renderById(id);
};

// ─── Reviews Logic ────────────────────────────────────────────────────────────
window.submitProductReview = async (productId, name, rating, text, imageFile, submitBtn) => {
    try {
        let imageUrl = null;

        if (imageFile) {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Uploading Photo...";
            }

            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('upload_preset', 'speed_preset');

            const res = await fetch(`https://api.cloudinary.com/v1_1/dxkcvm2yh/image/upload`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error("Image upload failed");
            const data = await res.json();
            imageUrl = data.secure_url;
        }

        if (submitBtn) submitBtn.innerText = "Saving Review...";

        const reviewData = {
            productId: productId,
            reviewerName: name,
            rating: parseInt(rating) || 5,
            reviewText: text,
            createdAt: Date.now(),
            status: 'pending'
        };

        if (imageUrl) reviewData.imageUrl = imageUrl;

        const revCol = collection(db, 'artifacts', appId, 'public', 'data', 'reviews');
        await addDoc(revCol, reviewData);
        window.showToast("Review submitted!");

        // Refresh reviews for the current product
        const updatedReviews = await fetchReviews(productId);
        const approvedReviews = updatedReviews.filter(r => r.status === 'approved');
        const product = DATA.p.find(x => x.id === productId);
        renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: approvedReviews, isUpdate });
    } catch (e) {
        console.error("Failed to submit review", e);
        window.showToast("Failed to submit review");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Post Review";
        }
    }
};

async function fetchReviews(productId) {
    try {
        const revCol = collection(db, 'artifacts', appId, 'public', 'data', 'reviews');
        const q = query(revCol, where("productId", "==", productId), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.warn("Failed to fetch reviews", e);
        // Fallback for missing index:
        try {
            const revCol = collection(db, 'artifacts', appId, 'public', 'data', 'reviews');
            const q = query(revCol, where("productId", "==", productId));
            const snap = await getDocs(q);
            const reviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return reviews.sort((a, b) => b.createdAt - a.createdAt);
        } catch (e2) {
            console.error("Double failure fetching reviews", e2);
            return [];
        }
    }
}

function injectSEO(product, reviews) {
    const url = getProductDetailUrl(product.id);
    const title = `${product.name} | Speed Gifts`;
    const desc = (product.desc || product.details || `Buy ${product.name} at Speed Gifts. Best personalized gifts in UAE.`).replace(/\n/g, ' ').substring(0, 160);
    const image = getOptimizedUrl(product.images?.[0] || product.img, 1000) || 'https://res.cloudinary.com/dxkcvm2yh/image/upload/v1769084529/speed_logo_5552_zuu2n7.png';

    const setMeta = (nameAttr, propertyAttr, content) => {
        let el = document.querySelector(`meta[${nameAttr ? `name="${nameAttr}"` : `property="${propertyAttr}"`}]`);
        if (!el) {
            el = document.createElement('meta');
            if (nameAttr) el.setAttribute('name', nameAttr);
            if (propertyAttr) el.setAttribute('property', propertyAttr);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content);
    };

    document.title = title;
    setMeta('description', null, desc);
    if (product.keywords) {
        setMeta('keywords', null, product.keywords);
    }
    setMeta(null, 'og:title', title);
    setMeta(null, 'og:description', desc);
    setMeta(null, 'og:image', image);
    setMeta(null, 'og:url', url);
    setMeta(null, 'og:type', 'product');

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    const schemaId = 'seo-schema-script';
    let script = document.getElementById(schemaId);
    if (!script) {
        script = document.createElement('script');
        script.id = schemaId;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
    }

    const schema = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.name,
        "image": image,
        "description": desc,
        "sku": product.id,
        "brand": {
            "@type": "Brand",
            "name": "Speed Gifts"
        },
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "AED",
            "price": product.price,
            "availability": product.inStock !== false ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition"
        }
    };

    if (reviews && reviews.length > 0) {
        const ratingSum = reviews.reduce((acc, r) => acc + r.rating, 0);
        const avgRating = (ratingSum / reviews.length).toFixed(1);
        schema.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": avgRating,
            "reviewCount": reviews.length
        };
    }

    script.textContent = JSON.stringify(schema);
}

async function renderById(id, isUpdate = false) {
    const product = DATA.p.find(x => x.id === id);
    if (!product) {
        document.getElementById('app').innerHTML = '<p class="text-center text-gray-500 mt-20">Product not found.</p>';
        return;
    }
    
    // 1. Initial Instant Render (No waiting for reviews)
    if (!isUpdate) {
        injectSEO(product, []);
        renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: [], isUpdate: false });
        trackProductView(id).catch(() => { /* no-op */ });
    }

    // 2. Background Fetch for Reviews and Lazy Render Below-the-fold
    setTimeout(async () => {
        try {
            const reviews = await fetchReviews(id);
            const approvedReviews = reviews.filter(r => r.status === 'approved');
            
            // Inject SEO again to include aggregateRating if there are reviews
            if (approvedReviews.length > 0) {
                injectSEO(product, approvedReviews);
            }
            
            // Re-render only the reviews and recommendations sections
            renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: approvedReviews, isUpdate: true });
        } catch(e) {
            console.error("Failed to lazy load reviews:", e);
        }
    }, 100);
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
    mountSharedShell('shop');
    initCart({ getProducts: () => DATA.p, getOptimizedUrl });
    wireDetailShellSearch();
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
        setAuthMode: (mode) => { state.authMode = mode; },
        getAuthMode: () => state.authMode,
        updateAuthUserUI,
        onSignOut: () => {
            clearWishlistOnLogout();
            clearCart(true);
        },
        showToast
    });
    onAuthStateChanged(auth, async (u) => {
        // Always keep state.user current so wishlist.js (_sgState.user) works
        state.user = u;
        updateAuthUserUI();
        if (!u) {
            await signInAnonymously(auth).catch(() => { /* no-op */ });
            return;
        } else if (!u.isAnonymous) {
            mergeCartOnLogin(u.uid);
            loadWishlist(); // Sync wishlist from cloud on login
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

    initWishlist();


    // Fast-path: render from session cache immediately (if available),
    // then sync with Firestore in background.
    const cached = readDetailCache(id);
    let initialRenderDone = false;

    // 1. First priority: Injected SSR Data (Fastest, zero layout shift)
    if (window.__INJECTED_PRODUCT__ && window.__INJECTED_PRODUCT__.id === id) {
        DATA.p = [window.__INJECTED_PRODUCT__];
        await renderById(id);
        initialRenderDone = true;
    }
    // 2. Second priority: Session cache
    else if (cached) {
        DATA.p = [cached.product];
        DATA.c = Array.isArray(cached.categories) ? cached.categories : [];
        await renderById(id);
        initialRenderDone = true;
    }

    // Always fetch the live product in the background for "Stale-While-Revalidate"
    let liveProduct = null;
    try {
        const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', id);
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
            liveProduct = { id: productSnap.id, ...productSnap.data() };
            // Replace the cached product with the live one
            const pIdx = DATA.p.findIndex(p => p.id === id);
            if (pIdx > -1) DATA.p[pIdx] = liveProduct;
            else DATA.p.push(liveProduct);
            
            if (!initialRenderDone) {
                await renderById(id);
                initialRenderDone = true;
            }
        }
    } catch (e) { console.warn("Single fetch failed:", e); }

    // Background fetch: load categories for sidebar and ONLY related products for recommendations.
    // This avoids blocking the main thread by fetching the entire catalog!
    let recommendationsQuery = prodCol; // fallback if no catId
    const currentProduct = liveProduct || DATA.p.find(p => p.id === id);
    if (currentProduct && currentProduct.catId) {
        recommendationsQuery = query(prodCol, where('catId', '==', String(currentProduct.catId)), limit(8));
    } else {
        recommendationsQuery = query(prodCol, limit(8));
    }

    const [prodSnap, catSnap] = await Promise.all([getDocs(recommendationsQuery), getDocs(catCol)]);
    
    const relatedProducts = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(p => !['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_', '_hero_config_'].includes(p.id));
        
    // Merge recommendations into DATA.p safely
    const existingIds = new Set(DATA.p.map(p => p.id));
    relatedProducts.forEach(rp => {
        if (!existingIds.has(rp.id)) {
            DATA.p.push(rp);
            existingIds.add(rp.id);
        }
    });

    DATA.c = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderCategoriesSidebar();
    // Final render to populate recommendations, sidebars, AND live update the UI (price/stock)
    await renderById(id, true);
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
