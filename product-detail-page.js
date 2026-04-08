import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { renderProductDetailView } from "./product-detail-renderer.js";
import { registerProductDetailInteractions } from "./product-detail-interactions.js";
import { getProductIdFromSearch, getProductDetailUrl } from "./product-detail-utils.js";

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const appId = firebaseConfig.projectId;
const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');

const DATA = { p: [], c: [] };
const state = { wishlist: [], currentVar: null };
const WISHLIST_KEY = 'speedgifts_detail_wishlist';

registerProductDetailInteractions({ getOptimizedUrl, state });

function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('res.cloudinary.com') && width) {
        return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
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

function loadWishlist() {
    try {
        const raw = localStorage.getItem(WISHLIST_KEY);
        state.wishlist = raw ? JSON.parse(raw) : [];
    } catch {
        state.wishlist = [];
    }
}

function saveWishlist() {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(state.wishlist));
}

window.toggleWishlist = (event, id) => {
    event?.stopPropagation?.();
    const idx = state.wishlist.findIndex(x => (typeof x === 'string' ? x : x.id) === id);
    if (idx >= 0) {
        state.wishlist.splice(idx, 1);
        showToast('Removed from favorites');
    } else {
        state.wishlist.push(id);
        showToast('Added to favorites');
    }
    saveWishlist();
    const icon = document.querySelector('#detail-wish-btn i');
    if (icon) {
        const active = state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === id);
        icon.className = `${active ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'} text-xl`;
    }
};

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
    if (selectedSize) details += `\n*Size:* ${selectedSize}`;
    if (selectedColor) details += `\n*Color:* ${selectedColor}`;
    if (!selectedSize && !selectedColor && p.size) details += `\n*Size:* ${p.size}`;
    const pUrl = getProductDetailUrl(id);
    const msg = `*Inquiry regarding:* ${p.name}\n*Price:* ${price} AED${details}\n\n*Product Link:* ${pUrl}\n\nPlease let me know the availability.`;
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.viewDetail = (id) => {
    const url = getProductDetailUrl(id);
    window.history.pushState({}, '', url);
    renderById(id);
};

async function renderById(id) {
    const product = DATA.p.find(x => x.id === id);
    if (!product) {
        document.getElementById('app').innerHTML = '<p class="text-center text-gray-500 mt-20">Product not found.</p>';
        return;
    }
    document.title = `${product.name} | Speed Gifts`;
    renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel });
}

async function bootstrap() {
    loadWishlist();
    const [prodSnap, catSnap] = await Promise.all([getDocs(prodCol), getDocs(catCol)]);
    DATA.p = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(p => !['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_'].includes(p.id));
    DATA.c = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const id = getProductIdFromSearch();
    if (!id) {
        window.location.replace('index.html');
        return;
    }
    await renderById(id);
}

window.addEventListener('popstate', () => {
    const id = getProductIdFromSearch();
    if (id) renderById(id);
});

const backBtn = document.getElementById('detail-back-btn');
if (backBtn) {
    backBtn.addEventListener('click', () => {
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
