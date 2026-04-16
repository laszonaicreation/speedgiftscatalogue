// ─── Speed Gifts — Shared Cart Module ────────────────────────────────────────
// Handles cart state, localStorage persistence, sidebar rendering, and
// WhatsApp checkout. Import this in every page that needs a cart.

const CART_KEY = 'speedgifts_cart';

// ── State ─────────────────────────────────────────────────────────────────────
let _cartItems = []; // [{ id, name, price, img, qty, size?, color? }]
let _getProductsRef = () => [];
let _getOptimizedUrlRef = (url) => url;

// ── Init ──────────────────────────────────────────────────────────────────────
export function initCart({ getProducts, getOptimizedUrl }) {
    if (getProducts) _getProductsRef = getProducts;
    if (getOptimizedUrl) _getOptimizedUrlRef = getOptimizedUrl;

    // Always load and update immediately when initialized
    loadCart();
    updateCartBadges();
}

// ── Persistence ───────────────────────────────────────────────────────────────
export function loadCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        _cartItems = raw ? JSON.parse(raw) : [];
    } catch {
        _cartItems = [];
    }
}

// Ensure cross-tab & bfcache sync
window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) {
        loadCart();
        updateCartBadges();
        if (document.getElementById('cart-sidebar')?.classList.contains('open')) {
            renderCartSidebar();
        }
    }
});

window.addEventListener('pageshow', (e) => {
    if (e.persisted) { // Page restored from BFCache
        loadCart();
        updateCartBadges();
    }
});

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(_cartItems));
    updateCartBadges();
    // Re-render sidebar if open
    if (document.getElementById('cart-sidebar')?.classList.contains('open')) {
        renderCartSidebar();
    }
    // Auto-sync to Firestore if user is logged in
    syncCartToCloud();
}

function syncCartToCloud() {
    try {
        // Access Firebase auth via global (set by app.js)
        const auth = window._sgAuth;
        const db = window._sgDb;
        const appId = window._sgAppId;
        if (!auth || !db || !appId) return;
        const user = auth.currentUser;
        if (!user || user.isAnonymous) return;
        // Lazy import to avoid circular deps
        import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js').then(({ doc, setDoc }) => {
            const cartRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'cart');
            setDoc(cartRef, { items: _cartItems }).catch(e => console.error('[Cart] Cloud sync failed:', e));
        });
    } catch (_) { }
}

// ── Cart Operations ───────────────────────────────────────────────────────────
export function addToCart({ id, name, price, img, size, color }) {
    const key = makeKey(id, size, color);
    const existing = _cartItems.find(x => makeKey(x.id, x.size, x.color) === key);
    if (existing) {
        existing.qty = (existing.qty || 1) + 1;
    } else {
        _cartItems.push({ id, name, price, img: img || '', qty: 1, size: size || null, color: color || null });
    }
    saveCart();
}

export function removeFromCart(id, size, color) {
    const key = makeKey(id, size, color);
    _cartItems = _cartItems.filter(x => makeKey(x.id, x.size, x.color) !== key);
    saveCart();
}

export function updateQty(id, size, color, delta) {
    const key = makeKey(id, size, color);
    const item = _cartItems.find(x => makeKey(x.id, x.size, x.color) === key);
    if (!item) return;
    item.qty = Math.max(1, (item.qty || 1) + delta);
    saveCart();
}

function makeKey(id, size, color) {
    return `${id}__${size || ''}__${color || ''}`;
}

export function getCartCount() {
    return _cartItems.reduce((sum, x) => sum + (x.qty || 1), 0);
}

export function getCartTotal() {
    return _cartItems.reduce((sum, x) => sum + (parseFloat(x.price) || 0) * (x.qty || 1), 0);
}

export function getCartItems() {
    return _cartItems;
}

// ── Badge Update ──────────────────────────────────────────────────────────────
export function updateCartBadges() {
    const count = getCartCount();
    ['nav-cart-count', 'nav-cart-count-mob'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = count > 99 ? '99+' : String(count);
        el.classList.toggle('hidden', count === 0);
    });
}

export function clearCart() {
    // Snapshot current user BEFORE clearing (sign-out may already be in progress)
    const auth  = window._sgAuth;
    const db    = window._sgDb;
    const appId = window._sgAppId;
    const user  = auth?.currentUser;
    const shouldClearCloud = user && !user.isAnonymous && db && appId;

    _cartItems = [];
    localStorage.removeItem(CART_KEY);
    updateCartBadges();
    // Re-render sidebar if open (now shows empty)
    if (document.getElementById('cart-sidebar')?.classList.contains('open')) {
        renderCartSidebar();
    }

    // Clear cloud cart immediately while user session is still valid
    if (shouldClearCloud) {
        import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js').then(({ doc, setDoc }) => {
            const cartRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'cart');
            setDoc(cartRef, { items: [] }).catch(e => console.error('[Cart] Cloud clear failed:', e));
        });
    }
}

// ── Sidebar Open/Close ────────────────────────────────────────────────────────
export function openCartSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-sidebar-overlay');
    if (!sidebar || !overlay) return;
    renderCartSidebar();
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeCartSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-sidebar-overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = 'auto';
}

