import { mountSharedShell } from './shared-shell.min.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         collection, query, where, getDocs, limit }
    from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// Mount standard navbar/sidebar
mountSharedShell('track');

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

const form = document.getElementById('track-form');
const btn = document.getElementById('to-submit-btn');
const errorBox = document.getElementById('to-error-msg');
const errorSpan = errorBox.querySelector('span');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderIdInput = document.getElementById('to-order-id').value.trim().toUpperCase();
    const phoneInput = document.getElementById('to-phone').value.trim();

    if (!orderIdInput || !phoneInput) return;

    errorBox.style.display = 'none';
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
    btn.disabled = true;

    try {
        const q = query(collection(db, 'orders'), where('orderId', '==', orderIdInput), limit(1));
        const snap = await getDocs(q);

        if (snap.empty) {
            throw new Error('Order not found. Please check your Order ID.');
        }

        const order = snap.docs[0].data();
        
        // Normalize phones to compare (remove spaces, dashes, plus signs, brackets)
        const normalizePhone = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '');
        
        const dbPhone = normalizePhone(order.customer?.phone);
        const inputPhone = normalizePhone(phoneInput);

        // Security Check: Either exact match, or one is a substring of the other (e.g. 0501234567 vs 971501234567)
        if (!dbPhone || (!dbPhone.includes(inputPhone) && !inputPhone.includes(dbPhone))) {
            throw new Error('Phone number does not match our records for this order.');
        }

        // Add to cache so it works smoothly in order-success page
        try {
            sessionStorage.setItem('sg_last_order', JSON.stringify({
                ...order,
                createdAt: order.createdAt?.seconds || Math.floor(Date.now() / 1000)
            }));
        } catch(err) {}

        // Redirect to success/tracking page securely
        window.location.href = `order-success.html?orderId=${orderIdInput}`;

    } catch (err) {
        errorSpan.textContent = err.message || 'Unable to find order. Please try again.';
        errorBox.style.display = 'block';
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
});
