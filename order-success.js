import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, query, where, getDocs, limit
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { mountSharedShell } from './shared-shell.js?v=4';

// ── Firebase ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speedgifts.net",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};
const app = initializeApp(firebaseConfig);
const db  = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);

mountSharedShell('order-success');

// ── Helpers ───────────────────────────────────────────────────────────────────
const urlParams      = new URLSearchParams(window.location.search);
const orderId        = urlParams.get('orderId') || '';
const isFromCheckout = urlParams.get('fromCheckout') === '1';


function fmt(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts * 1000);
    return d.toLocaleDateString('en-AE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function imgUrl(url, size = 90) {
    if (!url || url === 'img/') return '';
    if (url.includes('res.cloudinary.com') && !url.includes('/upload/w_'))
        return url.replace('/upload/', `/upload/w_${size},c_fill,f_auto,q_auto/`);
    return url;
}

const STATUS = {
    Pending:    { bg:'#fef9c3', color:'#854d0e', icon:'fa-clock',        label:'Pending' },
    Processing: { bg:'#dbeafe', color:'#1e40af', icon:'fa-gear fa-spin',  label:'Processing' },
    Shipped:    { bg:'#ede9fe', color:'#6d28d9', icon:'fa-truck',          label:'Shipped' },
    Delivered:  { bg:'#dcfce7', color:'#15803d', icon:'fa-circle-check',   label:'Delivered' },
    Cancelled:  { bg:'#fee2e2', color:'#b91c1c', icon:'fa-circle-xmark',   label:'Cancelled' },
};

