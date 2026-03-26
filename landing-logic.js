// landing-logic.js - Logic for the standalone Landing Page

let landingSettings = null;
let products = [];
let categories = [];

const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const PAGE_SIZE = 8; // Number of items per section

// Helper for optimized Cloudinary URLs
function getOptimizedUrl(url, width = 600) {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return url || 'img/placeholder.jpg';
    if (url === 'img/') return 'https://placehold.co/600x600?text=No+Image';

    const baseTransform = 'f_auto,q_auto';
    const widthTransform = width ? `,w_${width},c_limit` : '';
    const fullTransform = baseTransform + widthTransform;

    if (url.includes('/upload/f_auto,q_auto')) {
        if (width && !url.includes(',w_')) {
            return url.replace('/upload/f_auto,q_auto', `/upload/${fullTransform}`);
        }
        return url;
    }
    return url.replace('/upload/', `/upload/${fullTransform}/`);
}

// Format Price
function formatPrice(price) {
    return `AED ${Number(price).toLocaleString()}`;
}

// Helper: Ensure authentication is ready before tracking
async function waitForAuth() {
    if (window.auth.currentUser) return window.auth.currentUser;
    return new Promise(resolve => {
        const unsubscribe = window.onAuthStateChanged(window.auth, (user) => {
            if (user) {
                unsubscribe();
                resolve(user);
            }
        });
        setTimeout(() => { unsubscribe(); resolve(null); }, 6000);
    });
}

async function trackLandingAdVisit() {
    const today = getTodayStr();
    const sessionKey = `landing_ad_visit_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    await waitForAuth();
    try {
        const statsRef = window.doc(window.db, 'artifacts', window.appId, 'public', 'data', 'daily_stats', today);
        await window.setDoc(statsRef, { landingAdVisits: window.increment(1) }, { merge: true });
        sessionStorage.setItem(sessionKey, 'true');
        console.log("[Landing Ad Tracking] Daily Visit recorded.");
    } catch (e) {
        console.error("[Landing Ad Tracking] Failed to record visit:", e);
    }
}

async function initLandingTraffic() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSrc = (urlParams.get('utm_source') || '').toLowerCase();
    const utmMed = (urlParams.get('utm_medium') || '').toLowerCase();

    console.log("[Landing Traffic] Initializing tracking...");

    if (urlParams.has('gclid') || 
        urlParams.has('gbraid') || 
        urlParams.has('wbraid') || 
        urlParams.has('gad_source') ||
        utmSrc === 'google' || 
        utmSrc === 'google_ads' || 
        utmSrc === 'googleads' ||
        utmMed === 'cpc' || 
        utmMed === 'ppc' || 
        utmMed === 'google_ads') {
        sessionStorage.setItem('traffic_source', 'Google Ads');
        console.log("[Landing Traffic] Google Ads detected.");
        trackLandingAdVisit();
    } else if (urlParams.has('utm_source')) {
        sessionStorage.setItem('traffic_source', urlParams.get('utm_source'));
    } else if (!sessionStorage.getItem('traffic_source')) {
        sessionStorage.setItem('traffic_source', 'Normal');
        console.log("[Landing Traffic] Normal visit detected.");
        trackNormalVisit();
    }
}

// Global Image Error Tracking (Site Health)
window.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG') {
        trackImageError(e.target.src);
    }
}, true);

async function trackImageError(src) {
    await waitForAuth();
    try {
        const today = getTodayStr();
        const statsRef = window.doc(window.db, 'artifacts', window.appId, 'public', 'data', 'daily_stats', today);
        await window.setDoc(statsRef, { imageLoadFail: window.increment(1) }, { merge: true });
        console.warn("[Health Check] Image failed to load on Landing Page:", src);
    } catch (e) {}
}

async function trackNormalVisit() {
    const today = getTodayStr();
    const sessionKey = `normal_visit_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    await waitForAuth();
    try {
        const statsRef = window.doc(window.db, 'artifacts', window.appId, 'public', 'data', 'daily_stats', today);
        await window.setDoc(statsRef, { normalVisits: window.increment(1) }, { merge: true });
        sessionStorage.setItem(sessionKey, 'true');
        console.log("[Landing Traffic] Normal visit recorded.");
    } catch (e) {
        console.error("[Landing Traffic] Normal visit tracking failed:", e);
    }
}

