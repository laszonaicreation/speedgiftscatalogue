// ─── Speed Gifts — Favourites Page Script ────────────────────────────────────
// Drives favourites.html — uses shared shell for nav consistency.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail,
    signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, documentId, doc, setDoc }
    from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

import { mountSharedShell } from './shared-shell.js?v=4';
import { initSharedAuth } from './shared-auth.js';
import { addToCart, openCartSidebar, clearCart } from './cart.js';
import { getWishlistItems, initWishlist, toggleWishlist, loadWishlist, clearWishlistOnLogout } from './wishlist.js';

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
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = firebaseConfig.projectId;
const WISHLIST_KEY = 'speedgifts_wishlist';

window._sgAuth = auth;
window._sgDb = db;
window._sgAppId = APP_ID;

// Expose state globally for wishlist.js
const state = { authUser: null, authMode: 'login', user: null };
window._sgState = state;

// ── State ─────────────────────────────────────────────────────────────────────
let loadedProducts = [];

// ── Mount shared shell (same top nav + mobile bottom nav as all other pages) ──
mountSharedShell('favourites');

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
    const t = document.getElementById('sg-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}
window.showToast = showToast;

// ── Shared auth (sign in / sign out modal) ────────────────────────────────────
function updateAuthUserUI() {
    state.authUser = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    const mobText = document.getElementById('mob-user-text');
    if (mobText) mobText.innerText = state.authUser ? 'Account' : 'Login';
    
    const prompt = document.getElementById('sg-login-prompt');
    if (prompt) {
        prompt.style.display = state.authUser ? 'none' : 'flex';
    }
}

initSharedAuth({
    auth,
    firebaseAuth: {
        signInWithEmailAndPassword, createUserWithEmailAndPassword,
        GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail,
        signOut, updateProfile
    },
    getAuthUser: () => state.authUser,
    setAuthMode: (m) => { state.authMode = m; },
    getAuthMode: () => state.authMode,
    updateAuthUserUI,
    onSignOut: () => {
        clearWishlistOnLogout();
        clearCart(true); // purely local clear for cart
        loadedProducts = [];
        renderCurrentState(); // refresh the view
    },
    showToast
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getOptimizedUrl(url, w = 300) {
    if (!url) return 'https://placehold.co/300x300?text=?';
    if (url.includes('cloudinary.com')) return url.replace('/upload/', `/upload/w_${w},f_auto,q_auto/`);
    return url;
}

async function fetchProducts(ids) {
    if (!ids || !ids.length) return [];
    const prodCol = collection(db, 'artifacts', APP_ID, 'public', 'data', 'products');
    const results = [];
    for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const snap = await getDocs(query(prodCol, where(documentId(), 'in', chunk)));
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
    }
    return results;
}

function getWaLink(p) {
    const link = `https://speedgifts.net/product-detail.html?id=${p.id}`;
    const txt = `Hi Speed Gifts Team,\n\nI would like to inquire about this product:\n\n1. ${p.name || 'Product'}\n   Price: ${p.price ? p.price + ' AED' : 'TBD'}\n   Link: ${link}\n\nPlease let me know the availability.`;
    return `https://wa.me/971561010387?text=${encodeURIComponent(txt)}`;
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderSkeletons(n) {
    return Array.from({ length: n }, () => `
    <div class="fav-skel">
        <div class="fav-skel-img sg-skeleton"></div>
        <div class="fav-skel-body">
            <div class="fav-skel-line sg-skeleton" style="width:75%"></div>
            <div class="fav-skel-line sg-skeleton" style="width:40%"></div>
            <div class="fav-skel-line sg-skeleton" style="width:55%;height:28px;border-radius:8px;margin-top:4px;"></div>
        </div>
    </div>`).join('');
}

function renderEmpty() {
    return `
    <div class="sg-empty">
        <i class="fa-regular fa-heart"></i>
        <h2>No favourites yet</h2>
        <p>Tap the ❤️ heart icon on any product to save it here and find it easily later.</p>
        <a href="/shop.html" class="sg-empty-btn">Browse Products &rarr;</a>
    </div>`;
}

function renderItems(items) {
    if (!items.length) return renderEmpty();

    document.getElementById('cart-all-btn').style.display = 'flex';

    return `<div class="sg-items-list">${items.map(entry => {
        const id = entry.id || entry;
        const p = loadedProducts.find(x => x.id === id);
        if (!p) return '';
        const img = getOptimizedUrl(Array.isArray(p.images) ? p.images[0] : p.img, 300);
        const price = p.price ? `<div class="fav-price"><strong>${parseFloat(p.price).toFixed(2)}</strong> AED</div>` : '';
        return `
        <div class="fav-item" data-id="${p.id}">
            <div class="fav-img" onclick="window.location.href='product-detail.html?id=${p.id}'">
                <img src="${img}" alt="${(p.name || '').replace(/"/g, '&quot;')}" loading="lazy"
                     onerror="this.src='https://placehold.co/300x300?text=?'">
            </div>
            <div class="fav-info">
                <div class="fav-name" onclick="window.location.href='product-detail.html?id=${p.id}'">${p.name || 'Product'}</div>
                ${price}
                <div class="fav-actions">
                    <button class="fav-cart-btn" onclick="window.addFavToCart('${p.id}')">
                        <i class="fa-solid fa-cart-shopping"></i> Add to Cart
                    </button>
                    <a href="product-detail.html?id=${p.id}" class="fav-view-btn" title="View product">
                        <i class="fa-solid fa-arrow-right"></i>
                    </a>
                </div>
            </div>
            <button class="fav-remove" onclick="window.removeItem('${p.id}')" title="Remove from favourites">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>`;
    }).join('')}</div>`;
}

// ── Remove item ───────────────────────────────────────────────────────────────
window.removeItem = async (id) => {
    await toggleWishlist(null, id); 

    const el = document.querySelector(`.fav-item[data-id="${id}"]`);
    if (el) {
        el.classList.add('removing');
        setTimeout(() => {
            el.remove();
            updateCount();
        }, 250);
    }
    showToast('Removed from favourites');
};

// ── Add to Cart (Single) ──────────────────────────────────────────────────────
window.addFavToCart = (id) => {
    if (!loadedProducts.length) return;
    const p = loadedProducts.find(x => x.id === id);
    if (!p) return;
    const img = Array.isArray(p.images) ? p.images[0] : p.img;
    addToCart({ id: p.id, name: p.name || 'Product', price: p.price || 0, img });
    showToast('Added to cart');
};

// ── Add All To Cart ───────────────────────────────────────────────────────────
window.addAllToCart = (e) => {
    e.preventDefault();
    const currentWishlist = getWishlistItems();
    if (!loadedProducts.length || !currentWishlist.length) return;
    let addedCount = 0;
    currentWishlist.forEach(entry => {
        const id = entry.id || entry;
        const p = loadedProducts.find(x => x.id === id);
        if (p) {
            const img = Array.isArray(p.images) ? p.images[0] : p.img;
            addToCart({ id: p.id, name: p.name || 'Product', price: p.price || 0, img });
            addedCount++;
        }
    });
    if (addedCount > 0) {
        showToast(`Added ${addedCount} item${addedCount !== 1 ? 's' : ''} to cart`);
        openCartSidebar();
    }
};

// ── Update count ──────────────────────────────────────────────────────────────
function updateCount() {
    const items = document.querySelectorAll('.fav-item').length;
    const countEl = document.getElementById('fav-count-text');
    if (countEl) countEl.textContent = items === 0 ? 'No saved items' : `${items} saved item${items !== 1 ? 's' : ''}`;
    if (items === 0) {
        document.getElementById('sg-list-container').innerHTML = renderEmpty();
        document.getElementById('cart-all-btn').style.display = 'none';
    }
}

// ── handleFavoritesClick — stay on this page since we're already here ─────────
window.handleFavoritesClick = () => { /* already on favourites page */ };

// ── focusSearch — redirect to shop ───────────────────────────────────────────
window.focusSearch = () => { window.location.href = '/shop.html'; };

// ── openCategoriesSidebar ─────────────────────────────────────────────────────
window.openCategoriesSidebar = () => { window.location.href = '/shop.html'; };

window._sgWishlistCallback = () => {
    // Fired whenever wishlist changes (from other tabs, realtime sync, etc.)
    renderCurrentState();
};

async function renderCurrentState() {
    const currentWishlist = getWishlistItems();
    const container = document.getElementById('sg-list-container');
    const countEl = document.getElementById('fav-count-text');

    if (!currentWishlist.length) {
        if (countEl) countEl.textContent = 'No saved items yet';
        if (container) container.innerHTML = renderEmpty();
        
        const btn = document.getElementById('cart-all-btn');
        if (btn) btn.style.display = 'none';
        return;
    }

    // Identify which products need to be fetched (not loaded yet)
    const neededIds = currentWishlist.map(e => e.id || e);
    const missingIds = neededIds.filter(id => !loadedProducts.some(p => p.id === id));

    if (missingIds.length > 0) {
        if (container) container.innerHTML = renderSkeletons(Math.min(neededIds.length, 5));
        if (countEl) countEl.textContent = `Loading ${neededIds.length} item${neededIds.length !== 1 ? 's' : ''}...`;

        try {
            const newProducts = await fetchProducts(missingIds);
            loadedProducts = [...loadedProducts, ...newProducts];
        } catch (err) {
            console.error('Favourites fetch error:', err);
            if (container) container.innerHTML = `<div class="sg-empty"><i class="fa-solid fa-triangle-exclamation"></i><h2>Could not load items</h2><p>Check your connection and try again.</p><a href="/" class="sg-empty-btn">Go Home</a></div>`;
            return;
        }
    }

    if (container) container.innerHTML = renderItems(currentWishlist);
    const count = neededIds.length;
    if (countEl) countEl.textContent = `${count} saved item${count !== 1 ? 's' : ''}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    initWishlist();

    const loading = document.getElementById('sg-loading');
    const page = document.getElementById('sg-page');

    if (page) page.style.display = 'block';
    if (loading) {
        loading.style.opacity = '0';
        setTimeout(() => { loading.style.display = 'none'; }, 300);
    }

    renderCurrentState();
}

// ── Auth state ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    state.user = user;
    updateAuthUserUI();
    if (!user) {
        signInAnonymously(auth).catch(() => {});
    } else if (!user.isAnonymous) {
        // Now if they just signed in, tell wishlist.js to merge the cloud
        await loadWishlist();
        renderCurrentState(); // render with any new merged products
    }
});

init();
