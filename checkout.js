import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, addDoc, serverTimestamp, doc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
    getAuth, onAuthStateChanged, signInAnonymously,
    createUserWithEmailAndPassword, updateProfile, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

import { mountSharedShell } from './shared-shell.js?v=4';
import { getCartItems, getCartTotal, clearCart, loadCart } from './cart.js';

// ── Firebase Initialization ───────────────────────────────────────────────────
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

window._sgAuth = auth;
window._sgDb = db;

// ── Mount Shell ───────────────────────────────────────────────────────────────
mountSharedShell('checkout');

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

// ── Image Optimizer ───────────────────────────────────────────────────────────
function getOptimizedUrl(url, size = 150) {
    if (!url) return '';
    if (url.includes('res.cloudinary.com') && !url.includes('/upload/w_')) {
        return url.replace('/upload/', `/upload/w_${size},c_fill,f_auto,q_auto/`);
    }
    return url;
}

// ── Delivery Fee ─────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const deliveryMethod = urlParams.get('method') || 'delivery';
const DELIVERY_FEE = deliveryMethod === 'pickup' ? 0 : 35; // Fixed UAE delivery — 35 AED or Free Pickup

// ── Render Summary ────────────────────────────────────────────────────────────
let cartItems = [];
let cartTotal = 0;

function renderOrderSummary() {
    loadCart();
    cartItems = getCartItems();
    cartTotal = getCartTotal();

    if (cartItems.length === 0) {
        window.location.href = 'cart.html';
        return;
    }

    const listEl = document.getElementById('checkout-items-list');
    const subtotalEl = document.getElementById('chk-subtotal');
    const totalEl = document.getElementById('chk-total');

    let html = '';
    cartItems.forEach(item => {
        const imgUrl = getOptimizedUrl(item.img, 150) || 'https://placehold.co/150x150?text=Gift';
        const safeName = (item.name || 'Product').replace(/"/g, '&quot;');
        const varLabel = [item.size, item.color].filter(Boolean).join(' · ');
        const lineTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);

        html += `
        <div class="checkout-item">
            <img src="${imgUrl}" alt="${safeName}">
            <div class="checkout-item-details">
                <div class="checkout-item-title">${safeName}</div>
                <div class="checkout-item-meta">
                    ${varLabel ? `${varLabel} <br>` : ''}
                    Qty: ${item.qty || 1}
                </div>
            </div>
            <div class="checkout-item-price">${lineTotal} AED</div>
        </div>`;
    });

    const deliveryValEl = document.getElementById('chk-delivery-val');
    const deliveryEstEl = document.getElementById('chk-delivery-est-text');
    const deliveryLabel = document.getElementById('chk-delivery-label');
    const shippingSection = document.getElementById('shipping-section');

    const paymentTitle = document.getElementById('payment-title');
    const paymentSub = document.getElementById('payment-sub');
    const paymentIcon = document.getElementById('payment-icon');

    if (deliveryMethod === 'pickup') {
        if (deliveryValEl) deliveryValEl.innerText = 'Free';
        if (deliveryEstEl) deliveryEstEl.innerHTML = '<i class="fa-solid fa-store" style="margin-right:3px;"></i>Collect from Store';
        if (deliveryLabel) deliveryLabel.innerText = 'Store Collection';
        if (shippingSection) shippingSection.style.display = 'none';

        if (paymentTitle) paymentTitle.innerText = 'Pay at Store';
        if (paymentSub) paymentSub.innerText = 'Pay with cash or card when you collect your order.';
        if (paymentIcon) paymentIcon.className = 'fa-solid fa-store';
    } else {
        if (deliveryValEl) deliveryValEl.innerText = '35.00 AED';
        if (deliveryEstEl) deliveryEstEl.innerHTML = '<i class="fa-solid fa-truck" style="margin-right:3px;"></i>Est. 2 business days';
        if (deliveryLabel) deliveryLabel.innerText = 'Delivery';
        if (shippingSection) shippingSection.style.display = 'block';

        if (paymentTitle) paymentTitle.innerText = 'Cash on Delivery';
        if (paymentSub) paymentSub.innerText = 'Pay with cash or card when your order arrives.';
        if (paymentIcon) paymentIcon.className = 'fa-solid fa-money-bill-wave';
    }

    listEl.innerHTML = html;
    subtotalEl.innerText = `${cartTotal.toFixed(2)} AED`;
    totalEl.innerText = `${(cartTotal + DELIVERY_FEE).toFixed(2)} AED`;
}