window.trackLandingWhatsAppClick = async function(buttonId) {
    // 1. Fire Google Ads Conversion via GTM
    if (window.dataLayer) {
        window.dataLayer.push({
            'event': 'whatsapp_inquiry',
            'product_ids': [buttonId],
            'is_bulk': false
        });
    }

    // 2. Record as internal Lead in Admin Panel insights if visitor came from Ads
    if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
        await waitForAuth();
        try {
            const today = getTodayStr();
            const statsRef = window.doc(window.db, 'artifacts', window.appId, 'public', 'data', 'daily_stats', today);
            await window.setDoc(statsRef, { adInquiries: window.increment(1) }, { merge: true });
            console.log("[Landing Ad Tracking] Daily lead recorded.");
        } catch (e) {
            console.error("[Landing Ad Tracking] Failed to record WhatsApp lead:", e);
        }
    }
};

async function initLandingPage() {
    try {
        console.log("Initializing Landing Page...");
        // Ensure Traffic Tracking starts after auth context is available
        initLandingTraffic();
        const db = window.db;
        const appId = window.appId;
        
        const prodCol = window.collection(db, 'artifacts', appId, 'public', 'data', 'products');
        const catCol = window.collection(db, 'artifacts', appId, 'public', 'data', 'categories');

        // Fetch Settings from special product document
        const landingSettingsRef = window.doc(db, 'artifacts', appId, 'public', 'data', 'products', '_landing_settings_');
        const settingsSnap = await window.getDoc(landingSettingsRef);
        if (settingsSnap.exists()) {
            landingSettings = settingsSnap.data();
            console.log("Landing Settings Loaded:", landingSettings);
        } else {
            console.log("No Landing Settings found. Using defaults.");
        }

        // Fetch Categories for name resolution
        const cSnap = await window.getDocs(window.query(catCol));
        categories = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Apply UI Settings
        applySettings();

        // Fetch Products based on settings
        if (landingSettings) {
            await Promise.all([
                loadSection(landingSettings.sec1Products || [], 'section-1', 'sec1-grid'),
                loadSection(landingSettings.sec2Products || [], 'section-2', 'sec2-grid')
            ]);
        }
        
        // Setup Interactions
        setupScrollEffects();

    } catch (err) {
        console.error("Error initializing landing page:", err);
    }
}

function applySettings() {
    if (!landingSettings) return;

    // Announcement Bar
    if (landingSettings.announcement) {
        const bar = document.getElementById('landing-announcement');
        if (bar) {
            bar.innerText = landingSettings.announcement;
            bar.classList.remove('hidden');
        }
    }

    // Hero Images
    const heroSection = document.getElementById('hero-section');
    const heroMob = document.getElementById('hero-mobile');
    const heroDesk = document.getElementById('hero-desktop');
    const heroContent = document.getElementById('hero-content');
    
    if (landingSettings.heroMob && landingSettings.heroMob !== 'img/') {
        heroMob.src = getOptimizedUrl(landingSettings.heroMob, 800);
        heroMob.onload = () => {
            heroMob.classList.remove('opacity-0');
            heroSection.classList.remove('skeleton-block');
            if(heroContent) {
                setTimeout(() => {
                    heroContent.classList.remove('opacity-0', 'translate-y-4');
                }, 300);
            }
        };
    } else {
        heroSection.style.display = 'none';
    }
    
    if (landingSettings.heroDesk && landingSettings.heroDesk !== 'img/') {
        heroDesk.srcset = getOptimizedUrl(landingSettings.heroDesk, 1920);
    }

    // Section 1 Titles (Remove Category Link logic)
    const hasSec1 = landingSettings.sec1Products && landingSettings.sec1Products.length > 0;
    if (landingSettings.sec1Title || hasSec1) {
        document.getElementById('sec1-title').innerText = landingSettings.sec1Title || 'Premium Collections';
        document.getElementById('section-1').classList.remove('hidden');
    }
    if (landingSettings.sec1Subtitle) {
        document.getElementById('sec1-subtitle').innerText = landingSettings.sec1Subtitle;
    } else {
        document.getElementById('sec1-subtitle').style.display = 'none';
    }

    // Section 2 Titles
    const hasSec2 = landingSettings.sec2Products && landingSettings.sec2Products.length > 0;
    if (landingSettings.sec2Title || hasSec2) {
        document.getElementById('sec2-title').innerText = landingSettings.sec2Title || 'Best Sellers';
        document.getElementById('section-2').classList.remove('hidden');
    }
    if (landingSettings.sec2Subtitle) {
        document.getElementById('sec2-subtitle').innerText = landingSettings.sec2Subtitle;
    } else {
        document.getElementById('sec2-subtitle').style.display = 'none';
    }
}

