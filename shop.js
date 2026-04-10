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

// ─── Firebase Setup ──────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
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
const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol  = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const megaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mega_menus');
const shareCol = collection(db, 'artifacts', appId, 'public', 'data', 'selections');

// ─── State ───────────────────────────────────────────────────────
const INTERNAL_IDS = ['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_'];
const SHOP_WISHLIST_KEY = 'speedgifts_detail_wishlist';
const PAGE_SIZE = 20;
const WISHLIST_SYNC_CHANNEL = 'speedgifts_wishlist_sync';
const WISHLIST_SYNC_PING_KEY = 'speedgifts_wishlist_sync_ping';

const DATA   = { products: [], categories: [], megaMenus: [] };
const state  = {
    filter: 'all',
    sort: 'default',
    search: '',
    page: 1,
    selected: [],
    selectionId: null,
    viewMode: 'normal',  // 'normal' | 'compact'
    wishlist: [],
    user: null,
    authUser: null,
    authMode: 'login'
};
let sharedNav = null;
let wishlistUnsub = null;
const wishlistChannel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel(WISHLIST_SYNC_CHANNEL)
    : null;
mountSharedShell('shop');

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
        await signInAnonymously(auth).catch(() => {});
        return;
    }
    state.user = user;
    state.authUser = user.isAnonymous ? null : user;
    refreshAuthUI();
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
            .filter(p => !INTERNAL_IDS.includes(p.id));

        DATA.categories = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        DATA.megaMenus = mSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        // Read URL params for deep linking
        const params = new URLSearchParams(window.location.search);
        const urlCat = params.get('c');
        const urlQ   = params.get('q');
        const shareId = params.get('s');
        if (urlCat && urlCat !== 'all') state.filter = urlCat;
        if (urlQ)                       state.search  = urlQ;

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

        setupSearchBackNavigationStep();

        await loadWishlist();
        renderCategoryChips();
        renderMobileVisualCategories();
        renderMobCatList();
        renderDesktopMegaMenu();
        renderFilterBanner();
        renderProducts();
        sharedNav = initSharedNavbar({
            getWishlistIds: () => state.wishlist,
            getProductById: (id) => DATA.products.find(p => p.id === id),
            getCategories: () => [...DATA.categories].sort((a, b) => (a.order || 0) - (b.order || 0)),
            getProductUrl: (id) => getProductDetailUrl(id),
            getCategoryImage: (item) => {
                const src = item?.images?.[0] || item?.img || getFirstImage(item);
                return getOptimizedUrl(src, 140);
            },
            onWishlistToggle: (id) => window.toggleCardWish({ stopPropagation() {} }, id),
            onCategorySelect: (catId) => window.applyFilter(catId),
            onSearchFocus: () => window.focusMobSearch(),
            onAccountClick: () => window.openAuthModal(),
            renderFavorites: renderFavoritesSidebarLikeMain,
            renderCategories: renderCategoriesSidebarLikeMain,
            onSidebarStateChange: (isOpen) => {
                document.body.style.overflow = isOpen ? 'hidden' : 'auto';
            },
            showToast
        });
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
async function loadWishlist() {
    try {
        const raw = localStorage.getItem(SHOP_WISHLIST_KEY);
        state.wishlist = normalizeWishlistEntries(raw ? JSON.parse(raw) : []);
    } catch { state.wishlist = []; }
    await syncWishlistWithCloud();
    startWishlistRealtimeSync();
}

function saveWishlist() {
    state.wishlist = normalizeWishlistEntries(state.wishlist);
    localStorage.setItem(SHOP_WISHLIST_KEY, JSON.stringify(state.wishlist));
    localStorage.setItem(WISHLIST_SYNC_PING_KEY, String(Date.now()));
    wishlistChannel?.postMessage({ wishlist: state.wishlist, at: Date.now() });
}

function getWishId(entry) {
    return typeof entry === 'string' ? entry : entry?.id;
}

