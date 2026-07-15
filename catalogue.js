import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, getDocs, doc, getDoc, setDoc, onSnapshot, addDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
    getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
    sendPasswordResetEmail, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getProductDetailUrl } from "./product-detail-utils.js";
import { initSharedNavbar } from "./shared-navbar.js";
import { initSharedAuth } from "./shared-auth.js";
import { mountSharedShell } from "./shared-shell.js?v=3";
import { renderCategoriesSidebarMainLike, renderFavoritesSidebarMainLike } from "./shared-sidebar-renderers.js";
import { createSelectionLink, copyTextToClipboard } from "./shared-selection.js";
import { initCart, openCartSidebar, closeCartSidebar, updateCartBadges, mergeCartOnLogin, clearCart } from "./cart.js";
import { getWishlistItems, initWishlist, toggleWishlist, loadWishlist, clearWishlistOnLogout, updateAllWishlistUI } from "./wishlist.js";

// ─── Firebase Setup ──────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speedgifts.net",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const fbApp = initializeApp(firebaseConfig);
const db = initializeFirestore(fbApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(fbApp);
const appId = firebaseConfig.projectId;

window._sgAuth = auth;
window._sgDb = db;
window._sgAppId = appId;
const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const megaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mega_menus');
const shareCol = collection(db, 'artifacts', appId, 'public', 'data', 'selections');

// ─── State ───────────────────────────────────────────────────────
const INTERNAL_IDS = ['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_', '_hero_config_'];
const SHOP_WISHLIST_KEY = 'speedgifts_wishlist';
const PAGE_SIZE = 20;
const WISHLIST_SYNC_CHANNEL = 'speedgifts_wishlist_sync';
const WISHLIST_SYNC_PING_KEY = 'speedgifts_wishlist_sync_ping';

const DATA = { products: [], categories: [], megaMenus: [] };
Object.defineProperty(window, '_sgDATA', { get: () => DATA, configurable: true });

const state = {
    filter: 'all',
    sort: 'default',
    search: '',
    page: 1,
    selected: [],
    selectionId: null,
    viewMode: 'normal',  // 'normal' | 'compact'
    user: null,
    authUser: null,
    authMode: 'login'
};

const getWishlistIds = () => getWishlistItems();
let sharedNav = null;

// Expose state so wishlist.js can read window._sgState?.user, window._sgDb, window._sgAppId
Object.defineProperty(window, '_sgState', { get: () => state, configurable: true });

// Removed mountSharedShell to keep the catalogue standalone
window.handleCartClick = openCartSidebar;
window.openCartSidebar = openCartSidebar;
window.closeCartSidebar = closeCartSidebar;

// Initialize cart synchronously so badges update immediately after shell mount
initCart({ getProducts: () => DATA.products, getOptimizedUrl });

// Initialize centralized wishlist IMMEDIATELY — reads localStorage so cards render correct state
initWishlist();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function setupSearchBackNavigationStep() {
    try {
        const params = new URLSearchParams(window.location.search);
        const q = (params.get('q') || '').trim();
        if (!q || state.selectionId) return;

        // Apply this only when user comes from home/main page.
        const ref = document.referrer ? new URL(document.referrer) : null;
        const fromSameOrigin = ref && ref.origin === window.location.origin;
        const fromHome = fromSameOrigin && (
            ref.pathname === '/' ||
            ref.pathname.endsWith('/index.html') ||
            ref.pathname.endsWith('/index.dev.html')
        );
        if (!fromHome) return;
        if (window.history.state?.shopSearchStacked) return;

        const baseParams = new URLSearchParams(params);
        baseParams.delete('q');
        const baseUrl = `${window.location.pathname}${baseParams.toString() ? `?${baseParams.toString()}` : ''}`;
        const searchUrl = `${window.location.pathname}?${params.toString()}`;

        // Stack: [shop base] -> [shop search]
        // So first browser back goes to shop base, second back returns to index.
        window.history.replaceState({ shopSearchStacked: true, step: 'base' }, '', baseUrl);
        window.history.pushState({ shopSearchStacked: true, step: 'search' }, '', searchUrl);
    } catch (err) {
        console.warn('[ShopPage] back stack setup skipped:', err);
    }
}

function getDefaultCategoryId() {
    const sorted = [...(DATA.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sorted[0]?.id || 'all';
}
function refreshAuthUI() {
    const navBtn = document.getElementById('nav-user-btn');
    if (navBtn) navBtn.classList.toggle('text-black', !!state.authUser);
    const accountName = document.getElementById('account-user-name');
    const accountEmail = document.getElementById('account-user-email');
    if (accountName) accountName.innerText = state.authUser?.displayName || 'User';
    if (accountEmail) accountEmail.innerText = state.authUser?.email || '';
}

// ─── Boot ────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        await signInAnonymously(auth).catch(() => { });
        return;
    }
    state.user = user;
    state.authUser = user.isAnonymous ? null : user;
    refreshAuthUI();

    updateCartBadges();

    if (!user.isAnonymous) {
        mergeCartOnLogin(user.uid);
        // Sync wishlist with cloud now that user is authenticated
        loadWishlist();
    }
    await fetchData();
});