// ── Field Validation Helpers ──────────────────────────────────────────────────
function setFieldError(inputId, errId, show) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    if (!input) return;
    if (show) {
        input.classList.add('error');
        input.classList.remove('success');
        if (err) err.classList.add('show');
    } else {
        input.classList.remove('error');
        input.classList.add('success');
        if (err) err.classList.remove('show');
    }
}

function clearFieldError(inputId, errId) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    if (!input) return;
    input.classList.remove('error');
    if (err) err.classList.remove('show');
}

// Live validation — clear errors as user types
['chk-name','chk-phone','chk-email','chk-city','chk-street','chk-building'].forEach(id => {
    document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => clearFieldError(id, 'err-' + id.replace('chk-','')));
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const emirate = document.getElementById('chk-emirate');
    if (emirate) emirate.addEventListener('change', () => clearFieldError('chk-emirate','err-emirate'));

    const createAccCheck = document.getElementById('chk-create-acc');
    const pwWrap = document.getElementById('chk-password-wrap');
    
    if (createAccCheck) {
        createAccCheck.addEventListener('change', function() {
            if (this.checked) {
                pwWrap.style.display = 'block';
            } else {
                pwWrap.style.display = 'none';
                clearFieldError('chk-password', 'err-password');
            }
        });
    }

    const pwToggle = document.getElementById('chk-pw-toggle');
    const pwInput = document.getElementById('chk-password');
    if (pwToggle && pwInput) {
        pwToggle.addEventListener('click', function() {
            if (pwInput.type === 'password') {
                pwInput.type = 'text';
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                pwInput.type = 'password';
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    }
});

// ── Submit Order ──────────────────────────────────────────────────────────────
window.submitOrder = async () => {
    // 1. Get Values
    const name     = document.getElementById('chk-name').value.trim();
    const phone    = document.getElementById('chk-phone').value.trim();
    const email    = document.getElementById('chk-email').value.trim().toLowerCase();
    const emirate  = document.getElementById('chk-emirate').value.trim();
    const city     = document.getElementById('chk-city').value.trim();
    const street   = document.getElementById('chk-street').value.trim();
    const building = document.getElementById('chk-building').value.trim();
    const notes    = document.getElementById('chk-notes').value.trim();

    const isCreateAcc = document.getElementById('chk-create-acc')?.checked;
    const password    = document.getElementById('chk-password')?.value || '';

    // 2. Per-field Validation
    let hasError = false;
    let fields = [
        { id:'chk-name',     errId:'err-name',     value: name },
        { id:'chk-phone',    errId:'err-phone',     value: phone }
    ];

    if (deliveryMethod === 'delivery') {
        fields.push(
            { id:'chk-emirate',  errId:'err-emirate',   value: emirate },
            { id:'chk-city',     errId:'err-city',      value: city },
            { id:'chk-street',   errId:'err-street',    value: street },
            { id:'chk-building', errId:'err-building',  value: building }
        );
    }

    // Always validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        fields.push({ id:'chk-email', errId:'err-email', value: false });
    } else {
        setFieldError('chk-email', 'err-email', false);
    }

    if (isCreateAcc) {
        if (password.length < 6) {
            fields.push({ id:'chk-password', errId:'err-password', value: false });
        } else {
            setFieldError('chk-password', 'err-password', false);
        }
    }

    fields.forEach(f => {
        if (!f.value) {
            setFieldError(f.id, f.errId, true);
            // Shake each empty field
            const el = document.getElementById(f.id);
            el?.classList.remove('chk-shake');
            void el?.offsetWidth; // reflow to restart animation
            el?.classList.add('chk-shake');
            setTimeout(() => el?.classList.remove('chk-shake'), 500);
            hasError = true;
        } else {
            setFieldError(f.id, f.errId, false);
        }
    });

    if (hasError) {
        // Scroll to first error
        const firstErr = document.querySelector('.chk-input.error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Please fill in all required fields correctly');
        return;
    }

    if (cartItems.length === 0) {
        showToast('Your cart is empty');
        return;
    }

    // 3. Loading State
    const btn = document.getElementById('place-order-btn');
    btn.classList.add('btn-loading');
    btn.innerHTML = `<i class="fa-solid fa-spinner"></i> Processing...`;

    try {
        let finalUid = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null;

        if (isCreateAcc && email && password) {
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(cred.user, { displayName: name });
                finalUid = cred.user.uid;
                // Send email verification — does NOT block the order
                try {
                    await sendEmailVerification(cred.user);
                } catch (verifyErr) {
                    console.warn('Verification email failed (non-critical):', verifyErr);
                }
            } catch (err) {
                let msg = err.message || 'Could not create account';
                const code = err.code || '';
                if (code === 'auth/email-already-in-use') msg = 'This email is already registered. Please login instead.';
                else if (code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
                else if (code === 'auth/weak-password') msg = 'Password must be at least 6 characters.';
                else msg = msg.replace('Firebase:', '').replace(/\(auth\/.*\)\.?/, '').trim();
                
                showToast(msg);
                btn.classList.remove('btn-loading');
                btn.innerHTML = `<i class="fa-solid fa-check"></i> Place Order`;
                return;
            }
        }

        // 4. Generate Order ID
        const orderId = 'SG-' + Math.floor(10000 + Math.random() * 90000);

        // 5. Construct Order Object
        const orderData = {
            orderId,
            fulfillmentMethod: deliveryMethod,
            customer: { name, phone, email, uid: finalUid },
            shipping: { emirate, city, street, building, notes },
            items: cartItems.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                qty: item.qty,
                size: item.size || null,
                color: item.color || null,
                img: item.img
            })),
            total: cartTotal + DELIVERY_FEE,
            subtotal: cartTotal,
            deliveryFee: DELIVERY_FEE,
            status: 'Pending',
            paymentMethod: deliveryMethod === 'pickup' ? 'Pay at Store' : 'COD',
            createdAt: serverTimestamp()
        };

        // 6. Save to Firestore
        const ordersCol = collection(db, 'orders');
        const docRef = await addDoc(ordersCol, orderData);

        // Save locally for guest fallback on success page
        try {
            // Convert serverTimestamp to a local format so the success page doesn't crash on it
            const cachedOrder = { ...orderData, createdAt: Math.floor(Date.now() / 1000), docId: docRef.id };
            sessionStorage.setItem('sg_last_order', JSON.stringify(cachedOrder));
        } catch(e) { /* ignore */ }

        // 7. Clear Cart & Redirect
        clearCart();
        window.location.replace(`order-success.html?orderId=${orderId}&fromCheckout=1`);

    } catch (err) {
        console.error('Order submission failed:', err);
        showToast('Error processing order. Please try again.');
        btn.classList.remove('btn-loading');
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Place Order`;
    }
};

// ── Init ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        signInAnonymously(auth).catch(() => { /* no-op */ });
    }
});

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    // Initial render might fail if cart.js hasn't loaded data from localstorage yet.
    // Give it a tiny delay to ensure cart module is ready.
    setTimeout(renderOrderSummary, 100);
});