function normalizeWishlistEntries(entries = []) {
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
}

async function syncWishlistWithCloud() {
    if (!state.user) return;
    try {
        const wishRef = doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist');
        const wishDoc = await getDoc(wishRef);
        if (wishDoc.exists()) {
            state.wishlist = normalizeWishlistEntries(wishDoc.data().ids || []);
            saveWishlist();
        } else {
            state.wishlist = normalizeWishlistEntries(state.wishlist);
            saveWishlist();
            await setDoc(wishRef, { ids: state.wishlist });
        }
    } catch (err) {
        console.error('[ShopPage] wishlist sync error:', err);
    }
}

async function persistWishlistToCloud() {
    if (!state.user) return;
    try {
        const wishRef = doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist');
        await setDoc(wishRef, { ids: normalizeWishlistEntries(state.wishlist) });
    } catch (err) {
        console.error('[ShopPage] wishlist persist error:', err);
    }
}

function startWishlistRealtimeSync() {
    if (!state.user) return;
    const wishRef = doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist');
    wishlistUnsub?.();
    wishlistUnsub = onSnapshot(wishRef, (snap) => {
        const cloudIds = normalizeWishlistEntries(snap.exists() ? (snap.data().ids || []) : []);
        state.wishlist = cloudIds;
        saveWishlist();
        renderProducts();
        if (document.getElementById('favorites-sidebar')?.classList.contains('open')) {
            renderFavoritesSidebarLikeMain();
        }
        sharedNav?.refresh();
    }, (err) => {
        console.error('[ShopPage] wishlist listener error:', err);
    });
}

function isWishlisted(id) {
    return state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === id);
}

window.toggleCardWish = (e, id) => {
    e.stopPropagation();
    const idx = state.wishlist.findIndex(x => (typeof x === 'string' ? x : x.id) === id);
    if (idx >= 0) {
        state.wishlist.splice(idx, 1);
    } else {
        state.wishlist.push({ id });
    }
    saveWishlist();
    persistWishlistToCloud();
    const active = isWishlisted(id);
    document.querySelectorAll(`.product-card[data-id="${id}"]`).forEach(card => {
        card.classList.toggle('wish-active', active);
    });
    sharedNav?.refresh();
};

window.addEventListener('storage', (event) => {
    if (event.key !== SHOP_WISHLIST_KEY && event.key !== WISHLIST_SYNC_PING_KEY) return;
    try {
        const raw = localStorage.getItem(SHOP_WISHLIST_KEY);
        state.wishlist = normalizeWishlistEntries(raw ? JSON.parse(raw) : []);
    } catch {
        state.wishlist = [];
    }
    renderProducts();
    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) {
        renderFavoritesSidebarLikeMain();
    }
    sharedNav?.refresh();
});

wishlistChannel?.addEventListener('message', (event) => {
    const incoming = normalizeWishlistEntries(event?.data?.wishlist || []);
    state.wishlist = incoming;
    localStorage.setItem(SHOP_WISHLIST_KEY, JSON.stringify(state.wishlist));
    renderProducts();
    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) {
        renderFavoritesSidebarLikeMain();
    }
    sharedNav?.refresh();
});