async function fetchData() {
    try {
        const [pSnap, cSnap, mSnap] = await Promise.all([
            getDocs(prodCol),
            getDocs(catCol),
            getDocs(megaCol).catch(() => ({ docs: [] }))
        ]);

        DATA.products = pSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => {
                if (INTERNAL_IDS.includes(p.id)) return false;
                if (!p.name || String(p.name).trim() === '' || String(p.name).toLowerCase() === 'undefined') return false;
                const sCount = p.stockCount !== undefined ? p.stockCount : (p.inStock !== false ? 100 : 0);
                return sCount > 0;
            });

        DATA.categories = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        DATA.megaMenus = mSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        // Read URL params for deep linking
        const params = new URLSearchParams(window.location.search);
        const urlCat = params.get('c');
        const urlQ = params.get('q');
        const shareId = params.get('s');
        if (urlCat && urlCat !== 'all') state.filter = urlCat;
        if (urlQ) state.search = urlQ;

        // Better first load UX: start with all products unless URL/search forces a filter.
        if ((!urlCat || urlCat === 'all') && !state.search) {
            state.filter = 'all';
        }

        if (shareId) {
            try {
                const selDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'selections', shareId));
                if (selDoc.exists()) {
                    state.selectionId = shareId;
                    state.selected = Array.isArray(selDoc.data().ids) ? selDoc.data().ids : [];
                    state.filter = 'all';
                    state.search = '';
                    state.page = 1;
                }
            } catch (err) {
                console.error('[ShopPage] selection load error:', err);
            }
        }

        // setupSearchBackNavigationStep(); // Removed per user request

        // Render products — wishlist already loaded via initWishlist() above
        renderCategoryChips();
        renderMobileVisualCategories();
        renderMobCatList();
        renderDesktopMegaMenu();
        renderFilterBanner();
        renderProducts();
        // Removed sharedNav init to keep catalogue standalone
        hideSkeleton();
        bindSearchInputs();
        setMobileCategorySearchVisibility();
        updateSelectionBar();
    } catch (err) {
        console.error('[ShopPage] fetchData error:', err);
        hideSkeleton();
        showEmpty();
    }
}

// ─── Wishlist ─────────────────────────────────────────────────────
window._sgWishlistCallback = () => {
    // Re-render all product card heart states when wishlist changes
    updateAllWishlistUI();
    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) {
        renderFavoritesSidebarLikeMain();
    }
    sharedNav?.refresh();
};

window.toggleCardWish = (e, id) => {
    if (e) e.stopPropagation();
    window.toggleWishlist(e, id);
};

// ─── Image helpers ────────────────────────────────────────────────
function getOptimizedUrl(url, width) {
    if (url && typeof url === 'string' && url.includes('firebasestorage.googleapis.com')) {
        if (width && width <= 600 && url.includes('.webp?')) {
            return url.replace('.webp?', '_thumb.webp?');
        }
        return url;
    }

    if (!url || typeof url !== 'string') return url;
    if (url.includes('res.cloudinary.com') && width) {
        return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
    }
    return url;
}

function getFirstImage(p) {
    const candidates = [...(p.images || []), p.img, p.img2, p.img3];
    return candidates.find(u => u && u !== 'img/') || '';
}

function renderFavoritesSidebarLikeMain() {
    renderFavoritesSidebarMainLike({
        wishlist: getWishlistItems(),
        products: DATA.products,
        getOptimizedUrl: (url, w) => getOptimizedUrl(url || '', w),
        onItemClickJs: (p) => `window.closeFavoritesSidebar(); goToProduct('${p.originalId}')`,
        onRemoveClickJs: (p) => `window.toggleWishlist(null, '${p.originalId}')`
    });
}

function renderCategoriesSidebarLikeMain() {
    renderCategoriesSidebarMainLike({
        categories: DATA.categories,
        products: DATA.products,
        getOptimizedUrl,
        onSelectCategoryJs: "window.closeCategoriesSidebar();"
    });
}

// ─── Filter / Sort / Search ───────────────────────────────────────
window.applyFilter = (catId) => {
    state.filter = catId;
    state.page = 1;
    renderProducts();
};

window.applySort = (val) => {
    state.sort = val || 'default';
    state.page = 1;
    document.querySelectorAll('.price-option').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${state.sort}'`));
    });
    renderProducts();
};

window.updateMobSort = (btn) => {
    document.querySelectorAll('.sort-option').forEach(b => b.classList.remove('active'));
    // mark both desktop and mobile versions
    document.querySelectorAll(`.sort-option[data-sort="${btn.dataset.sort}"]`)
        .forEach(b => b.classList.add('active'));
};

window.togglePriceDropdown = () => {
    const dd = document.getElementById('price-filter-dropdown');
    const trigger = document.getElementById('price-filter-trigger');
    if (!dd || !trigger) return;
    const willOpen = dd.classList.contains('hidden');
    dd.classList.toggle('hidden', !willOpen);
    trigger.classList.toggle('open', willOpen);
};

window.selectPriceSort = (val) => {
    window.applySort(val);
    const dd = document.getElementById('price-filter-dropdown');
    const trigger = document.getElementById('price-filter-trigger');
    if (dd) dd.classList.add('hidden');
    if (trigger) trigger.classList.remove('open');
};

function getFilteredSorted() {
    const q = state.search.trim().toLowerCase();
    let list;
    if (state.selectionId && !q) {
        const selectedSet = new Set(state.selected || []);
        list = DATA.products.filter(p => selectedSet.has(p.id));
    } else {
        list = [...DATA.products];
    }

    // Category filter
    if (!q && state.filter !== 'all') {
        list = list.filter(p => String(p.catId) === String(state.filter));
    }

    // Search
    if (q) {
        const terms = q.split(/\s+/).filter(Boolean);
        list = list.filter(p => {
            const searchStr = ` ${p.name || ''} ${p.desc || ''} ${p.material || ''} `.toLowerCase();
            return terms.every(term => {
                // escape special regex characters
                const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // match if term is at the start of a word (preceded by non-word character)
                return new RegExp(`(?:^|\\W)${safeTerm}`, 'i').test(searchStr);
            });
        });
    }

    // Sort
    if (state.sort === 'price-asc') {
        list.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    } else if (state.sort === 'price-desc') {
        list.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
    } else if (state.sort === 'name-asc') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (state.sort === 'new') {
        list.sort((a, b) => {
            const getTs = p => (p.createdAt?.seconds || p.createdAt || 0);
            return getTs(b) - getTs(a);
        });
    }

    return list;
}

