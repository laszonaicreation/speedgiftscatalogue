// ─── Speed Gifts — Cart Page Script ──────────────────────────────────────────
// Drives cart.html — reads from the shared cart.js module.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, getDocs
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

import {
    initCart, loadCart, getCartItems, getCartCount, getCartTotal,
    removeFromCart, updateQty, updateCartBadges, checkoutViaWhatsApp, mergeCartOnLogin
} from './cart.js';

import { mountSharedShell } from './shared-shell.js?v=4';
import { initSharedAuth } from './shared-auth.js';

// ── Firebase ──────────────────────────────────────────────────────────────────
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

const WISHLIST_KEY = 'speedgifts_wishlist';
const state = {
    wishlist: [],
    products: [],
    authUser: null,
    authMode: 'login'
};


// ── Boot shared shell (nav + sidebars) ────────────────────────────────────────
mountSharedShell('cart');

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.textContent = msg;
    t.style.display = 'block';
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2500);
}
window.showToast = showToast;

// ── Wishlist ──────────────────────────────────────────────────────────────────
function loadWishlist() {
    try {
        const raw = localStorage.getItem(WISHLIST_KEY);
        state.wishlist = raw ? JSON.parse(raw) : [];
    } catch {
        state.wishlist = [];
    }
}

function updateWishlistBadges() {
    const count = (state.wishlist || []).length;
    ['nav-wishlist-count', 'nav-wishlist-count-mob'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = String(count);
        el.classList.toggle('hidden', count === 0);
    });
}

function renderFavoritesSidebar() {
    renderFavoritesSidebarMainLike({
        wishlist: state.wishlist || [],
        products: state.products || [],
        getOptimizedUrl: (url, w) => {
            if (!url || !url.includes('res.cloudinary.com') || !w) return url || '';
            return url.replace('/upload/', `/upload/f_auto,q_auto,w_${w},c_limit/`);
        },
        onItemClickJs: (p) => `window.location.href='product-detail.html?p=${p.originalId}'`,
        onRemoveClickJs: (p) => `window.__cartPageRemoveWish('${p.originalId}')`
    });
}

window.__cartPageRemoveWish = (id) => {
    const idx = state.wishlist.findIndex(x => (typeof x === 'string' ? x : x.id) === id);
    if (idx >= 0) state.wishlist.splice(idx, 1);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(state.wishlist));
    updateWishlistBadges();
};

// ── Favorites: navigate to page ───────────────────────────────────────────────
window.handleFavoritesClick = () => window.location.href = '/favourites.html';
window.openFavoritesSidebar = () => window.location.href = '/favourites.html';
window.closeFavoritesSidebar = () => {};

// ── Auth User UI ──────────────────────────────────────────────────────────────
function updateAuthUserUI() {
    const user = auth.currentUser;
    state.authUser = (user && !user.isAnonymous) ? user : null;

    const mobText = document.getElementById('mob-user-text');
    const accountName = document.getElementById('account-user-name');
    const accountEmail = document.getElementById('account-user-email');

    if (mobText) mobText.innerText = state.authUser ? 'Account' : 'Login';
    if (accountName) accountName.innerText = state.authUser?.displayName || 'User';
    if (accountEmail) accountEmail.innerText = state.authUser?.email || '';
}

// ── Cart sidebar — no-ops on cart page (already ON the cart page) ─────────────
window.handleCartClick = () => { };
window.openCartSidebar = () => { };
window.closeCartSidebar = () => { };
window.openCategoriesSidebar = () => { };
window.closeCategoriesSidebar = () => { };
window.focusSearch = () => { window.location.href = 'shop.html'; };