// ── Sidebar Render ────────────────────────────────────────────────────────────
export function renderCartSidebar() {
    const container = document.getElementById('cart-items-list');
    const countEl = document.getElementById('cart-sidebar-count');
    const totalEl = document.getElementById('cart-sidebar-total');
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (!container) return;

    const count = getCartCount();
    const total = getCartTotal();

    if (countEl) countEl.textContent = `${count} Item${count !== 1 ? 's' : ''}`;
    if (totalEl) totalEl.textContent = `${total.toFixed(2)} AED`;
    if (checkoutBtn) checkoutBtn.style.display = _cartItems.length > 0 ? '' : 'none';

    if (_cartItems.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center px-6">
                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <i class="fa-solid fa-cart-shopping text-gray-200 text-2xl"></i>
                </div>
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Your cart is empty</p>
                <p class="text-[9px] text-gray-300 mt-2 leading-relaxed">Add items from the product page to start shopping.</p>
            </div>`;
        return;
    }

    container.innerHTML = _cartItems.map(item => {
        const imgUrl = _getOptimizedUrlRef(item.img, 200);
        const safeName = (item.name || 'Product').replace(/"/g, '&quot;');
        const varLabel = [item.size, item.color].filter(Boolean).join(' · ');
        const lineTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);
        return `
        <div class="cart-item" data-id="${item.id}" data-size="${item.size || ''}" data-color="${item.color || ''}">
            <div class="cart-item-img">
                <img src="${imgUrl || 'https://placehold.co/200x200?text=Product'}" alt="${safeName}"
                     onerror="this.src='https://placehold.co/200x200?text=Product'">
            </div>
            <div class="cart-item-info">
                <h4 class="cart-item-name">${safeName}</h4>
                ${varLabel ? `<p class="cart-item-var">${varLabel}</p>` : ''}
                <p class="cart-item-price">${lineTotal} AED</p>
                <div class="cart-qty-row">
                    <button class="cart-qty-btn" onclick="window.cartUpdateQty('${item.id}','${item.size || ''}','${item.color || ''}',-1)">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                    <span class="cart-qty-val">${item.qty || 1}</span>
                    <button class="cart-qty-btn" onclick="window.cartUpdateQty('${item.id}','${item.size || ''}','${item.color || ''}',1)">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
            <button class="cart-remove-btn" onclick="window.cartRemoveItem('${item.id}','${item.size || ''}','${item.color || ''}')">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>`;
    }).join('');
}

// ── WhatsApp Checkout ─────────────────────────────────────────────────────────
export function checkoutViaWhatsApp() {
    if (_cartItems.length === 0) return;

    const lines = _cartItems.map((item, index) => {
        const varLabel = [item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(', ');
        const lineTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);
        const link = `https://speedgifts.net/product-detail.html?id=${item.id}`;
        return `${index + 1}. ${item.name} (Qty: ${item.qty})\n   Price: ${lineTotal} AED\n   ${varLabel ? `Details: ${varLabel}\n   ` : ''}Link: ${link}`;
    });

    const total = getCartTotal().toFixed(2);
    const msg = `Hi Speed Gifts Team,\n\nI would like to place an order for the following items:\n\n${lines.join('\n\n')}\n\nTotal Order Value: ${total} AED\n\nPlease let me know the availability and delivery process.\n\nThank you.`;
    
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
}

// ── Global Window Bindings ────────────────────────────────────────────────────
window.openCartSidebar = openCartSidebar;
window.closeCartSidebar = closeCartSidebar;

// Cart icon in nav always goes to dedicated cart page
window.handleCartClick = () => { window.location.href = 'cart.html'; };

window.cartRemoveItem = (id, size, color) => {
    removeFromCart(id, size || null, color || null);
};

window.cartUpdateQty = (id, size, color, delta) => {
    updateQty(id, size || null, color || null, Number(delta));
};

window.cartCheckoutWhatsApp = checkoutViaWhatsApp;
// -- Merge on Login ------------------------------------------------------------
export async function mergeCartOnLogin(uid) {
    const CART_KEY = 'speedgifts_cart';
    try {
        const auth = window._sgAuth;
        const db = window._sgDb;
        const appId = window._sgAppId;
        if (!auth || !db || !appId) return;

        const { doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js');
        const cartRef = doc(db, 'artifacts', appId, 'users', uid, 'data', 'cart');
        const cartDoc = await getDoc(cartRef);

        let localCart = [];
        try { localCart = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (_) { }

        let cloudCart = [];
        if (cartDoc.exists()) cloudCart = cartDoc.data().items || [];

        const key = item => `${item.id}_${item.size || ''}_${item.color || ''}`;
        const merged = [...cloudCart];
        const cloudKeys = new Set(cloudCart.map(key));
        for (const item of localCart) {
            if (!cloudKeys.has(key(item))) merged.push(item);
        }

        if (merged.length > 0) {
            localStorage.setItem(CART_KEY, JSON.stringify(merged));
            await setDoc(cartRef, { items: merged });
            window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }));
        } else if (cloudCart.length > 0) {
            localStorage.setItem(CART_KEY, JSON.stringify(cloudCart));
            window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }));
        }
    } catch (e) {
        console.error('[Cart] Merge failed:', e);
    }
}