async function loadSection(productIds, sectionId, gridId) {
    if (!productIds || productIds.length === 0) return;
    
    const db = window.db;
    const appId = window.appId;
    const prodCol = window.collection(db, 'artifacts', appId, 'public', 'data', 'products');
    const grid = document.getElementById(gridId);
    
    // Initial Skeletons
    grid.innerHTML = Array(productIds.length > 4 ? 4 : productIds.length).fill().map(() => `
        <div class="landing-product-card skeleton-block h-[300px]"></div>
    `).join('');

    try {
        const snap = await window.getDocs(window.query(prodCol));
        let allProds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter requested IDs and ensure order matches selection
        let displayProds = allProds
            .filter(p => productIds.includes(p.id))
            .filter(p => p.inStock !== false);
            
        displayProds.sort((a,b) => productIds.indexOf(a.id) - productIds.indexOf(b.id));

        if (displayProds.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-gray-400 py-10 font-bold uppercase tracking-widest text-xs">No products selected for this section.</p>`;
            return;
        }

        grid.innerHTML = displayProds.map((p, index) => renderProductCard(p, index)).join('');
        
    } catch (err) {
        console.error(`Error loading section ${sectionId}:`, err);
        grid.innerHTML = `<p class="col-span-full text-center text-red-400 py-10 text-xs">Failed to load items.</p>`;
    }
}

function getBadgeLabel(b) {
    const map = { 'new': 'New', 'sale': 'Sale', 'hot': 'Hot', 'custom': 'Custom' };
    return map[b] || 'Premium';
}

window.toggleLandingWishlist = (e, id) => {
    e.stopPropagation(); // prevent navigation to detail page
    let wl = JSON.parse(localStorage.getItem('wishlist')) || [];
    const index = wl.findIndex(x => (typeof x === 'string' ? x : x.id) === id);
    if (index > -1) {
        wl.splice(index, 1);
    } else {
        wl.push(id);
    }
    localStorage.setItem('wishlist', JSON.stringify(wl));
    
    // Visually toggle on all matching cards in landing
    document.querySelectorAll(`.product-card[data-id="${id}"]`).forEach(card => {
        card.classList.toggle('wish-active');
    });
};

function renderProductCard(p, index) {
    const mainImg = getOptimizedUrl(p.img, 400);
    const delay = index * 50; // Staggered animation
    
    const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
    const outOfStockOverlay = p.inStock === false ? `
        <div class="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center">
            <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <i class="fa-solid fa-box-open text-gray-400 text-xl"></i>
            </div>
            <span class="text-[10px] font-black tracking-[0.2em] uppercase text-black bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">Out of Stock</span>
        </div>` : '';

    return `
        <div class="product-card group animate-fade-up ${p.inStock === false ? 'opacity-70' : ''}" data-id="${p.id}" style="animation-delay: ${delay}ms" 
             onclick="window.location.href='/?p=${p.id}&landing=true'">
            <div class="img-container mb-4 shadow-sm relative">
                ${badgeHtml}
                ${outOfStockOverlay}
                <img src="${mainImg}" 
                     class="${index < 4 ? 'no-animation' : ''}"
                     ${index < 4 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                     decoding="async"
                     onload="this.classList.add('loaded')"
                     alt="${p.name}">
            </div>
            <div class="px-1 text-left flex justify-between items-start mt-4">
                <div class="flex-1 min-w-0">
                    <h3 class="capitalize truncate leading-none text-gray-900 font-semibold text-[11px] sm:text-[13px]">${p.name}</h3>
                    <p class="price-tag mt-2 font-bold">${formatPrice(p.price)}</p>
                </div>
            </div>
        </div>
    `;
}

function setupScrollEffects() {
    const navbar = document.getElementById('navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('nav-scrolled');
        } else {
            navbar.classList.remove('nav-scrolled');
        }
    }, { passive: true });
}

// Start safely ensuring we don't miss DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLandingPage);
} else {
    initLandingPage();
}