// ── Init Auth (login modal) ───────────────────────────────────────────────────
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
    showToast
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getOptimizedUrl(url, size = 400) {
    if (!url) return '';
    if (url.includes('res.cloudinary.com') && !url.includes('/upload/w_')) {
        return url.replace('/upload/', `/upload/w_${size},c_fill,f_auto,q_auto/`);
    }
    return url;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderCartPage() {
    const items = getCartItems();
    const count = getCartCount();
    const total = getCartTotal();

    // Count pill
    const pill = document.getElementById('cart-count-pill');
    if (pill) pill.textContent = count;

    // Summary totals
    const subtotalEl = document.getElementById('summary-subtotal');
    const totalEl = document.getElementById('summary-total');
    const mobTotalEl = document.getElementById('mob-total');
    const totalStr = total.toFixed(2) + ' AED';

    if (subtotalEl) subtotalEl.textContent = totalStr;
    if (totalEl) totalEl.textContent = totalStr;
    if (mobTotalEl) mobTotalEl.textContent = totalStr;

    // Checkout buttons
    const checkoutBtn = document.getElementById('checkout-btn');
    const summaryPanel = document.getElementById('cart-summary-panel');
    const mobBar = document.getElementById('mobile-checkout-bar');

    // Hide loading shimmer
    const loading = document.getElementById('cart-loading-state');
    if (loading) loading.style.display = 'none';

    const body = document.getElementById('cart-items-body');
    const empty = document.getElementById('cart-empty-state');

    if (items.length === 0) {
        if (body) body.style.display = 'none';
        if (empty) empty.classList.add('visible');
        if (checkoutBtn) checkoutBtn.style.display = 'none';
        if (summaryPanel) summaryPanel.style.opacity = '0.5';
        if (mobBar) mobBar.style.display = 'none';
        return;
    }

    // Show items
    if (empty) empty.classList.remove('visible');
    if (body) body.style.display = 'flex';
    if (checkoutBtn) checkoutBtn.style.display = '';
    if (summaryPanel) summaryPanel.style.opacity = '';
    if (mobBar) mobBar.style.display = 'block';

    if (!body) return;

    const newHtml = items.map((item, idx) => {
        const imgUrl = getOptimizedUrl(item.img, 300);
        const safeName = (item.name || 'Product').replace(/"/g, '&quot;');
        const varLabel = [item.size, item.color].filter(Boolean).join(' · ');
        const lineTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);
        const unitPrice = parseFloat(item.price) || 0;
        const productUrl = `product-detail.html?p=${item.id}`;

        return `
        <div class="cart-item-card" id="item-${idx}" data-id="${item.id}" data-size="${item.size || ''}" data-color="${item.color || ''}">
            <a href="${productUrl}" class="item-img-box" style="display:block;text-decoration:none;">
                <img
                    src="${imgUrl || 'https://placehold.co/300x300?text=Gift'}"
                    alt="${safeName}"
                    loading="lazy"
                    onerror="this.src='https://placehold.co/300x300?text=Gift'">
            </a>
            <div class="item-details">
                <a href="${productUrl}" class="item-name">${safeName}</a>
                ${varLabel ? `<div class="item-variant">${varLabel}</div>` : ''}
                <div class="item-unit-price">${unitPrice.toFixed(2)} AED each</div>
                <div class="item-controls">
                    <button class="qty-btn" onclick="window.cpUpdateQty('${item.id}','${item.size || ''}','${item.color || ''}',-1)">
                        <i class="fa-solid fa-minus" style="font-size:8px;"></i>
                    </button>
                    <span class="qty-display">${item.qty || 1}</span>
                    <button class="qty-btn" onclick="window.cpUpdateQty('${item.id}','${item.size || ''}','${item.color || ''}',1)">
                        <i class="fa-solid fa-plus" style="font-size:8px;"></i>
                    </button>
                </div>
            </div>
            <div class="item-right">
                <div class="item-line-total">${lineTotal} AED</div>
                <button class="item-remove-btn" onclick="window.cpRemoveItem('${item.id}','${item.size || ''}','${item.color || ''}', ${idx})" title="Remove">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    if (window._sgLastCartHtml !== newHtml) {
        body.innerHTML = newHtml;
        window._sgLastCartHtml = newHtml;
    }
}

// ── Global interactions (called from inline HTML) ─────────────────────────────
window.cpUpdateQty = (id, size, color, delta) => {
    updateQty(id, size || null, color || null, Number(delta));
    renderCartPage();
};

window.cpRemoveItem = (id, size, color, idx) => {
    const card = document.getElementById(`item-${idx}`);
    if (card) {
        card.classList.add('removing');
        setTimeout(() => {
            removeFromCart(id, size || null, color || null);
            renderCartPage();
        }, 280);
    } else {
        removeFromCart(id, size || null, color || null);
        renderCartPage();
    }
};

window.cartPageCheckout = () => {
    const items = getCartItems();
    if (items.length === 0) return;

    const btn = document.getElementById('checkout-btn');
    const mobBtn = document.getElementById('mob-checkout-btn');
    [btn, mobBtn].forEach(b => {
        if (!b) return;
        b.style.transform = 'scale(0.97)';
        setTimeout(() => b.style.transform = '', 150);
    });

    checkoutViaWhatsApp();
};

// ── Init ──────────────────────────────────────────────────────────────────────
initCart({ getProducts: () => [], getOptimizedUrl });
loadWishlist();
updateWishlistBadges();
renderCartPage();
updateCartBadges();

// ── Firebase Auth listener ────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    updateAuthUserUI();
    if (!user) {
        signInAnonymously(auth).catch(() => { /* no-op */ });
    } else if (!user.isAnonymous) {
        await mergeCartOnLogin(user.uid);
        renderCartPage();
        updateCartBadges();
    }
});

// ── Listen for cart/wishlist changes from other tabs ──────────────────────────
window.addEventListener('storage', (e) => {
    if (e.key === 'speedgifts_cart') {
        loadCart();
        renderCartPage();
        updateCartBadges();
    }
    if (e.key === WISHLIST_KEY) {
        loadWishlist();
        updateWishlistBadges();
    }
});

// ── Keyboard: Escape closes modals/sidebars ───────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeFavoritesSidebar?.();
        window.closeAuthModals?.();
    }
});