// ── Render Order ──────────────────────────────────────────────────────────────
function renderOrder(order) {
    if (!isFromCheckout) {
        const ring = document.querySelector('.os-check-ring');
        const h1 = document.querySelector('.os-hero h1');
        const p = document.querySelector('.os-hero p');
        if (ring) ring.style.display = 'none';
        if (h1) h1.textContent = 'Order Details';
        if (p) p.style.display = 'none';
    }

    const st = STATUS[order.status] || STATUS.Pending;

    // Header
    document.getElementById('success-order-id').textContent = order.orderId || orderId;

    const dateEl = document.getElementById('order-date');
    if (dateEl) dateEl.textContent = fmt(order.createdAt);

    // Timeline Tracker
    const timelineEl = document.getElementById('order-timeline-container');
    if (timelineEl) {
        if (order.status === 'Cancelled') {
            timelineEl.innerHTML = `
                <div style="text-align:center; padding: 1rem 0;">
                    <div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 0.5rem;">
                        <i class="fa-solid fa-circle-xmark"></i>
                    </div>
                    <div style="font-size:1rem;font-weight:800;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em;">Order Cancelled</div>
                </div>
            `;
        } else {
            const steps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
            const icons = ['fa-file-invoice', 'fa-box-open', 'fa-truck-fast', 'fa-house-circle-check'];
            
            let currentIndex = steps.indexOf(order.status);
            if (currentIndex === -1) currentIndex = 0; // Default to Pending if unknown

            let progressWidth = '0%';
            if (currentIndex === 1) progressWidth = '33%';
            else if (currentIndex === 2) progressWidth = '66%';
            else if (currentIndex === 3) progressWidth = '100%';

            let stepsHtml = steps.map((step, idx) => {
                let stateClass = '';
                if (idx < currentIndex) stateClass = 'completed';
                else if (idx === currentIndex) stateClass = 'active';

                return `
                <div class="timeline-step ${stateClass}">
                    <div class="step-icon"><i class="fa-solid ${icons[idx]}"></i></div>
                    <div class="step-label">${step}</div>
                </div>`;
            }).join('');

            timelineEl.innerHTML = `
                <div class="timeline-wrap">
                    <div class="timeline-progress" style="width: ${progressWidth};"></div>
                    ${stepsHtml}
                </div>
            `;
        }
    }

    // Items
    const listEl = document.getElementById('order-items-list');
    if (listEl && order.items?.length) {
        listEl.innerHTML = order.items.map(item => {
            const img = imgUrl(item.img);
            const varLabel = [item.size, item.color].filter(Boolean).join(' · ');
            const lineTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);
            return `
            <div class="os-item">
                ${img
                    ? `<img src="${img}" alt="${item.name || 'Product'}" loading="lazy">`
                    : `<div class="os-item-ph"><i class="fa-solid fa-gift"></i></div>`}
                <div class="os-item-info">
                    <div class="os-item-name">${item.name || 'Product'}</div>
                    ${varLabel ? `<div class="os-item-var">${varLabel}</div>` : ''}
                    <div class="os-item-qty">Qty: ${item.qty || 1}</div>
                </div>
                <div class="os-item-price">${lineTotal} AED</div>
            </div>`;
        }).join('');
    }

    // Totals
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('os-subtotal', `${(order.subtotal || 0).toFixed(2)} AED`);
    set('os-delivery', `${(order.deliveryFee ?? 35).toFixed(2)} AED`);
    set('os-total',    `${(order.total || 0).toFixed(2)} AED`);

    // Shipping
    const addrEl = document.getElementById('os-address');
    const addrTitle = document.getElementById('os-address-title');
    if (addrEl) {
        if (order.fulfillmentMethod === 'pickup') {
            if (addrTitle) {
                addrTitle.innerHTML = '<i class="fa-solid fa-store" style="margin-right:6px;opacity:0.5;"></i>Store Collection';
            }
            addrEl.innerHTML = `
                <strong>${order.customer?.name || ''}</strong><br>
                World Trade Center, B2 Floor<br>
                Abu Dhabi<br>
                <span style="color:#25D366;"><i class="fa-brands fa-whatsapp"></i></span> ${order.customer?.phone || ''}`;
        } else if (order.shipping) {
            const s = order.shipping;
            addrEl.innerHTML = `
                <strong>${order.customer?.name || ''}</strong><br>
                ${s.building}, ${s.street}<br>
                ${s.city}, ${s.emirate}<br>
                <span style="color:#25D366;"><i class="fa-brands fa-whatsapp"></i></span> ${order.customer?.phone || ''}`;
        }
    }

    // Save to sessionStorage for fallback
    try {
        sessionStorage.setItem('sg_last_order', JSON.stringify({
            ...order,
            createdAt: order.createdAt?.seconds || Math.floor(Date.now() / 1000)
        }));
    } catch(e) { /* no-op */ }

    // WhatsApp message with full order details
    buildWhatsApp(order);

    // Cancel Button Logic
    const cancelBtn = document.getElementById('cancel-req-btn');
    if (cancelBtn) {
        if (!order.status || order.status === 'Pending') {
            cancelBtn.style.display = 'flex';
            cancelBtn.onclick = () => {
                const msg = `Hello Speed Gifts, I would like to request the cancellation of my order *#${order.orderId || orderId}*.\n\nPlease confirm if this is possible. Thank you!`;
                window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`, '_blank');
            };
        } else {
            cancelBtn.style.display = 'none';
        }
    }
}

function buildWhatsApp(order) {
    const waBtn = document.getElementById('wa-send-btn');
    if (!waBtn) return;
    const itemsText = (order.items || [])
        .map(i => `• ${i.name} x${i.qty || 1} – ${((i.price || 0) * (i.qty || 1)).toFixed(2)} AED`)
        .join('\n');
    const s = order.shipping || {};
    const msg = `Hello Speed Gifts! 👋\n\nI just placed Order *#${order.orderId || orderId}* on your website.\n\n📦 *Items:*\n${itemsText}\n\n✅ *Total: ${(order.total || 0).toFixed(2)} AED*\n\nHere are the photos and text details for my customization:\n\n[Attach your photos/text below]`;
    waBtn.onclick = () => window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Auth CTAs ─────────────────────────────────────────────────────────────────
function setupCTAs(user) {
    const el = document.getElementById('os-cta-section');
    if (!el) return;
    if (user && !user.isAnonymous) {
        // Show email verification banner if user just created account and hasn't verified yet
        const verifyBannerEl = document.getElementById('os-verify-banner');
        if (verifyBannerEl && !user.emailVerified && isFromCheckout) {
            verifyBannerEl.innerHTML = `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:1rem 1.25rem;display:flex;align-items:flex-start;gap:0.75rem;text-align:left;">
                <i class="fa-solid fa-envelope-circle-check" style="color:#d97706;font-size:1.2rem;margin-top:2px;flex-shrink:0;"></i>
                <div>
                    <strong style="display:block;font-size:0.82rem;color:#92400e;margin-bottom:0.2rem;">Verify your email address</strong>
                    <span style="font-size:0.76rem;color:#b45309;">A verification link has been sent to <b>${user.email}</b>. Click it to activate your account fully.</span>
                </div>
            </div>`;
            verifyBannerEl.style.display = 'block';
        }

        el.innerHTML = `
        <a href="account.html#orders" class="os-btn os-btn-primary">
            <i class="fa-solid fa-box-open"></i> View My Orders
        </a>
        <a href="/shop" class="os-btn os-btn-secondary">
            <i class="fa-solid fa-bag-shopping"></i> Continue Shopping
        </a>`;
    } else {
        el.innerHTML = `
        <div class="os-account-prompt">
            <div class="os-ap-icon"><i class="fa-solid fa-user-plus"></i></div>
            <div class="os-ap-text">
                <strong>Track this order anytime</strong>
                <span>Create a free account to view order history & delivery status.</span>
            </div>
        </div>
        <a href="login.html" class="os-btn os-btn-primary" style="margin-top:0.875rem;">
            <i class="fa-solid fa-user-plus"></i> Create Free Account
        </a>
        <a href="/shop" class="os-btn os-btn-secondary">
            <i class="fa-solid fa-bag-shopping"></i> Continue Shopping
        </a>`;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Show order ID immediately from URL
    if (orderId) {
        const el = document.getElementById('success-order-id');
        if (el) el.textContent = orderId;
    }

    // Fetch full order from Firestore
    if (orderId) {
        try {
            const q    = query(collection(db, 'orders'), where('orderId', '==', orderId), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
                renderOrder(snap.docs[0].data());
                // Hide loading skeleton
                document.getElementById('os-loading')?.remove();
                document.getElementById('os-details')?.style.setProperty('display', 'block');
            }
        } catch(err) {
            console.error('Order fetch error:', err);
            // Fallback: try sessionStorage
            try {
                const cached = JSON.parse(sessionStorage.getItem('sg_last_order') || 'null');
                if (cached && cached.orderId === orderId) renderOrder(cached);
            } catch(e) { /* no-op */ }
        }
    }

    // Auth state → CTAs
    onAuthStateChanged(auth, (user) => setupCTAs(user));

    // ── Back Button Hijack ────────────────────────────────────────────────────────
    // Prevent user from going back to cart/checkout. Send them to home page instead.
    // Only do this if they just checked out (not if they clicked an old order from account page).
    
    if (isFromCheckout) {
        window.history.replaceState({ os_page: 1 }, "", window.location.href);
        window.history.pushState({ os_page: 2 }, "", window.location.href);

        window.addEventListener('popstate', function(event) {
            if (event.state && event.state.os_page === 1) {
                window.location.replace('/');
            }
        });
    }
});