// ─── Render Flipbook ───────────────────────────────────────────────────────

let pageFlip = null;

function renderProducts(append = false) {
    if (append) return; // Pagination is disabled for flipbook; we render all at once
    renderFlipbook();
}

// ─── Shared HTML Generation for Flipbook & PDF ────────────────────────────────
function generateCataloguePagesHTML(isPdf = false, liveW = 420, liveH = 594) {
    const sortedCats = [...DATA.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    const allProducts = [...DATA.products];
    const catProducts = {};
    sortedCats.forEach(cat => {
        catProducts[cat.id] = allProducts.filter(p => String(p.catId) === String(cat.id));
    });
    const categorisedIds = new Set(allProducts.filter(p => sortedCats.some(c => String(c.id) === String(p.catId))).map(p => p.id));
    const uncategorised = allProducts.filter(p => !categorisedIds.has(p.id));
    const itemsPerPage = 3;

    let pages = [];


    // Determine TOC rows
    const allTocRowsData = [];
    sortedCats.forEach(cat => {
        const prods = catProducts[cat.id] || [];
        if (prods.length > 0) allTocRowsData.push({ id: cat.id, name: cat.name, count: prods.length });
    });
    // Uncategorised products are ignored

    const tocRowsPerPage = 22;
    const tocPagesCount = Math.max(1, Math.ceil(allTocRowsData.length / tocRowsPerPage));

    // Calculate page start indexes (0-based: 0=cover, 1 to N=TOC, N+1+=products)
    let currentPageIdx = 1 + tocPagesCount;
    const catPageStart = {};
    let uncatPageStart = null;
    
    allTocRowsData.forEach(item => {
        if (item.id === '__other__') {
            uncatPageStart = currentPageIdx;
            currentPageIdx += Math.ceil(item.count / itemsPerPage);
        } else {
            catPageStart[item.id] = currentPageIdx;
            currentPageIdx += Math.ceil(item.count / itemsPerPage);
        }
    });

    // PAGE 1: Front Cover
    pages.push(`
        <div class="page" data-density="hard" style="${isPdf ? 'page-break-after: always;' : ''}">
            <div class="page-content cover-page" style="${isPdf ? 'width: 420px; height: 594px; background: #0f0f11;' : ''}">
                <div class="cover-pattern"></div>
                <div class="cover-inner">
                    <div class="cover-year">2026</div>
                    <div class="cover-line"></div>
                    <h1 class="cover-title">SPEED GIFTS</h1>
                    <p class="cover-subtitle">Gifting Collection</p>
                    <div class="cover-footer">PREMIUM SELECTION</div>
                </div>
            </div>
        </div>
    `);

    // TOC PAGES
    for (let i = 0; i < tocPagesCount; i++) {
        const chunk = allTocRowsData.slice(i * tocRowsPerPage, (i + 1) * tocRowsPerPage);
        let tocRowsHTML = '';
        chunk.forEach(item => {
            const startPg = (item.id === '__other__' ? uncatPageStart : catPageStart[item.id]) + 1;
            const endPg = startPg + Math.ceil(item.count / itemsPerPage) - 1;
            const pageLabel = startPg === endPg ? `${startPg}` : `${startPg}–${endPg}`;
            const targetIdx = item.id === '__other__' ? uncatPageStart : catPageStart[item.id];
            tocRowsHTML += `<div class="toc-row" ${!isPdf ? `onclick="window.flipToPage(${targetIdx})"` : ''}><span class="toc-cat-name">${item.name}</span><span class="toc-dots"></span><span class="toc-page-num">${pageLabel}</span></div>`;
        });
        
        pages.push(`
            <div class="page" style="${isPdf ? 'page-break-after: always;' : ''}">
                <div class="page-content toc-page" style="${isPdf ? 'width: 420px; height: 594px; background: #fff;' : ''}">
                    <p class="toc-heading">Contents ${tocPagesCount > 1 ? `(${i + 1}/${tocPagesCount})` : ''}</p>
                    <div class="toc-list">${tocRowsHTML}</div>
                </div>
            </div>
        `);
    }

    // PAGE 3+: Products grouped by category
    const makeElegantProductRow = (p, idx, isPdf) => {
        // Use 1200px width to guarantee ultra-high resolution images for the native print engine
        const imgUrl = getOptimizedUrl(getFirstImage(p), 1200);
        const isImageLeft = (idx % 2 !== 0); // Middle product (index 1) gets image on left

        // Demo short description for all catalogue products
        const dummyDesc = "Premium quality product crafted with excellence. Perfect for corporate gifting or personal use. Contact us for bulk orders.";
        
        // Old price calculation (dummy calculation for UI if not present)
        const newPrice = p.price || 0;
        const oldPrice = p.oldPrice || Math.floor(newPrice * 1.25);

        const imgBlock = `
            <div class="elegant-img-block">
                <div class="elegant-img-bg"></div>
                ${imgUrl ? `<img src="${imgUrl}" class="elegant-img" alt="${(p.name || '').replace(/"/g, '&quot;')}" crossorigin="anonymous">` : '<div class="elegant-img-placeholder"></div>'}
            </div>
        `;

        const textBlock = `
            <div class="elegant-text-block">
                <h3 class="elegant-title">${p.name || 'Premium Product'}</h3>
                <p class="elegant-desc">${dummyDesc}</p>
                <div class="elegant-price-wrap">
                    ${oldPrice > newPrice ? `<span class="elegant-old-price">${oldPrice} AED</span>` : ''}
                    <span class="elegant-new-price">${newPrice} AED</span>
                </div>
                <button class="elegant-shop-btn" ${!isPdf ? `onclick="goToProduct('${p.id}')"` : ''}>SHOP NOW</button>
            </div>
        `;

        return `
            <div class="elegant-row ${isImageLeft ? 'reverse' : ''}">
                ${textBlock}
                ${imgBlock}
            </div>
        `;
    };

    sortedCats.forEach(cat => {
        const prods = catProducts[cat.id] || [];
        if (prods.length === 0) return;
        for (let i = 0; i < prods.length; i += itemsPerPage) {
            const chunk = prods.slice(i, i + itemsPerPage);
            pages.push(`
                <div class="page" style="${isPdf ? 'page-break-after: always;' : ''}">
                    <div class="page-content elegant-page" style="${isPdf ? 'width: 420px; height: 594px; background: #fff;' : ''}">
                        <div class="elegant-page-header">${cat.name}</div>
                        <div class="elegant-product-list">
                            ${chunk.map((p, idx) => makeElegantProductRow(p, idx, isPdf)).join('<div class="elegant-divider"></div>')}
                        </div>
                    </div>
                </div>
            `);
        }
    });


    // Back Cover
    pages.push(`
        <div class="page" data-density="hard" style="${isPdf ? 'page-break-after: always;' : ''}">
            <div class="page-content" style="
                ${isPdf ? 'width: 420px; height: 594px;' : ''}
                background: linear-gradient(135deg, #0a0a0a 0%, #171717 100%);
                color: #fff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 40px;
                position: relative;
                overflow: hidden;
            ">
                <!-- Subtle premium background glows -->
                <div style="position: absolute; top: -10%; left: -10%; width: 70%; height: 70%; background: radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 60%); border-radius: 50%;"></div>
                <div style="position: absolute; bottom: -20%; right: -10%; width: 60%; height: 60%; background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%); border-radius: 50%;"></div>
                
                <!-- Icon container -->
                <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 2;">
                    <i class="fa-brands fa-whatsapp" style="font-size:26px; color: #fff;"></i>
                </div>
                
                <!-- Typography -->
                <h2 style="font-family: 'Inter', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 12px; line-height: 1.2; position: relative; z-index: 2;">Ready to create<br><span style="color: #888;">something special?</span></h2>
                
                <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #737373; margin-bottom: 40px; max-width: 240px; line-height: 1.6; position: relative; z-index: 2;">Reach out for corporate gifting, bulk orders, or custom personalization requests.</p>
                
                <!-- Call to Action -->
                ${!isPdf ? `
                <a href="https://wa.me/971561010387" target="_blank" style="
                    background: #fff;
                    color: #000;
                    text-decoration: none;
                    font-family: 'Inter', sans-serif;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.15em;
                    text-transform: uppercase;
                    padding: 14px 32px;
                    border-radius: 100px;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    transition: transform 0.2s ease;
                    position: relative; z-index: 2;
                ">
                    Chat on WhatsApp
                    <i class="fa-solid fa-arrow-right" style="font-size: 10px;"></i>
                </a>
                ` : `
                <div style="
                    background: rgba(255,255,255,0.05);
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.15em;
                    text-transform: uppercase;
                    padding: 12px 28px;
                    border-radius: 100px;
                    border: 1px solid rgba(255,255,255,0.15);
                    position: relative; z-index: 2;
                ">
                    +971 56 101 0387
                </div>
                `}
                
                <!-- Footer logo/text -->
                <div style="position: absolute; bottom: 30px; width: 100%; text-align: center; z-index: 2;">
                    <p style="font-family: 'Poppins', sans-serif; font-size: 8px; color: #333; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600;">speedgifts.net</p>
                </div>
            </div>
        </div>
    `);

    return pages.join('');
}

function renderFlipbook() {
    const container = document.getElementById('flipbook');
    const skeleton = document.getElementById('skeleton-grid');
    const controls = document.getElementById('flipbook-controls');
    const pageCounter = document.getElementById('page-counter');

    if (!container) return;

    // Hide container while generating raw HTML
    container.style.opacity = '0';
    if (pageFlip) { pageFlip.destroy(); pageFlip = null; }
    container.innerHTML = generateCataloguePagesHTML(false);
    
    // Add an artificial delay to show the elegant loading animation
    setTimeout(() => {
        // Initialize flipbook FIRST so raw HTML is formatted
        try {
            const isMobile = window.innerWidth < 768;
            // The container wrapper helps center the scaled element
            const wrapper = document.getElementById('flipbook-wrapper');
            container.style.width = isMobile ? '420px' : '840px';
            container.style.height = '594px';

            pageFlip = new window.St.PageFlip(container, {
                width: 420, height: 594, size: 'fixed',
                maxShadowOpacity: 0.3, showCover: true,
                usePortrait: isMobile, mobileScrollSupport: false
            });

            // Lock design ratio and prevent reflow by using CSS scaling
            const scaleFlipbook = () => {
                const targetW = isMobile ? 420 : 840;
                const targetH = 594;
                // Subtract 40px (20px each side) to ensure it never touches the screen edges
                const availableW = wrapper.clientWidth - 40;
                // Allow some vertical breathing room
                const availableH = window.innerHeight * 0.85; 
                
                const scale = Math.min(availableW / targetW, availableH / targetH);
                
                container.style.transform = `scale(${scale})`;
                container.style.transformOrigin = 'center center';
                wrapper.style.height = `${targetH * scale}px`;
            };

            window.addEventListener('resize', scaleFlipbook);
            scaleFlipbook(); // initial scale
            pageFlip.loadFromHTML(document.querySelectorAll('.page'));
            const total = pageFlip.getPageCount();
            if (pageCounter) pageCounter.innerText = `Page 1 of ${total}`;
            pageFlip.on('flip', (e) => {
                if (pageCounter) pageCounter.innerText = `Page ${e.data + 1} of ${total}`;
            });
            document.getElementById('btn-prev').onclick = () => { pageFlip.flipPrev(); };
            document.getElementById('btn-next').onclick = () => { pageFlip.flipNext(); };
        } catch (err) {
            console.error('Error initializing PageFlip:', err);
        }

        // Now reveal the flipbook and hide skeleton
        container.style.transition = 'opacity 0.5s ease';
        container.style.opacity = '1';
        container.classList.remove('hidden');

        if (skeleton) {
            skeleton.style.transition = 'opacity 0.5s ease';
            skeleton.style.opacity = '0';
            setTimeout(() => skeleton.style.display = 'none', 500);
        }

        if (controls) {
            controls.classList.remove('hidden');
            controls.classList.add('flex');
            setTimeout(() => controls.classList.remove('opacity-0'), 50);
        }
    }, 1200);
}

// Jump to a specific page by index (called from TOC rows)
window.flipToPage = (pageIdx) => {
    if (!pageFlip) return;
    try { pageFlip.turnToPage(pageIdx); } catch(e) { pageFlip.flip(pageIdx); }
};

// ─── PDF / Print View (Native Browser Engine) ──────────────────────────────
window.openPdfView = async () => {
    const btn = document.getElementById('pdf-btn');
    if (btn) { btn.classList.add('loading'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing High Quality PDF...'; }

    try {
        let printContainer = document.getElementById('native-print-container');
        if (!printContainer) {
            printContainer = document.createElement('div');
            printContainer.id = 'native-print-container';
            document.body.appendChild(printContainer);
        }

        // Generate exactly identical A4 layout HTML
        printContainer.innerHTML = generateCataloguePagesHTML(true);

        // Wait for all images to fully load before triggering print
        const images = Array.from(printContainer.querySelectorAll('img'));
        await Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        }));
        if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Download PDF';
        }

        // Trigger the browser's native high-quality PDF engine
        window.print();
        
        // Clean up the DOM after the print dialog closes
        setTimeout(() => {
            if (printContainer && printContainer.parentNode) {
                printContainer.parentNode.removeChild(printContainer);
            }
        }, 1000);

    } catch (err) {
        console.error('PDF preparation error:', err);
        if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Download PDF';
        }
    }
};


function canUseSelectionControls() { return false; }
function getVisibleSelectionIds(filteredList = null) { return []; }
function updateSelectAllButtonText(filteredList = null) {}
window.toggleSelect = (e, id) => {};
window.toggleSelectAll = () => {};
function updateSelectionBar() {}
window.clearSelection = () => {};
window.shareSelection = async () => {};

window.goToProduct = (id) => {
    try {
        sessionStorage.setItem('speedgifts_shop_scroll', window.scrollY);
        sessionStorage.setItem('speedgifts_shop_url', window.location.href);
    } catch (e) {}
    window.location.href = getProductDetailUrl(id);
};

// ─── Load More (Disabled for Flipbook) ────────────────────────────────────────────────────
window.loadMore = () => {};

// ─── Category Chips ───────────────────────────────────────────────
function renderCategoryChips() {
    const container = document.getElementById('cat-chips');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...DATA.categories].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Keep "All" chip first so users can always reset quickly.
    const allBtn = document.createElement('button');
    allBtn.className = 'cat-chip' + (state.filter === 'all' ? ' active' : '');
    allBtn.dataset.id = 'all';
    allBtn.textContent = 'All';
    allBtn.onclick = () => applyFilter('all');
    container.appendChild(allBtn);

    sorted.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-chip' + (state.filter === cat.id ? ' active' : '');
        btn.dataset.id = cat.id;
        btn.textContent = cat.name;
        btn.onclick = () => applyFilter(cat.id);
        container.appendChild(btn);
    });

    syncChipUI();
}

function renderMobileVisualCategories() {
    const container = document.getElementById('mobile-category-scroll');
    if (!container) return;

    const sorted = [...DATA.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    container.innerHTML = [
        `<button class="category-item category-item-all ${state.filter === 'all' ? 'active' : ''}" data-id="all" onclick="applyFilter('all')">
            <div class="category-img-box">
                <span class="category-all-text">ALL</span>
            </div>
            <span class="category-label">All</span>
        </button>`,
        ...sorted.map(cat => {
            const img = getOptimizedUrl(cat.img, 160) || 'https://placehold.co/160x160?text=Category';
            return `<button class="category-item ${state.filter === cat.id ? 'active' : ''}" data-id="${cat.id}" onclick="applyFilter('${cat.id}')">
                        <div class="category-img-box">
                            <img src="${img}" alt="${(cat.name || 'Category').replace(/"/g, '&quot;')}" onerror="this.src='https://placehold.co/160x160?text=Category'">
                        </div>
                        <span class="category-label">${cat.name || 'Category'}</span>
                    </button>`;
        })
    ].join('');

    container.onscroll = () => updateMobileCategoryProgress();
    syncMobileVisualCatUI();
    updateMobileCategoryProgress();
}

function renderDesktopMegaMenu() {
    const container = document.getElementById('desk-mega-menu');
    const wrapper = document.getElementById('desktop-mega-menu-wrapper');
    if (!container || !wrapper) return;

    const sortedCats = [...DATA.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    const sortedMega = [...DATA.megaMenus];

    if (!sortedCats.length) {
        wrapper.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    wrapper.style.display = '';

    // Main-page style: multiple top menu items from mega_menus with dropdown cards.
    if (sortedMega.length) {
        const allMenuItem = `
            <li class="mega-menu-li">
                <a class="mega-menu-link" onclick="applyFilter('all')">All Products</a>
            </li>
        `;

        const dynamicItems = sortedMega.map(menu => {
            const mappedCats = (menu.categoryIds || [])
                .map(catId => sortedCats.find(c => c.id === catId))
                .filter(Boolean);

            if (!mappedCats.length) {
                const firstCatId = sortedCats[0]?.id || '';
                const action = firstCatId ? `onclick="applyFilter('${firstCatId}')"` : '';
                return `<li class="mega-menu-li"><a class="mega-menu-link" ${action}>${menu.name || 'Menu'}</a></li>`;
            }

            const cards = mappedCats.map(cat => {
                const img = getOptimizedUrl(cat.img, 100) || 'https://placehold.co/100x100?text=Icon';
                return `
                    <div class="mega-cat-card" onclick="applyFilter('${cat.id}')">
                        <div class="mega-cat-img-wrap">
                            <img src="${img}" alt="${(cat.name || 'Category').replace(/"/g, '&quot;')}" onerror="this.src='https://placehold.co/100x100?text=Icon'">
                        </div>
                        <span class="mega-cat-name">${cat.name || 'Category'}</span>
                        <i class="fa-solid fa-chevron-right mega-cat-arrow"></i>
                    </div>
                `;
            }).join('');

            return `
                <li class="mega-menu-li">
                    <a class="mega-menu-link">${menu.name || 'Menu'} <i class="fa-solid fa-chevron-down mega-menu-arrow"></i></a>
                    <div class="mega-dropdown-panel">${cards}</div>
                </li>
            `;
        }).join('');

        container.innerHTML = allMenuItem + dynamicItems;
        return;
    }

    // Fallback if mega menus are not configured: show direct category links.
    container.innerHTML = `<li class="mega-menu-li"><a class="mega-menu-link" onclick="applyFilter('all')">All Products</a></li>` + sortedCats
        .map(cat => `<li class="mega-menu-li"><a class="mega-menu-link" onclick="applyFilter('${cat.id}')">${cat.name || 'Category'}</a></li>`)
        .join('');
}

function syncChipUI() {
    document.querySelectorAll('.cat-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === state.filter);
    });
    // Scroll active chip into view
    const activeChip = document.querySelector('.cat-chip.active');
    if (activeChip) {
        activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    syncMobileVisualCatUI();
}

function syncMobileVisualCatUI() {
    const wrap = document.getElementById('mobile-category-scroll');
    if (!wrap) return;
    wrap.querySelectorAll('.category-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === state.filter);
    });
    const active = wrap.querySelector('.category-item.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    updateMobileCategoryProgress();
}

function updateMobileCategoryProgress() {
    const wrap = document.getElementById('mobile-category-scroll');
    const bar = document.getElementById('mobile-category-progress-bar');
    if (!wrap || !bar) return;
    const maxScroll = wrap.scrollWidth - wrap.clientWidth;
    if (maxScroll <= 0) {
        bar.style.width = '30%';
        return;
    }
    const ratio = wrap.scrollLeft / maxScroll;
    const width = 20 + ratio * 80;
    bar.style.width = `${width}%`;
}

// ─── Mobile Category List ─────────────────────────────────────────
function renderMobCatList() {
    const container = document.getElementById('mob-cat-list');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...DATA.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    const allBtn = document.createElement('button');
    allBtn.className = 'mob-cat-item' + (state.filter === 'all' ? ' active' : '');
    allBtn.dataset.id = 'all';
    allBtn.innerHTML = `<div class="mob-cat-item-dot"><i class="fa-solid fa-layer-group"></i></div><span>All</span>`;
    allBtn.onclick = () => { applyFilter('all'); syncMobCatUI(); };
    container.appendChild(allBtn);

    sorted.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'mob-cat-item' + (state.filter === cat.id ? ' active' : '');
        btn.dataset.id = cat.id;

        const imgHtml = cat.img && cat.img !== 'img/'
            ? `<img src="${getOptimizedUrl(cat.img, 80)}" alt="${cat.name}" onerror="this.style.display='none'">`
            : `<div class="mob-cat-item-dot"><i class="fa-solid fa-tag"></i></div>`;

        btn.innerHTML = `${imgHtml}<span>${cat.name}</span>`;
        btn.onclick = () => { applyFilter(cat.id); syncMobCatUI(); };
        container.appendChild(btn);
    });
}

function syncMobCatUI() {
    document.querySelectorAll('.mob-cat-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === state.filter);
    });
}

// ─── Filter Banner ────────────────────────────────────────────────
function renderFilterBanner() {
    const banner = document.getElementById('filter-banner');
    const titleEl = document.getElementById('filter-title');
    const subEl = document.getElementById('filter-subtitle');

    if (!banner) return;

    banner.classList.remove('hidden');

    if (state.search) {
        if (titleEl) titleEl.textContent = 'Search Results';
        if (subEl) subEl.textContent = 'Premium Curated Selection';
    } else if (state.selectionId) {
        if (titleEl) titleEl.textContent = 'Shared Selection';
        if (subEl) subEl.textContent = 'Curated items shared with you';
    } else if (state.filter !== 'all') {
        const cat = DATA.categories.find(c => c.id === state.filter);
        if (titleEl) titleEl.textContent = cat ? cat.name : 'Products';
        if (subEl) subEl.textContent = 'Premium Curated Selection';
    } else {
        if (titleEl) titleEl.textContent = 'All Products';
        if (subEl) subEl.textContent = 'Premium Curated Selection';
    }
}

// ─── Search ───────────────────────────────────────────────────────
function setMobileCategorySearchVisibility() {
    const section = document.getElementById('mobile-category-visual');
    if (!section) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) {
        section.classList.remove('search-hide');
        return;
    }
    if (state.selectionId) {
        section.classList.add('search-hide');
        return;
    }
    const hasSearch = !!state.search?.trim();
    const mobInput = document.getElementById('mob-shop-search');
    const isFocused = document.activeElement === mobInput;
    section.classList.toggle('search-hide', hasSearch || isFocused);
}

function bindSearchInputs() {
    const deskInput = document.getElementById('shop-search');
    const mobInput = document.getElementById('mob-shop-search');
    const deskClear = document.getElementById('shop-clear-btn');
    const mobClear = document.getElementById('mob-clear-btn');

    // Always sync from URL/state so search text remains visible after redirect from home.
    const urlQ = new URLSearchParams(window.location.search).get('q') || '';
    if (urlQ && !state.search) state.search = urlQ;
    if (deskInput) deskInput.value = state.search || '';
    if (mobInput) mobInput.value = state.search || '';
    const hasInitialVal = !!(state.search && state.search.trim().length > 0);
    if (deskClear) deskClear.style.display = hasInitialVal ? 'flex' : 'none';
    if (mobClear) {
        if (hasInitialVal) mobClear.classList.remove('hidden');
        else mobClear.classList.add('hidden');
    }

    let debounceTimer;
    const handleInput = (val) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            state.search = val.trim();
            state.page = 1;
            updateURL();
            renderFilterBanner();
            renderProducts();
            setMobileCategorySearchVisibility();

            // Sync both inputs
            if (deskInput && deskInput.value !== val) deskInput.value = val;
            if (mobInput && mobInput.value !== val) mobInput.value = val;

            // Clear buttons
            const hasVal = val.length > 0;
            if (deskClear) deskClear.style.display = hasVal ? 'flex' : 'none';
            if (mobClear) {
                if (hasVal) mobClear.classList.remove('hidden');
                else mobClear.classList.add('hidden');
            }
        }, 280);
    };

    if (deskInput) deskInput.addEventListener('input', e => handleInput(e.target.value));
    if (mobInput) mobInput.addEventListener('input', e => handleInput(e.target.value));

    if (mobInput) {
        mobInput.addEventListener('focus', () => {
            setMobileCategorySearchVisibility();
        });
        mobInput.addEventListener('blur', () => {
            // let clear button clicks finish before restoring section
            setTimeout(() => setMobileCategorySearchVisibility(), 120);
        });
    }
}

window.clearSearch = () => {
    state.search = '';
    state.page = 1;
    const deskInput = document.getElementById('shop-search');
    const mobInput = document.getElementById('mob-shop-search');
    const deskClear = document.getElementById('shop-clear-btn');
    const mobClear = document.getElementById('mob-clear-btn');
    if (deskInput) deskInput.value = '';
    if (mobInput) mobInput.value = '';
    if (deskClear) deskClear.style.display = 'none';
    if (mobClear) mobClear.classList.add('hidden');
    updateURL();
    renderFilterBanner();
    renderProducts();
    setMobileCategorySearchVisibility();
};

window.focusMobSearch = () => {
    const input = document.getElementById('mob-shop-search');
    if (input) {
        input.focus();
        setMobileCategorySearchVisibility();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

// ─── URL sync ─────────────────────────────────────────────────────
function updateURL() {
    const params = new URLSearchParams();
    if (state.selectionId) params.set('s', state.selectionId);
    if (state.filter !== 'all') params.set('c', state.filter);
    if (state.search) params.set('q', state.search);
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
}

function applyStateFromCurrentUrl() {
    const params = new URLSearchParams(window.location.search);
    const urlCat = params.get('c');
    const urlQ = params.get('q');
    const urlS = params.get('s');

    state.search = urlQ || '';
    state.filter = (urlCat && urlCat !== 'all') ? urlCat : 'all';
    state.page = 1;

    // Back from stacked search -> base shop should exit shared-selection mode.
    if (!urlS) {
        state.selectionId = null;
        state.selected = [];
    }

    const deskInput = document.getElementById('shop-search');
    const mobInput = document.getElementById('mob-shop-search');
    const deskClear = document.getElementById('shop-clear-btn');
    const mobClear = document.getElementById('mob-clear-btn');
    if (deskInput) deskInput.value = state.search;
    if (mobInput) mobInput.value = state.search;
    const hasVal = !!state.search.trim();
    if (deskClear) deskClear.style.display = hasVal ? 'flex' : 'none';
    if (mobClear) mobClear.classList.toggle('hidden', !hasVal);

    syncChipUI();
    syncMobCatUI();
    renderFilterBanner();
    renderProducts();
    setMobileCategorySearchVisibility();
}

// ─── View Toggle ─────────────────────────────────────────────────
window.toggleView = () => {
    const grid = document.getElementById('product-grid');
    const icon = document.getElementById('view-toggle-icon');
    if (!grid) return;

    if (state.viewMode === 'normal') {
        state.viewMode = 'compact';
        grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        grid.style.gap = '8px';
        if (icon) icon.className = 'fa-solid fa-list';
    } else {
        state.viewMode = 'normal';
        grid.style.gridTemplateColumns = '';
        grid.style.gap = '';
        if (icon) icon.className = 'fa-solid fa-grid-2';
    }
};

// ─── Full Screen Image ────────────────────────────────────────────
window.openFullScreen = (url) => {
    const overlay = document.getElementById('img-full-preview');
    const img = document.getElementById('full-preview-img');
    if (!overlay || !img) return;
    img.src = url;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeFullScreen = () => {
    const overlay = document.getElementById('img-full-preview');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
};

// ─── Filter Panel (Mobile) ────────────────────────────────────────
window.openFilterPanel = () => {
    const panel = document.getElementById('filter-panel');
    const overlay = document.getElementById('filter-overlay');
    if (!panel || !overlay) return;
    panel.classList.add('open');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeFilterPanel = () => {
    const panel = document.getElementById('filter-panel');
    const overlay = document.getElementById('filter-overlay');
    if (!panel || !overlay) return;
    panel.classList.remove('open');
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
};

// ─── Skeleton ─────────────────────────────────────────────────────
function hideSkeleton() {
    const skel = document.getElementById('skeleton-grid');
    if (skel) skel.style.display = 'none';
}

function showEmpty() {
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) emptyEl.classList.remove('hidden');
}

// ─── Toast ────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.textContent = msg;
    t.style.display = 'block';
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2200);
}

// ─── Auth modal flow (same behavior as main) ──────────────────────
window.openAuthModal = () => {
    const overlay = document.getElementById('auth-modal-overlay');
    if (!overlay) return;
    overlay.classList.add('opacity-100', 'pointer-events-auto');
    if (state.authUser) {
        document.getElementById('auth-account-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    } else {
        state.authMode = 'login';
        window.updateAuthUI();
        document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    }
    document.body.style.overflow = 'hidden';
};

window.closeAuthModals = () => {
    document.getElementById('auth-modal-overlay')?.classList.remove('opacity-100', 'pointer-events-auto');
    document.getElementById('auth-login-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.getElementById('auth-account-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.body.style.overflow = '';
};

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
        nameGroup?.classList.add('hidden');
        if (submitBtn) submitBtn.innerHTML = `Sign In <i class="fa-solid fa-arrow-right text-[12px]"></i>`;
        if (toggleText) toggleText.innerText = "Don't have an account?";
        if (toggleBtn) toggleBtn.innerText = 'Sign Up';
        forgotWrap?.classList.remove('hidden');
    } else {
        title.innerText = 'Create Account';
        subtitle.innerText = 'Join Speed Gifts';
        nameGroup?.classList.remove('hidden');
        if (submitBtn) submitBtn.innerHTML = `Create Account <i class="fa-solid fa-arrow-right text-[12px]"></i>`;
        if (toggleText) toggleText.innerText = 'Already have an account?';
        if (toggleBtn) toggleBtn.innerText = 'Sign In';
        forgotWrap?.classList.add('hidden');
    }
};

window.handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const name = document.getElementById('auth-name')?.value.trim();
    const btn = document.getElementById('auth-submit-btn');
    if (!email || !password || !btn) return showToast('Please fill all fields');

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
    try {
        if (state.authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Welcome Back!');
        } else {
            if (!name) throw new Error('Please enter your name');
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: name });
            showToast('Account Created!');
        }
        window.closeAuthModals();
        document.getElementById('auth-form')?.reset();
    } catch (err) {
        showToast(window._sgGetFriendlyError ? window._sgGetFriendlyError(err) : (err.message?.replace('Firebase:', '').trim() || 'Authentication Failed'));
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
        showToast('Logged in with Google!');
    } catch {
        showToast('Sign-In Failed or Cancelled');
    }
};

window.handleForgotPassword = async () => {
    const email = document.getElementById('auth-email')?.value.trim();
    if (!email) return showToast('Enter your email first');
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Password reset email sent');
    } catch (err) {
        showToast(window._sgGetFriendlyError ? window._sgGetFriendlyError(err) : (err.message?.replace('Firebase:', '').trim() || 'Error sending reset email'));
    }
};


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
    updateAuthUserUI: refreshAuthUI,
    onSignOut: () => {
        clearWishlistOnLogout();
        clearCart(true);
    },
    showToast
});

// ─── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeFullScreen();
        closeFilterPanel();
        sharedNav?.closeAll();
        window.closeAuthModals?.();
        document.getElementById('price-filter-dropdown')?.classList.add('hidden');
        document.getElementById('price-filter-trigger')?.classList.remove('open');
    }
    // Focus search on '/'
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        const inp = window.innerWidth < 768
            ? document.getElementById('mob-shop-search')
            : document.getElementById('shop-search');
        if (inp) inp.focus();
    }
});

document.addEventListener('click', (e) => {
    const dd = document.getElementById('price-filter-dropdown');
    const trigger = document.getElementById('price-filter-trigger');
    if (!dd || !trigger) return;
    if (!dd.contains(e.target) && !trigger.contains(e.target)) {
        dd.classList.add('hidden');
        trigger.classList.remove('open');
    }
});

window.addEventListener('popstate', () => {
    // Make browser back update UI immediately (search clear + category state)
    applyStateFromCurrentUrl();
});

// ─── Restore exact product position when returning from PDP ───────
function restoreShopReturnPosition() {
    let returnPid = null, savedY = null, returnPage = 1;
    try {
        returnPid = sessionStorage.getItem('speedgifts_shop_return_product');
        savedY = sessionStorage.getItem('speedgifts_shop_scroll');
        returnPage = parseInt(sessionStorage.getItem('speedgifts_shop_return_page') || '1', 10);
    } catch (e) {}
    if (!returnPid && !savedY) return;

    if (Number.isFinite(returnPage) && returnPage > 1 && state.page < returnPage) {
        state.page = returnPage;
        renderProducts(false);
        return;
    }

    let tries = 0;
    const maxTries = 40;
    const attempt = () => {
        const card = returnPid ? document.querySelector(`.product-card[data-id="${returnPid}"]`) : null;
        if (card || (!card && tries >= maxTries)) {
            if (savedY) window.scrollTo({ top: parseInt(savedY, 10) || 0, behavior: 'auto' });
            try {
                sessionStorage.removeItem('speedgifts_shop_return_product');
                sessionStorage.removeItem('speedgifts_shop_scroll');
                sessionStorage.removeItem('speedgifts_shop_return_page');
            } catch (e) {}
            const antiJumpStyle = document.getElementById('anti-jump-style');
            if (antiJumpStyle) antiJumpStyle.remove();
            return;
        }
        tries += 1;
        setTimeout(attempt, 120);
    };
    setTimeout(attempt, 60);
}

window.addEventListener('pageshow', (e) => {
    restoreShopReturnPosition();

    // After BFCache restore, auth.currentUser may still reflect the OLD cached state.
    // auth.authStateReady() waits until Firebase fully resolves the NEW auth state
    // (e.g. returning via history.back() from login page on mobile).
    if (e.persisted) {
        auth.authStateReady().then(() => {
            const user = auth.currentUser;
            if (user && !user.isAnonymous) {
                mergeCartOnLogin(user.uid);
                loadWishlist();
            } else {
                updateCartBadges();
            }
        });
    }
});