// ─── Image helpers ────────────────────────────────────────────────
function getOptimizedUrl(url, width) {
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
        wishlist: state.wishlist,
        products: DATA.products,
        getOptimizedUrl: (url, w) => getOptimizedUrl(url || '', w),
        onItemClickJs: (p) => `window.closeFavoritesSidebar(); goToProduct('${p.originalId}')`,
        onRemoveClickJs: (p) => `window.toggleCardWish({stopPropagation(){ }}, '${p.originalId}')`
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
    // If user is on a shared-selection link, selecting a category should
    // switch back to normal shop browsing for that category.
    if (state.selectionId) {
        state.selectionId = null;
        state.selected = [];
        state.search = '';
    }
    state.filter = catId;
    state.page = 1;
    updateURL();
    syncChipUI();
    syncMobCatUI();
    renderFilterBanner();
    renderProducts();
    closeFilterPanel();
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
        list = DATA.products.filter(p => p.inStock !== false);
    }

    // Category filter
    if (!q && state.filter !== 'all') {
        list = list.filter(p => String(p.catId) === String(state.filter));
    }

    // Search
    if (q) {
        list = list.filter(p =>
            (p.name  || '').toLowerCase().includes(q) ||
            (p.desc  || '').toLowerCase().includes(q) ||
            (p.material || '').toLowerCase().includes(q)
        );
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

// ─── Render ───────────────────────────────────────────────────────
function renderProducts(append = false) {
    const grid = document.getElementById('product-grid');
    const emptyEl = document.getElementById('empty-state');
    const loadMoreWrap = document.getElementById('load-more-wrap');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const resultsEl = document.getElementById('results-count');

    const all = getFilteredSorted();
    const total = all.length;
    const paged = all.slice(0, state.page * PAGE_SIZE);
    const hasMore = total > paged.length;
    const canPaginate = total > PAGE_SIZE;

    if (resultsEl) resultsEl.textContent = `${total} item${total !== 1 ? 's' : ''}`;

    if (total === 0) {
        grid.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        if (loadMoreWrap) loadMoreWrap.classList.add('hidden');
        updateSelectAllButtonText(all);
        updateSelectionBar();
        return;
    }

    emptyEl.classList.add('hidden');
    grid.classList.remove('hidden');

    if (!append) {
        grid.innerHTML = '';
    }

    // Render only newly paged items if appending
    const startIdx = append ? (state.page - 1) * PAGE_SIZE : 0;
    const items = append ? all.slice(startIdx, state.page * PAGE_SIZE) : paged;

    items.forEach((p, i) => {
        const card = buildCard(p, append ? startIdx + i : i);
        grid.appendChild(card);
    });

    updateSelectAllButtonText(all);
    updateSelectionBar();

    // Load more
    if (loadMoreBtn && canPaginate) {
        if (hasMore) {
            loadMoreBtn.innerHTML = `Load More <i class="fa-solid fa-arrow-down"></i>`;
            loadMoreBtn.classList.remove('back-to-top');
        } else {
            loadMoreBtn.innerHTML = `Show Less <i class="fa-solid fa-arrow-up"></i>`;
            loadMoreBtn.classList.add('back-to-top');
        }
    }

    if (!canPaginate) {
        loadMoreWrap.classList.add('hidden');
    } else if (hasMore) {
        loadMoreWrap.classList.remove('hidden');
    } else {
        // Keep visible at list end to show "Show Less"
        loadMoreWrap.classList.remove('hidden');
    }
}

function buildCard(p, index) {
    const img = getFirstImage(p);
    const imgUrl = getOptimizedUrl(img, 600);
    const isWish = isWishlisted(p.id);

    // Price logic — same as main page
    const origP = parseFloat(p.originalPrice);
    const saleP = parseFloat(p.price);
    const hasDiscount = p.originalPrice && origP > saleP;
    const disc = hasDiscount ? Math.round((1 - saleP / origP) * 100) : 0;

    let priceHtml;
    if (hasDiscount) {
        priceHtml = `
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">
                <span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">${p.originalPrice} AED</span>
                <span class="price-tag font-bold" style="margin:0;color:#111111;">${p.price} AED</span>
                <span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-${disc}%</span>
            </div>`;
    } else {
        priceHtml = `<p class="price-tag mt-2 font-bold">${p.price} AED</p>`;
    }

    // Badge labels — same as main page
    const badgeLabels = { new: 'New', best: 'Best Seller', limited: 'Limited', sale: 'Sale', trending: 'Trending' };
    const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${badgeLabels[p.badge] || p.badge}</div>` : '';

    const card = document.createElement('div');
    card.className = `product-card group fade-in cursor-pointer ${isWish ? 'wish-active' : ''} ${state.selected.includes(p.id) ? 'selected' : ''}`;
    card.dataset.id = p.id;
    card.style.animationDelay = `${Math.min(index * 0.04, 0.5)}s`;
    card.onclick = () => goToProduct(p.id);

    card.innerHTML = `
        <div class="img-container mb-4 relative">
            ${badgeHtml}
            <div class="wish-btn shadow-sm hidden-desktop" onclick="event.stopPropagation(); toggleCardWish(event, '${p.id}')">
                <i class="fa-solid fa-heart text-[10px]"></i>
            </div>
            ${canUseSelectionControls() ? `<div class="select-btn shadow-sm" onclick="event.stopPropagation(); toggleSelect(event, '${p.id}')"><i class="fa-solid fa-check text-[10px]"></i></div>` : ''}
            ${imgUrl
                ? `<img
                    src="${imgUrl}"
                    alt="${(p.name || '').replace(/"/g, '&quot;')}"
                    loading="${index < 8 ? 'eager' : 'lazy'}"
                    ${index < 8 ? 'fetchpriority="high"' : ''}
                    class="${index < 8 ? 'loaded' : ''}"
                    onload="this.classList.add('loaded')"
                    onerror="this.src='https://placehold.co/400x500?text=Speed+Gifts'"
                >`
                : `<div style="width:100%;height:100%;background:#f3f4f6;"></div>`
            }
        </div>
        <div class="px-1 text-left flex justify-between items-start shop-card-meta">
            <div class="flex-1 min-w-0">
                <h3 class="capitalize truncate text-gray-900 font-semibold shop-card-title">${p.name || 'Product'}</h3>
                ${priceHtml}
            </div>
            <div class="wish-btn desktop-wish-fix hidden-mobile shop-card-heart" onclick="event.stopPropagation(); toggleCardWish(event, '${p.id}')">
                <i class="fa-solid fa-heart"></i>
            </div>
        </div>
    `;

    return card;
}

function canUseSelectionControls() {
    return !!state.authUser && !state.selectionId;
}

function getVisibleSelectionIds(filteredList = null) {
    const all = filteredList || getFilteredSorted();
    return all.map(p => p.id);
}

function updateSelectAllButtonText(filteredList = null) {
    const selectAllBtn = document.getElementById('select-all-btn');
    const actionsWrap = document.getElementById('shop-select-actions');
    if (!selectAllBtn || !actionsWrap) return;

    if (!canUseSelectionControls()) {
        actionsWrap.style.display = 'none';
        return;
    }

    actionsWrap.style.display = '';
    const visibleIds = getVisibleSelectionIds(filteredList);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selected.includes(id));
    selectAllBtn.innerText = allVisibleSelected ? 'Clear Selection' : 'Select All Items';
}

window.toggleSelect = (e, id) => {
    e.stopPropagation();
    if (!canUseSelectionControls()) return;
    const idx = state.selected.indexOf(id);
    if (idx >= 0) state.selected.splice(idx, 1);
    else state.selected.push(id);
    renderProducts();
};

window.toggleSelectAll = () => {
    if (!canUseSelectionControls()) return;
    const visibleIds = getVisibleSelectionIds();
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selected.includes(id));
    if (allVisibleSelected) {
        state.selected = state.selected.filter(id => !visibleIds.includes(id));
    } else {
        state.selected = Array.from(new Set([...state.selected, ...visibleIds]));
    }
    renderProducts();
};

function updateSelectionBar() {
    const bar = document.getElementById('selection-bar');
    const count = document.getElementById('selected-count');
    if (!bar || !count) return;
    if (canUseSelectionControls() && state.selected.length > 0) {
        count.innerText = `${state.selected.length} items`;
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
    }
}

window.clearSelection = () => {
    state.selected = [];
    renderProducts();
};

window.shareSelection = async () => {
    if (!canUseSelectionControls()) return;
    if (state.selected.length === 0) return;
    showToast('Preparing share link...');
    try {
        const shareUrl = await createSelectionLink({
            addDoc,
            shareCol,
            ids: state.selected,
            baseUrl: `${window.location.origin}${window.location.pathname}`
        });
        await copyTextToClipboard(shareUrl);
        showToast('Share link copied');
    } catch (err) {
        console.error('[ShopPage] share selection error:', err);
        showToast('Failed to create share link');
    }
};


window.goToProduct = (id) => {
    // Save scroll position for back navigation
    sessionStorage.setItem('speedgifts_shop_scroll', window.scrollY);
    sessionStorage.setItem('speedgifts_shop_url', window.location.href);
    window.location.href = getProductDetailUrl(id);
};

// ─── Load More ────────────────────────────────────────────────────
window.loadMore = () => {
    const all = getFilteredSorted();
    const loadedCount = state.page * PAGE_SIZE;
    if (loadedCount >= all.length) {
        state.page = 1;
        renderProducts(false);
        document.getElementById('shop-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    state.page++;
    renderProducts(true);
};

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
    const banner    = document.getElementById('filter-banner');
    const titleEl   = document.getElementById('filter-title');
    const subEl     = document.getElementById('filter-subtitle');

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
    const mobInput  = document.getElementById('mob-shop-search');
    const deskClear = document.getElementById('shop-clear-btn');
    const mobClear  = document.getElementById('mob-clear-btn');

    // Always sync from URL/state so search text remains visible after redirect from home.
    const urlQ = new URLSearchParams(window.location.search).get('q') || '';
    if (urlQ && !state.search) state.search = urlQ;
    if (deskInput) deskInput.value = state.search || '';
    if (mobInput)  mobInput.value  = state.search || '';
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
            if (mobInput  && mobInput.value  !== val) mobInput.value  = val;

            // Clear buttons
            const hasVal = val.length > 0;
            if (deskClear) deskClear.style.display = hasVal ? 'flex' : 'none';
            if (mobClear) {
                if (hasVal) mobClear.classList.remove('hidden');
                else        mobClear.classList.add('hidden');
            }
        }, 280);
    };

    if (deskInput) deskInput.addEventListener('input', e => handleInput(e.target.value));
    if (mobInput)  mobInput.addEventListener('input',  e => handleInput(e.target.value));

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
    const mobInput  = document.getElementById('mob-shop-search');
    const deskClear = document.getElementById('shop-clear-btn');
    const mobClear  = document.getElementById('mob-clear-btn');
    if (deskInput) deskInput.value = '';
    if (mobInput)  mobInput.value  = '';
    if (deskClear) deskClear.style.display = 'none';
    if (mobClear)  mobClear.classList.add('hidden');
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
    if (state.selectionId)       params.set('s', state.selectionId);
    if (state.filter !== 'all')  params.set('c', state.filter);
    if (state.search)            params.set('q', state.search);
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
    const panel   = document.getElementById('filter-panel');
    const overlay = document.getElementById('filter-overlay');
    if (!panel || !overlay) return;
    panel.classList.add('open');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeFilterPanel = () => {
    const panel   = document.getElementById('filter-panel');
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
        showToast(err.message?.replace('Firebase:', '').trim() || 'Authentication Failed');
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
        showToast(err.message?.replace('Firebase:', '').trim() || 'Error sending reset email');
    }
};

window.handleSignOut = async () => {
    try {
        await signOut(auth);
        window.closeAuthModals();
        showToast('Signed Out Successfully');
    } catch {
        showToast('Error signing out');
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

// ─── Restore scroll position if coming back from PDP ─────────────
window.addEventListener('pageshow', (e) => {
    if (e.persisted || (window.performance?.navigation?.type === 2)) {
        const savedY = sessionStorage.getItem('speedgifts_shop_scroll');
        if (savedY) {
            setTimeout(() => { window.scrollTo({ top: parseInt(savedY), behavior: 'instant' }); }, 80);
            sessionStorage.removeItem('speedgifts_shop_scroll');
        }
    }
});
