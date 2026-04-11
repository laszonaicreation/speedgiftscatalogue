// ─── Speed Gifts — Cart Page Script ──────────────────────────────────────────
// Drives cart.html — reads from the shared cart.js module.

import {
    initCart, loadCart, getCartItems, getCartCount, getCartTotal,
    removeFromCart, updateQty, updateCartBadges, checkoutViaWhatsApp
} from './cart.js';

import { mountSharedShell } from './shared-shell.js?v=4';

// ── Boot shared shell (nav + sidebars) ───────────────────────────────────────
mountSharedShell('cart');

// ── Minimal window globals expected by shared-shell ───────────────────────────
window.handleCartClick = () => { window.location.href = 'cart.html'; };
window.openCartSidebar = () => { window.location.href = 'cart.html'; };
window.closeCartSidebar = () => { };
window.handleUserAuthClick = () => { window.location.href = 'index.html'; };
window.handleFavoritesClick = () => { };
window.openFavoritesSidebar = () => { };
window.closeFavoritesSidebar = () => { };
window.openCategoriesSidebar = () => { };
window.closeCategoriesSidebar = () => { };
window.focusSearch = () => { };
window.showToast = (msg) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 2500);
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getOptimizedUrl(url, size = 400) {
    if (!url) return '';
    if (url.includes('res.cloudinary.com') && !url.includes('/upload/w_')) {
        return url.replace('/upload/', `/upload/w_${size},c_fill,f_auto,q_auto/`);
    }
    return url;
}

function makeKey(id, size, color) {
    return `${id}__${size || ''}__${color || ''}`;
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
    const mobBtn = document.getElementById('mob-checkout-btn');
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

    body.innerHTML = items.map((item, idx) => {
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
}

// ── Global interactions (called from inline HTML) ─────────────────────────────
window.cpUpdateQty = (id, size, color, delta) => {
    updateQty(id, size || null, color || null, Number(delta));
    renderCartPage();
};

window.cpRemoveItem = (id, size, color, idx) => {
    // Animate out
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

    // Animate checkout button briefly
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
renderCartPage();
updateCartBadges();

// Listen for cart changes from other tabs
window.addEventListener('storage', (e) => {
    if (e.key === 'speedgifts_cart') {
        loadCart();
        renderCartPage();
        updateCartBadges();
    }
});
