import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc, setDoc, increment, writeBatch, arrayUnion, query, where, documentId } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut, updateProfile, verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
// Use new cache API instead of deprecated enableIndexedDbPersistence()
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);
const appId = firebaseConfig.projectId;

const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const shareCol = collection(db, 'artifacts', appId, 'public', 'data', 'selections');
const sliderCol = collection(db, 'artifacts', appId, 'public', 'data', 'sliders');
const megaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mega_menus');
const popupSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'popupSettings');
const landingSettingsCol = collection(db, 'artifacts', appId, 'public', 'data', 'landingSettings');
const leadsCol = collection(db, 'artifacts', appId, 'public', 'data', 'leads');

let DATA = { p: [], c: [], m: [], s: [], announcements: [], leads: [], popupSettings: { title: '', msg: '', img: '' }, landingSettings: null, homeSettings: null, stats: { adVisits: 0, adHops: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0 } };
let state = { filter: 'all', sort: 'all', search: '', user: null, authUser: null, selected: [], wishlist: [], cart: [], selectionId: null, scrollPos: 0, currentVar: null, visibleChunks: 1, authMode: 'login' };
const PAGE_SIZE = 16;
let clicks = 0, lastClickTime = 0;
let iti; // Phone input instance

// Format Date to YYYY-MM-DD (Robust)
const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// SEO HELPERS
function updateMetaDescription(description) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = "description";
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
}

function updateCanonicalURL(queryString) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
    }
    const baseUrl = 'https://speedgifts.ae/';
    canonical.setAttribute('href', baseUrl + queryString);
}

let lastWhatsAppTrackTime = 0;

// SINGLE PAGE APPLICATION (SPA) TRACKING
function trackPageView() {
    if (typeof gtag === 'function') {
        const path = window.location.pathname + window.location.search;
        gtag('config', 'AW-789546339', { 'page_path': path });
        gtag('config', 'G-98ZMG3ZF7Z', { 'page_path': path });
        console.log(`[Ad Tracking] Page View recorded: ${path}`);
    }
}
window.trackWhatsAppInquiry = async (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    const now = Date.now();
    if (now - lastWhatsAppTrackTime < 2000) return;
    lastWhatsAppTrackTime = now;

    console.log(`[Ad Tracking] WhatsApp Inquiry for: ${idList.join(', ')}`);

    // GTM Event
    if (window.dataLayer) {
        window.dataLayer.push({
            'event': 'whatsapp_inquiry',
            'product_ids': idList,
            'is_bulk': idList.length > 1
        });
    }

    // Record Ad Inquiry (Conversion)
    if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
        await waitForAuth();
        try {
            const today = getTodayStr();
            const dailyStatsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
            await setDoc(dailyStatsRef, { adInquiries: increment(1) }, { merge: true });

            for (const id of idList) {
                if (id !== 'bulk_inquiry') {
                    const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
                    await setDoc(dailyProdRef, { adInquiries: increment(1), productId: id, date: today }, { merge: true });
                }
            }
            // LOCAL UPDATE: Increment local state for immediate feedback in debug tool
            if (DATA.stats) DATA.stats.adInquiries++;
            console.log("[Ad Tracking] Daily Inquiry recorded successfully.");
        } catch (e) {
            console.error("[Ad Tracking] Inquiry tracking error:", e);
        }
    }
};

/* DEBUG MODE HELPER: Run 'checkAdData()' in console to verify tracking */
window.checkAdData = () => {
    console.log("--- AD TRACKING DEBUG ---");
    console.log("Traffic Source Detected:", sessionStorage.getItem('traffic_source'));
    console.log("Tracked this session?:", sessionStorage.getItem('ad_visit_tracked_v3'));
    console.log("Current Data Memory State:", DATA.stats);
    const testProd = DATA.p.find(p => p.adInquiries > 0);
    console.log("Example Product with Inquiries:", testProd ? `${testProd.name}: ${testProd.adInquiries}` : "None found yet");
    console.log("-------------------------");
};

async function initTrafficTracking() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSrc = (urlParams.get('utm_source') || '').toLowerCase();
    const utmMed = (urlParams.get('utm_medium') || '').toLowerCase();

    console.log("[Traffic] Detecting source...");

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
        console.log("[Traffic] Google Ads source verified.");
    } else if (urlParams.has('utm_source')) {
        sessionStorage.setItem('traffic_source', urlParams.get('utm_source'));
        console.log(`[Traffic] UTM Source identified: ${urlParams.get('utm_source')}`);
    } else if (!sessionStorage.getItem('traffic_source')) {
        sessionStorage.setItem('traffic_source', 'Normal');
        console.log("[Traffic] Normal traffic source set.");
    }
}

// Global Image Error Tracking (Site Health)
// Session-scoped deduplication: each unique broken URL counted only ONCE per session
const _errorTrackedUrls = new Set();

window.addEventListener('error', function (e) {
    if (e.target.tagName !== 'IMG') return;
    const src = e.target.src || '';
    // Skip: placeholder images, empty src, data URIs, already-tracked this session
    if (!src || src.startsWith('data:') || src.includes('placehold.co') || src.includes('placeholder')) return;
    // Skip: non-http URLs, directory-style paths (e.g. "/img/"), and site-own-page URLs
    if (!src.startsWith('http')) return;
    const ownOrigin = window.location.origin;
    const srcPath = src.replace(ownOrigin, '');
    if (!srcPath || srcPath === '/' || srcPath.startsWith('/admin') || srcPath === '/img/' || !srcPath.includes('.')) return;
    if (_errorTrackedUrls.has(src)) return;  // Already counted this session — skip
    _errorTrackedUrls.add(src);
    trackImageError(src);
}, true);

async function trackImageError(src) {
    try {
        const today = getTodayStr();
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        // Save both the count AND the specific broken URL for admin visibility
        await setDoc(statsRef, {
            imageLoadFail: increment(1),
            brokenImages: arrayUnion(src)
        }, { merge: true });
        console.warn("[Health Check] Image failed to load:", src);
    } catch (e) { }
}

async function trackNormalVisit() {
    const today = getTodayStr();
    const sessionKey = `normal_visit_tracked_${today}`; // Daily tracking
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        console.log(`[Traffic] Recording normal visit to: daily_stats/${today}`);
        await setDoc(statsRef, { normalVisits: increment(1) }, { merge: true });
        console.log("[Traffic] Normal visit recorded.");
    } catch (e) {
        console.error("[Traffic] Normal visit tracking failed:", e);
    }
}

// Helper: Ensure authentication is ready before tracking
async function waitForAuth() {
    if (auth.currentUser) return auth.currentUser;
    return new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                unsubscribe();
                resolve(user);
            }
        });
        setTimeout(() => { unsubscribe(); resolve(null); }, 6000);
    });
}

// ADVANCED AD TRACKING: SESSION DURATION & ENGAGEMENT
let sessionStartTime = Date.now();
let lastEngagementTime = Date.now();
let totalActiveSeconds = 0;

// Track active time every 5 seconds if user is engaged
setInterval(() => {
    if (document.visibilityState === 'visible' && (Date.now() - lastEngagementTime < 60000)) {
        totalActiveSeconds += 5;
    }
}, 5000);

// Record engagement on interactions
['mousedown', 'touchstart', 'scroll', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => { lastEngagementTime = Date.now(); }, { passive: true });
});

async function syncSessionDuration() {
    if (sessionStorage.getItem('traffic_source') !== 'Google Ads') return;
    if (totalActiveSeconds < 5) return;

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(statsRef, { totalSessionSeconds: increment(totalActiveSeconds) }, { merge: true });
        console.log(`[Ad Tracking] Synced ${totalActiveSeconds}s session duration.`);
        totalActiveSeconds = 0; // Reset after sync
    } catch (e) {
        console.error("[Ad Tracking] Session sync failed:", e);
    }
}

// Sync on leave
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncSessionDuration();
});
window.addEventListener('beforeunload', syncSessionDuration);

// IMPRESSION TRACKING
const impressionCache = new Set();
let impressionObserver = null;

function initImpressionTracking() {
    // Disabled as per User request to only track manual detail page views.
}

// recordImpression removed as per User request


async function trackAdHop() {
    const today = getTodayStr();
    const sessionKey = `ad_hop_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true'); // Immediate set to prevent race

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        console.log(`[Ad Tracking] Recording hop to: daily_stats/${today}`);
        await setDoc(statsRef, { adHops: increment(1) }, { merge: true });
        console.log("[Ad Tracking] Daily Hop recorded.");
    } catch (e) {
        console.error("[Ad Tracking] Hop tracking error:", e);
    }
}

async function trackAdVisit() {
    const today = getTodayStr();
    const sessionKey = `ad_visit_tracked_${today}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    await waitForAuth();
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        await setDoc(statsRef, { adVisits: increment(1) }, { merge: true });
        console.log("[Ad Tracking] Daily Ad Visit recorded.");
    } catch (e) {
        console.error("[Ad Tracking] Ad visit recording failed:", e);
    }
}

onAuthStateChanged(auth, async (u) => {
    state.user = u;

    if (!u) {
        console.log("[Auth] No session found, initializing guest session...");
        await signInAnonymously(auth).catch(e => console.error("[Auth] Guest sync failed:", e));
        return; // Wait for the next trigger with the anonymous user
    }

    // CUSTOMER AUTH UI
    if (u && !u.isAnonymous) {
        state.authUser = u;
        const navBtn = document.getElementById('nav-user-btn');
        if (navBtn) navBtn.classList.add('text-black');

        const accountName = document.getElementById('account-user-name');
        const accountEmail = document.getElementById('account-user-email');
        if (accountName) accountName.innerText = u.displayName || "User";
        if (accountEmail) accountEmail.innerText = u.email || "";
    } else {
        state.authUser = null;
        const navBtn = document.getElementById('nav-user-btn');
        if (navBtn) navBtn.classList.remove('text-black');
    }

    if (u) {
        console.log("[Auth] Session active. Updating data...");
        await initTrafficTracking();
        await refreshData();

        if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
            trackAdHop();
            trackAdVisit(); // Fix: Track immediately so visits aren't lost if they bounce quickly or click WhatsApp
        } else {
            trackNormalVisit();
        }
        await loadWishlist();
    }
});

const handleReentry = () => {
    if (DATA.p.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const pId = urlParams.get('p');
        if (pId) viewDetail(pId, true, null, false); // Enable tracking for initial entry
        else {
            renderHome();
            updateMetaDescription("Discover premium gifts and personalized items at Speed Gifts. From engraved wood to custom cushions, find the perfect gift for every occasion.");
            updateCanonicalURL('');
        }
    } else if (auth.currentUser) {
        refreshData();
    }
};

window.addEventListener('pageshow', (e) => {
    if (e.persisted || (window.performance && window.performance.navigation.type === 2)) {
        setTimeout(handleReentry, 150);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        setTimeout(handleReentry, 250);
    }
});

window.onfocus = () => { handleReentry(); };

window.onpopstate = () => {
    refreshData(true);
    trackPageView();
};


async function loadWishlist() {
    if (!state.user) return;
    try {
        const wishDoc = await getDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'));
        if (wishDoc.exists()) {
            const cloudIds = wishDoc.data().ids || [];

            // Merge existing session wishlist (if they favorited items before logging in) with cloud
            // Need to merge arrays of objects/strings properly.
            const merged = [...state.wishlist];
            cloudIds.forEach(cloudId => {
                const idToCheck = typeof cloudId === 'string' ? cloudId : cloudId.id;
                const exists = merged.some(x => (typeof x === 'string' ? x : x.id) === idToCheck);
                if (!exists) merged.push(cloudId);
            });

            state.wishlist = merged;
            updateWishlistBadge();
            updateAllWishlistUI();

            // Re-sync merged data back to cloud immediately
            setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'), { ids: state.wishlist }).catch(e => console.error);

        } else {
            // No cloud data. If they favorited items anonymously before logging in, push to new cloud account.
            if (state.wishlist.length > 0) {
                setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'), { ids: state.wishlist }).catch(e => console.error);
            }
            updateAllWishlistUI();
        }
    } catch (err) { console.error("Wishlist Load Error"); }
}

function updateAllWishlistUI() {
    const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

    // Update all visible product cards
    document.querySelectorAll('.product-card').forEach(card => {
        const id = card.getAttribute('data-id');
        if (id) {
            card.classList.toggle('wish-active', isInWishlist(id));
        }
    });

    // Update detail view if open
    const detailHeart = document.getElementById('detail-wish-btn');
    if (detailHeart) {
        const id = detailHeart.getAttribute('data-id');
        if (id) {
            const icon = detailHeart.querySelector('i');
            if (isInWishlist(id)) {
                icon.className = 'fa-solid fa-heart text-red-500 text-xl';
            } else {
                icon.className = 'fa-regular fa-heart text-xl';
            }
        }
    }
}

function updateWishlistBadge() {
    const badge = document.getElementById('nav-wishlist-count');
    const sidebarCount = document.getElementById('sidebar-count');
    const count = state.wishlist.length;

    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (sidebarCount) {
        sidebarCount.innerText = `${count} ${count === 1 ? 'Item' : 'Items'} Saved`;
    }

    const mobBadge = document.getElementById('nav-wishlist-count-mob');
    if (mobBadge) {
        if (count > 0) {
            mobBadge.innerText = count;
            mobBadge.classList.remove('hidden');
        } else {
            mobBadge.classList.add('hidden');
        }
    }
}

window.toggleWishlist = async (e, id) => {
    if (e) e.stopPropagation();
    if (!state.user) return showToast("Authenticating...");

    // Find if product exists in wishlist
    const existingIndex = state.wishlist.findIndex(x => (typeof x === 'string' ? x : x.id) === id);

    if (existingIndex > -1) {
        state.wishlist.splice(existingIndex, 1);
    } else {
        const entry = { id };
        if (state.currentVar) entry.var = { ...state.currentVar };
        state.wishlist.push(entry);
    }

    // UI Updates
    updateWishlistBadge();

    // Helper to check if any version of ID is in wishlist
    const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

    // Update main grid cards if visible
    const gridCards = document.querySelectorAll(`.product-card[data-id="${id}"]`);
    gridCards.forEach(card => {
        card.classList.toggle('wish-active', isInWishlist(id));
    });

    // Update detail view heart icon
    const detailHeart = document.getElementById('detail-wish-btn');
    if (detailHeart && detailHeart.getAttribute('data-id') === id) {
        const icon = detailHeart.querySelector('i');
        if (isInWishlist(id)) {
            icon.className = 'fa-solid fa-heart text-red-500 text-xl';
        } else {
            icon.className = 'fa-regular fa-heart text-xl';
        }
    }

    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();

    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'), { ids: state.wishlist });
    } catch (err) { showToast("Sync Error"); }
};

window.renderDesktopMegaMenu = () => {
    const container = document.getElementById('desk-mega-menu');
    if (!container) return;

    const sorted = [...(DATA.m || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const wrapper = document.getElementById('desktop-mega-menu-wrapper');

    if (sorted.length === 0) {
        if (wrapper) wrapper.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    if (wrapper) wrapper.style.display = '';
    container.innerHTML = '';

    sorted.forEach((m) => {
        const mappedCats = (m.categoryIds || [])
            .map(cId => DATA.c.find(c => c.id === cId))
            .filter(Boolean);

        const li = document.createElement('li');
        li.className = 'mega-menu-li';

        const a = document.createElement('a');
        a.className = 'mega-menu-link';
        a.innerHTML = `${m.name}${mappedCats.length > 0 ? ' <i class="fa-solid fa-chevron-down mega-menu-arrow"></i>' : ''}`;
        li.appendChild(a);

        if (mappedCats.length > 0) {
            const panel = document.createElement('div');

            // 1. Panel Container Styles (Simplified, letting CSS handle the heavy lifting)
            panel.className = 'mega-dropdown-panel';
            panel.style.display = 'none'; // Overridden on hover

            // RIGID 5-COLUMN GRID (This is the fix)
            // inline styles removed to let CSS govern the 5-column grid cleanly

            mappedCats.forEach(c => {
                const card = document.createElement('div');
                card.className = 'mega-cat-card';

                const thumb = document.createElement('div');
                thumb.style.width = '34px';
                thumb.style.height = '34px';
                thumb.style.flexShrink = '0';
                thumb.style.borderRadius = '9px';
                thumb.style.overflow = 'hidden';
                thumb.style.background = '#f9fafb';
                thumb.style.border = '1px solid #eee';

                const img = document.createElement('img');
                const _catImgUrl = getOptimizedUrl(c.img, 80);
                img.src = _catImgUrl || 'https://placehold.co/80x80?text=?';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                if (_catImgUrl) img.onerror = () => { img.src = 'https://placehold.co/80x80?text=?'; };
                thumb.appendChild(img);

                const label = document.createElement('span');
                label.className = 'mega-cat-name';
                label.textContent = c.name;

                card.appendChild(thumb);
                card.appendChild(label);
                card.addEventListener('click', () => window.applyFilter(c.id));
                panel.appendChild(card);
            });

            li.appendChild(panel);

            let hideTimer;
            const showPanel = () => {
                clearTimeout(hideTimer);
                // Explicitly set display: grid to force 5 columns
                panel.style.display = 'grid';
                const arrow = a.querySelector('.mega-menu-arrow');
                if (arrow) arrow.style.transform = 'rotate(180deg)';
                a.style.color = '#000';
                a.style.borderBottomColor = '#000';
            };
            const hidePanel = (delay = 80) => {
                hideTimer = setTimeout(() => {
                    panel.style.display = 'none';
                    const arrow = a.querySelector('.mega-menu-arrow');
                    if (arrow) arrow.style.transform = '';
                    a.style.color = '';
                    a.style.borderBottomColor = '';
                }, delay);
            };

            li.addEventListener('mouseenter', showPanel);
            li.addEventListener('mouseleave', () => hidePanel(100));
            panel.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            panel.addEventListener('mouseleave', () => hidePanel(100));
        }

        container.appendChild(li);
    });
};

async function refreshData(isNavigationOnly = false) {
    try {
        if (!isNavigationOnly || DATA.p.length === 0) {
            const today = getTodayStr();
            const todayRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);

            const [pSnap, cSnap, mSnap, sSnap, popSnap, todaySnap] = await Promise.all([
                getDocs(prodCol),
                getDocs(catCol),
                getDocs(megaCol).catch(e => ({ docs: [] })),
                getDocs(sliderCol).catch(e => {
                    console.error("Slider fetch failed:", e);
                    return { docs: [] };
                }),
                getDocs(popupSettingsCol).catch(e => ({ empty: true })),
                getDoc(todayRef).catch(e => null)
            ]);
            DATA.p = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            DATA.c = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            DATA.m = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
            DATA.s = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Fetch Announcements (from products collection with ID _announcements_)
            const announceDoc = DATA.p.find(p => p.id === '_announcements_');
            DATA.announcements = announceDoc ? (announceDoc.messages || []) : [];

            // Apply Popup Settings
            if (!popSnap.empty && popSnap.docs) {
                DATA.popupSettings = popSnap.docs[0].data();
            }

            // Apply Landing Settings (from products collection)
            const landDoc = DATA.p.find(p => p.id === '_landing_settings_');
            if (landDoc) {
                DATA.landingSettings = { ...landDoc };
            } else {
                DATA.landingSettings = null;
            }

            // Apply Home Settings (from products collection)
            const homeDoc = DATA.p.find(p => p.id === '_home_settings_');
            if (homeDoc) {
                DATA.homeSettings = { ...homeDoc };
            } else {
                DATA.homeSettings = null;
            }

            // Extract stats from legacy _ad_stats_ 
            const statsDoc = DATA.p.find(p => p.id === '_ad_stats_');
            const defaultStats = { adVisits: 0, adHops: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0, normalVisits: 0, adProductClicks: 0, normalProductClicks: 0, imageLoadFail: 0 };

            // Initial legacy/all-time baseline
            DATA.stats = statsDoc ? { ...defaultStats, ...statsDoc } : defaultStats;

            // Merge Today's active stats into memory baseline
            if (todaySnap?.exists()) {
                const td = todaySnap.data();
                DATA.stats.adVisits += (td.adVisits || 0) + (td.landingAdVisits || 0);
                DATA.stats.normalVisits += (td.normalVisits || 0);
                DATA.stats.adProductClicks = (DATA.stats.adProductClicks || 0) + (td.adProductClicks || 0);
                DATA.stats.normalProductClicks = (DATA.stats.normalProductClicks || 0) + (td.normalProductClicks || 0);
                DATA.stats.adInquiries += (td.adInquiries || 0);
                DATA.stats.imageLoadFail += (td.imageLoadFail || 0);
                // Note: adHops and other fields can also be merged if present in daily_stats
            }

            // Remove internal docs from the products list
            DATA.p = DATA.p.filter(p => !['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_'].includes(p.id));

            renderAnnouncementBar();
            renderDesktopMegaMenu();
            // Aggressive Preloading for instant feel
            window.preloadInitialBatch();

            console.log("[Ad Tracking] UI Refreshed. Counter is now:", DATA.stats.adVisits);
        }
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('s');
        const prodId = urlParams.get('p');
        const catId = urlParams.get('c');
        const query = urlParams.get('q');
        const isAdminOpen = !document.getElementById('admin-panel').classList.contains('hidden');

        // Sync state from URL
        let rawCatId = catId || 'all';
        // Sanitization: Remove trailing slashes and handle malformed query markers (e.g. ?c=caricature?gclid=...)
        if (rawCatId !== 'all') {
            rawCatId = rawCatId.split('?')[0].split('&')[0].replace(/\/+$/, '').trim();
        }
        state.filter = rawCatId;
        state.search = query || '';

        // SMART CATEGORY MATCHING: If state.filter is not 'all', check if it's a Name instead of an ID
        if (state.filter !== 'all') {
            const foundById = DATA.c.find(c => c.id === state.filter);
            if (!foundById) {
                // Try matching by name (case-insensitive)
                const foundByName = DATA.c.find(c => c.name.toLowerCase() === state.filter.toLowerCase());
                if (foundByName) {
                    state.filter = foundByName.id;
                } else {
                    // FALLBACK: If requested category is totally invalid, default to 'all'
                    console.warn(`[Routing] Invalid category '${state.filter}' requested. Falling back to 'all'.`);
                    state.filter = 'all';
                    // Clean URL
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('c', 'all');
                    window.history.replaceState({}, '', newUrl);
                }
            }
        }

        if (!isAdminOpen) {
            if (prodId && DATA.p.length > 0) {
                viewDetail(prodId, true);
            } else if (shareId) {
                try {
                    const selDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'selections', shareId));
                    if (selDoc.exists()) {
                        state.selectionId = shareId;
                        state.selected = selDoc.data().ids;
                    }
                } catch (e) { console.error("Selection sync failed"); }
                renderHome();
            } else {
                renderHome();
            }
        } else {
            renderHome();
        }

        populateCatSelect();
        populateAdminCatFilter();

        // PERSISTENCE: Auto-open admin if in URL
        const openAdmin = urlParams.get('admin') === 'true';
        const activeTab = urlParams.get('atab');
        if (openAdmin) {
            if (activeTab) state.adminTab = activeTab;
            window.showAdminPanel();
        } else {
            renderAdminUI();
        }


        // Preload in background (non-blocking)
        const iconsToLoad = DATA.c.map(c => getOptimizedUrl(c.img)).filter(u => u && u !== 'img/').slice(0, 10);
        const stockFilter = (items) => items.filter(p => p.inStock !== false);
        let filteredForPreload = [];
        if (state.selectionId) filteredForPreload = DATA.p.filter(p => state.selected.includes(p.id));
        else if (state.filter !== 'all') filteredForPreload = stockFilter(DATA.p.filter(p => p.catId === state.filter));
        else filteredForPreload = stockFilter(DATA.p);

        filteredForPreload.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        const prodsToLoad = filteredForPreload.slice(0, 8).map(p => getOptimizedUrl(p.img)).filter(u => u && u !== 'img/');
        const allToPreload = [...new Set([...prodsToLoad, ...iconsToLoad])];

        // Fire and forget (don't await)
        allToPreload.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    } catch (err) {
        console.error(err);
    }
}

const safePushState = (params, replace = false) => {
    try {
        const url = new URL(window.location.href);
        // Clear conflicting params if needed, or just handle all
        const keys = ['p', 's', 'c', 'q'];
        keys.forEach(key => {
            if (params.hasOwnProperty(key)) {
                if (params[key] === null) url.searchParams.delete(key);
                else url.searchParams.set(key, params[key]);
            }
        });
        const finalPath = url.pathname + url.search;
        if (replace) window.history.replaceState({}, '', finalPath);
        else window.history.pushState({}, '', finalPath);

        // Track virtual page view
        trackPageView();
    } catch (e) { console.warn("Nav Error"); }
};

window.handleLogoClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 5000) clicks = 0;
    clicks++; lastClickTime = now;
    if (clicks >= 5) {
        clicks = 0; // Reset

        // SECURITY: Only allow real admin to unlock the hidden dashboard button
        const u = state.authUser || window._fbAuth?.currentUser || getAuth().currentUser;
        if (!u || u.email !== "laszonaicreation@gmail.com") {
            showToast("Admin access denied");
            return;
        }

        const btn = document.getElementById('admin-entry-btn');
        const hideBtn = document.getElementById('admin-hide-btn');
        if (btn) {
            btn.classList.remove('hidden');
            if (hideBtn) hideBtn.classList.remove('hidden');
            showToast("Dashboard Unlocked");
            renderHome(); // Re-render to show pin icons
        }
    } else {
        // Stability: Only navigate home if we're not already viewing the main collection
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('p') || urlParams.has('s') || state.filter !== 'all' || state.search !== '') {
            goBackToHome(false);
        }
    }
};

window.hideDashboardButton = () => {
    const btn = document.getElementById('admin-entry-btn');
    const hideBtn = document.getElementById('admin-hide-btn');
    if (btn) btn.classList.add('hidden');
    if (hideBtn) hideBtn.classList.add('hidden');
    showToast("Dashboard Hidden");
    renderHome(); // Re-render to hide pin icons
};

window.goBackToHome = (forceReset = false) => {
    if (forceReset) {
        state.selectionId = null;
        state.selected = [];
        state.filter = 'all';
        state.search = '';
        state.scrollPos = 0;
        state.visibleChunks = 1; // Reset pagination
        safePushState({ s: null, p: null, c: null, q: null });
    } else {
        safePushState({ p: null });
    }
    renderHome();
};

window.toggleSelectAll = () => {
    if (state.selectionId) return;
    const stockFilter = (items) => items.filter(p => p.inStock !== false);
    let currentVisible = [];
    if (state.filter !== 'all') currentVisible = stockFilter(DATA.p.filter(p => p.catId === state.filter));
    else currentVisible = stockFilter(DATA.p);
    const visibleIds = currentVisible.map(p => p.id);
    const allVisibleSelected = visibleIds.every(id => state.selected.includes(id));
    if (allVisibleSelected) state.selected = state.selected.filter(id => !visibleIds.includes(id));
    else state.selected = Array.from(new Set([...state.selected, ...visibleIds]));

    // Flag to prevent the jump when selecting items
    state.skipScroll = true;
    renderHome();
};

// Detect how many columns the product grid currently shows
function getColumnsCount() {
    const w = window.innerWidth;
    if (w >= 1024) return 5; // lg (max columns in CSS)
    if (w >= 768) return 4; // md
    if (w >= 640) return 3; // sm
    return 2;                // mobile
}

window.loadMoreProducts = () => {
    state.isLoadMore = true;
    state.visibleChunks++;
    renderHome();
};

window.showLessProducts = () => {
    state.isLoadMore = false;
    state.visibleChunks = 1;
    renderHome();

    // Scroll back to the collection title
    setTimeout(() => {
        const title = document.getElementById('active-category-title');
        if (title) {
            const yOffset = -200;
            const y = title.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }, 100);
};


function renderHome() {
    try {
        const outerWrapper = document.getElementById('home-top-elements');
        if (outerWrapper) outerWrapper.classList.remove('hidden');

        const appMain = document.getElementById('app');
        const template = document.getElementById('home-view-template');
        if (!appMain || !template) return;

        // Simple check: If product grid is absent, load the template
        // This ensures we always have the UI structure.
        if (!appMain.querySelector('#product-grid')) {
            appMain.innerHTML = template.innerHTML;
        }

        // SELECT ALL ELEMENTS AFTER INJECTION
        if (typeof window.renderDesktopMegaMenu === 'function') window.renderDesktopMegaMenu();
        const catRow = appMain.querySelector('#category-row');
        const grid = appMain.querySelector('#product-grid');
        const selectionHeader = appMain.querySelector('#selection-header');
        const viewTitle = appMain.querySelector('#view-title');
        const viewSubtitle = appMain.querySelector('#view-subtitle');
        const selectAllBtn = appMain.querySelector('#select-all-btn');
        const activeCatTitle = appMain.querySelector('#active-category-title');
        const activeCatTitleMob = appMain.querySelector('#active-category-title-mob');
        const categorySelector = appMain.querySelector('#category-selector-container');

        // Search elements are now outside appMain in the top layout block
        const discSearch = document.getElementById('customer-search');
        const clearBtn = document.getElementById('clear-search-btn');

        const mobileSort = appMain.querySelector('#price-sort-mob');
        const mSearch = document.getElementById('m-search'); // Mobile sidebar search input

        // NOTE: Event listeners are attached ONCE at init time (see initSearchListeners)
        // Do NOT add listeners here — they would be duplicated on every renderHome() call.

        // 1. Handle selection/wishlist headers
        if (state.selectionId) {
            if (selectionHeader) selectionHeader.classList.remove('hidden');
            if (catRow) catRow.classList.add('hidden');
            if (categorySelector) categorySelector.classList.add('hidden');
            if (viewTitle) viewTitle.innerText = "Shared Selection";
            if (viewSubtitle) viewSubtitle.innerText = "Specially picked items for you.";
        } else {
            if (selectionHeader) selectionHeader.classList.add('hidden');
            if (catRow) catRow.classList.remove('hidden');
            if (categorySelector) categorySelector.classList.remove('hidden');

            let cHtml = ``;
            const isAdminVisible = !document.getElementById('admin-entry-btn').classList.contains('hidden');

            let categories = [...DATA.c].sort((a, b) => {
                const pinA = a.isPinned ? 1 : 0;
                const pinB = b.isPinned ? 1 : 0;
                if (pinA !== pinB) return pinB - pinA;
                if (a.isPinned && b.isPinned) {
                    return (a.pinnedAt || 0) - (b.pinnedAt || 0);
                }
                return 0;
            });

            categories.forEach(c => {
                cHtml += `<div class="category-item ${state.filter === c.id ? 'active' : ''}" onclick="applyFilter('${c.id}', event)">
                    <div class="category-img-box">
                        <img src="${getOptimizedUrl(c.img, 200) || 'https://placehold.co/100x100?text=Gift'}" loading="lazy" decoding="async" ${getOptimizedUrl(c.img, 200) ? "onerror=\"this.src='https://placehold.co/100x100?text=Gift'\"" : ''}>
                        ${c.isPinned && isAdminVisible ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-black text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm"><i class="fa-solid fa-thumbtack text-[6px]"></i></div>' : ''}
                    </div>
                    <p class="category-label truncate px-1 w-full">${c.name}</p>
                </div>`;
            });
            if (catRow) {
                catRow.innerHTML = cHtml;

                // Wait for DOM to settle
                setTimeout(() => {
                    // 1. Auto-scroll active item into view
                    if (state.filter !== 'all') {
                        const activeItem = catRow.querySelector('.category-item.active');
                        if (activeItem) {
                            // Calculate relative offset within the row
                            const scrollOffset = activeItem.offsetLeft - catRow.scrollLeft;
                            // We want it at the start, so we adjust current scroll
                            catRow.scrollTo({ left: catRow.scrollLeft + (activeItem.getBoundingClientRect().left - catRow.getBoundingClientRect().left) - 16, behavior: 'smooth' });
                        }
                    }

                    // 2. Add hint animation on first load if on mobile and scrollable
                    const isScrollable = catRow.scrollWidth > catRow.clientWidth;
                    if (isScrollable && !window.sessionStorage.getItem('cat_hint_done') && window.innerWidth < 768) {
                        setTimeout(() => {
                            catRow.scrollTo({ left: 100, behavior: 'smooth' });
                            setTimeout(() => {
                                catRow.scrollTo({ left: 0, behavior: 'smooth' });
                                window.sessionStorage.setItem('cat_hint_done', 'true');
                            }, 700);
                        }, 1000);
                    }
                }, 100);
            }
        }
        let filtered = [];
        const stockFilter = (items) => items.filter(p => p.inStock !== false);
        if (state.selectionId) filtered = DATA.p.filter(p => state.selected.includes(p.id));
        else if (state.filter !== 'all') {
            const isMain = DATA.c.find(c => c.id === state.filter && !c.parentId);
            let validIds = [state.filter];
            if (isMain) {
                // If main category, include all its sub-categories' products
                const childIds = DATA.c.filter(c => c.parentId === state.filter).map(c => c.id);
                validIds = validIds.concat(childIds);
            }
            filtered = stockFilter(DATA.p.filter(p => validIds.includes(p.catId)));
        }
        else {
            filtered = stockFilter(DATA.p.filter(p => p.isFeatured));
            if (filtered.length === 0) filtered = stockFilter(DATA.p);
        }

        if (state.search) {
            const q = state.search.toLowerCase().trim();
            const words = q.split(' ').filter(w => w.length > 0);

            let source = state.selectionId ? filtered : stockFilter(DATA.p);

            filtered = source.filter(p => {
                const name = (p.name || '').toLowerCase();
                const keywords = (p.keywords || '').toLowerCase();
                const catObj = DATA.c.find(c => c.id === p.catId);
                const catName = catObj ? catObj.name.toLowerCase() : '';

                // Match if ALL search words are found in name OR category OR keywords
                return words.every(word => name.includes(word) || catName.includes(word) || keywords.includes(word));
            });
        }

        // Sort: Pinned items first, then by selected sort
        filtered.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA; // Pinned first

            if (state.sort !== 'all') {
                const priceA = parseFloat(a.price) || 0;
                const priceB = parseFloat(b.price) || 0;
                return state.sort === 'low' ? priceA - priceB : priceB - priceA;
            }
            return (b.updatedAt || 0) - (a.updatedAt || 0); // Default sort: Newest first
        });
        let catNameDisplay = (!state.selectionId && state.filter === 'all' && filtered.length > 0 && filtered.length < stockFilter(DATA.p).length) ? "Our Bestsellers" : "All Collections";
        if (state.selectionId) catNameDisplay = "Shared Selection";
        else if (state.filter !== 'all') {
            const catObj = DATA.c.find(c => c.id === state.filter);
            if (catObj) catNameDisplay = catObj.name;
        }
        if (activeCatTitle) activeCatTitle.innerText = catNameDisplay;
        if (activeCatTitleMob) activeCatTitleMob.innerText = catNameDisplay;

        // Dynamic Page Title for Ads/SEO
        document.title = `${catNameDisplay} | Speed Gifts Website`;
        try {
            updateMetaDescription(`Explore our ${catNameDisplay} collection at Speed Gifts. Premium selection of personalized gifts.`);
            const cId = state.filter !== 'all' ? state.filter : '';
            updateCanonicalURL(cId ? `?c=${cId}` : '');
        } catch (e) { console.error("SEO Update failed:", e); }

        if (selectAllBtn) {
            let uAdmin = null; try { uAdmin = state.authUser || window._fbAuth?.currentUser || (typeof getAuth !== 'undefined' ? getAuth().currentUser : null); } catch (e) { }
            const isAdmin = uAdmin && uAdmin.email === "laszonaicreation@gmail.com";
            const visibleIds = filtered.map(p => p.id);
            const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selected.includes(id));
            selectAllBtn.innerText = allVisibleSelected ? "Deselect Visible" : "Select Visible Items";

            if (state.selectionId || !isAdmin) {
                if (selectAllBtn.parentElement) selectAllBtn.parentElement.style.display = 'none';
            } else {
                if (selectAllBtn.parentElement) selectAllBtn.parentElement.style.display = '';
            }
        }
        if (grid) {
            const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);
            let uAdmin = null; try { uAdmin = state.authUser || window._fbAuth?.currentUser || (typeof getAuth !== 'undefined' ? getAuth().currentUser : null); } catch (e) { }
            const isAdmin = uAdmin && uAdmin.email === "laszonaicreation@gmail.com";

            // Always show complete rows — never leave an orphan product on the last row
            const cols = getColumnsCount();
            // Start with exactly 2 rows. Each load more click adds 2 rows.
            const limit = state.visibleChunks * (cols * 2);
            const visibleProducts = filtered.slice(0, limit);
            const hasMore = filtered.length > limit;

            let gridContent = visibleProducts.map((p, idx) => {
                let displayP = { ...p };
                let savedVar = null;

                const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';

                return `
                <div class="product-card group ${idx < 4 ? '' : 'fade-in'} ${state.selected.includes(p.id) ? 'selected' : ''} ${isInWishlist(p.id) ? 'wish-active' : ''}" data-id="${p.id}" 
                     onmouseenter="window.preloadProductImage('${p.id}')"
                     onclick="viewDetail('${p.id}', false, ${savedVar ? JSON.stringify(savedVar) : 'null'})">
                    <div class="img-container mb-4 shadow-sm relative">
                        ${badgeHtml}
                        <div class="wish-btn shadow-sm hidden-desktop" onclick="toggleWishlist(event, '${p.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
                        ${(!state.selectionId && isAdmin) ? `<div class="select-btn shadow-sm" onclick="toggleSelect(event, '${p.id}')"><i class="fa-solid fa-check text-[10px]"></i></div>` : ''}
                        <img src="${getOptimizedUrl(displayP.img, 600)}" 
                             class="${idx < 4 ? 'no-animation' : ''}"
                             ${idx < 8 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                             decoding="async"
                             onload="this.classList.add('loaded')"
                             onerror="window.handleImgError(this)"
                             alt="${displayP.name}">
                    </div>
                    <div class="px-1 text-left flex justify-between items-start mt-4">
                        <div class="flex-1 min-w-0">
                            <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${displayP.name}</h3>
                            ${(() => {
                        const origPrice = parseFloat(displayP.originalPrice);
                        const salePrice = parseFloat(displayP.price);
                        if (displayP.originalPrice && origPrice > salePrice) {
                            const disc = Math.round((1 - salePrice / origPrice) * 100);
                            return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                                '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + displayP.originalPrice + ' AED</span>' +
                                '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + displayP.price + ' AED</span>' +
                                '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span>' +
                                '</div>';
                        }
                        return '<p class="price-tag mt-2 font-bold">' + displayP.price + ' AED</p>';
                    })()}
                        </div>
                        <div class="wish-btn desktop-wish-fix hidden-mobile" onclick="toggleWishlist(event, '${p.id}')">
                            <i class="fa-solid fa-heart"></i>
                        </div>
                    </div>
                </div>`;
            }).join('');

            // Ghost cards: only add when ALL products are visible (no Load More button)
            // When hasMore=true, the limit rounding already ensures only full rows show.
            // When hasMore=false, pad the last row with sized ghost cards so it looks complete.
            if (visibleProducts.length > 0 && !hasMore) {
                const remainder = visibleProducts.length % cols;
                if (remainder > 0) {
                    const ghosts = cols - remainder;
                    for (let g = 0; g < ghosts; g++) {
                        // Use same aspect ratio as product image so ghost takes up proper height
                        gridContent += `<div style="visibility:hidden;pointer-events:none;" aria-hidden="true"><div style="aspect-ratio:4/5;width:100%;"></div></div>`;
                    }
                }
            }

            if (filtered.length === 0) {
                gridContent = `
                <div class="col-span-full text-center py-40 px-6">
                    <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fa-solid fa-box-open text-gray-200 text-xl"></i>
                    </div>
                    <h3 class="text-gray-900 font-bold text-[14px] mb-2 uppercase tracking-widest">Collection Coming Soon</h3>
                    <p class="text-gray-400 text-[11px] mb-8 max-w-xs mx-auto">We are currently updating this category with premium new products. Explore our other collections in the meantime.</p>
                    <button onclick="window.applyFilter('all')" class="bg-black text-white px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-105 active:scale-95 transition-all">
                        View All Collections
                    </button>
                </div>
                `;
            }
            // Prevent scroll jumping by locking the current height
            const currentHeight = grid.offsetHeight;
            if (currentHeight > 0) {
                grid.style.minHeight = `${currentHeight}px`;
            }

            grid.innerHTML = gridContent;

            // Release height lock after images/DOM have stabilized
            setTimeout(() => {
                grid.style.minHeight = '';
            }, 800);
            // Load More Logic (Outside the grid so it stays centered at the bottom width-wise)
            let loadMoreContainer = document.getElementById('load-more-container');
            if (!loadMoreContainer) {
                loadMoreContainer = document.createElement('div');
                loadMoreContainer.id = 'load-more-container';
                loadMoreContainer.className = 'w-full flex justify-center view-more-container-custom';

                const spotlightContainer = grid.parentElement.querySelector('#spotlight-section');
                if (spotlightContainer) {
                    grid.parentElement.insertBefore(loadMoreContainer, spotlightContainer);
                } else {
                    grid.parentElement.appendChild(loadMoreContainer);
                }
            }

            if (hasMore) {
                loadMoreContainer.innerHTML = `
                    <button onclick="window.loadMoreProducts()" class="bg-black text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group view-more-btn-custom">
                        View More <i class="fa-solid fa-arrow-down transform group-hover:translate-y-1 transition-transform"></i>
                    </button>
                `;
                loadMoreContainer.style.display = 'flex';
            } else if (state.visibleChunks > 1) {
                loadMoreContainer.innerHTML = `
                    <button onclick="window.showLessProducts()" class="bg-black text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group view-more-btn-custom">
                        Show Less <i class="fa-solid fa-arrow-up transform group-hover:-translate-y-1 transition-transform"></i>
                    </button>
                `;
                loadMoreContainer.style.display = 'flex';
            } else {
                loadMoreContainer.style.display = 'none';
            }
        }

        renderSlider();
        renderSpotlightSection();
        initImpressionTracking();

        // 5. Update Search & Sort UI
        if (discSearch && discSearch !== document.activeElement) discSearch.value = state.search;
        if (clearBtn) {
            if (state.search) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }

        const deskSearch = document.getElementById('desk-search');
        if (deskSearch && deskSearch !== document.activeElement) deskSearch.value = state.search;
        const deskClearBtn = document.getElementById('desk-clear-btn');
        if (deskClearBtn) {
            if (state.search) deskClearBtn.classList.remove('hidden');
            else deskClearBtn.classList.add('hidden');
        }

        if (mobileSort) mobileSort.value = state.sort;

        updateSelectionBar();

        // Update Mobile Nav Active State
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
        if (state.search) {
            document.querySelector('.mobile-nav-btn:nth-child(2)')?.classList.add('active');
        } else if (state.filter === 'all' && !state.selectionId && !new URLSearchParams(window.location.search).has('p')) {
            document.querySelector('.mobile-nav-btn:nth-child(1)')?.classList.add('active');
        }

        if (state.isLoadMore || state.skipScroll) {
            state.isLoadMore = false;
            state.skipScroll = false;
        } else {
            if (!state.selectionId && !state.search) window.scrollTo({ top: state.scrollPos });
            else if (!state.search) window.scrollTo({ top: 0 });
        }
    } catch (e) {
        console.error("Render Error:", e);
        showToast("UI Display Error");
    }
}

// NEW: updateSelectionBar logic explicitly added to prevent ReferenceError
window.updateSelectionBar = () => {
    const bar = document.getElementById('selection-bar');
    const count = document.getElementById('selected-count');
    if (!bar) return;
    if (state.selected.length > 0 && !state.selectionId) {
        bar.style.display = 'flex';
        bar.classList.add('animate-selection');
        if (count) count.innerText = `${state.selected.length} items`;
    } else {
        bar.style.display = 'none';
        bar.classList.remove('animate-selection');
    }
};

window.viewDetail = (id, skipHistory = false, preSelect = null, skipTracking = false) => {
    const p = DATA.p.find(x => x.id === id);
    if (!p) return;
    state.currentVar = preSelect; // Initialize with saved variation if any

    // Product interaction tracking (Consolidated to fix triple-counting)
    trackProductView(id);

    if (!skipHistory) {
        const isAlreadyInDetail = new URLSearchParams(window.location.search).has('p');
        state.scrollPos = isAlreadyInDetail ? state.scrollPos : window.scrollY;
        safePushState({ p: id }, isAlreadyInDetail);

        // Dynamic Page Title for Detail View
        document.title = `${p.name} | Speed Gifts Website`;
        try {
            updateMetaDescription(`Buy ${p.name} at Speed Gifts. ${p.desc ? p.desc.substring(0, 150) : 'Premium personalized gift item'}.`);
            updateCanonicalURL(`?p=${p.id}`);
        } catch (e) { console.error("SEO Update failed:", e); }
    }

    // Hide the top header blocks (Search & Slider) since they aren't in #app
    const outerWrapper = document.getElementById('home-top-elements');
    if (outerWrapper) outerWrapper.classList.add('hidden');

    const appMain = document.getElementById('app');
    if (!appMain) return;
    const allImages = [...(p.images || [])];
    [p.img, p.img2, p.img3].forEach(img => {
        if (img && img !== 'img/' && !allImages.includes(img)) allImages.push(img);
    });



    appMain.innerHTML = `
<div class="max-w-5xl mx-auto py-8 md:py-16 px-4 pb-20 detail-view-container text-left">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        <div>
            <div class="zoom-img-container aspect-square rounded-2xl overflow-hidden shadow-sm" onmousemove="handleZoom(event, this)" onmouseleave="resetZoom(this)" onclick="openFullScreen('${allImages[0] || p.img}')">
                <img src="${getOptimizedUrl(allImages[0] || p.img, window.innerWidth < 768 ? 600 : 1200)}" id="main-detail-img" class="w-full h-full object-cover no-animation" fetchpriority="high" loading="eager">
            </div>
            <div class="thumb-grid justify-center lg:justify-start mt-4" id="detail-thumb-grid">
                ${allImages.map((img, i) => `
                    <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                        <img src="${getOptimizedUrl(img, 300)}">
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="flex flex-col h-full justify-between">
            <div class="space-y-6">
                <div>
                    <div class="flex items-center gap-3 mb-2">
                        <h2 class="detail-product-name capitalize !mb-0">${p.name}</h2>
                        ${p.badge ? `<span class="detail-badge badge-${p.badge}">${getBadgeLabel(p.badge)}</span>` : ''}
                    </div>
                    ${(() => {
            const origP = parseFloat(p.originalPrice);
            const saleP = parseFloat(p.price);
            if (p.originalPrice && origP > saleP) {
                const disc = Math.round((1 - saleP / origP) * 100);
                return `<div class="flex items-baseline gap-3 flex-wrap mt-1">
                                <span class="detail-price-text text-xl md:text-2xl">${p.price} AED</span>
                                <span class="text-base line-through text-gray-400 font-normal">${p.originalPrice} AED</span>
                                <span class="text-[11px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-full">${disc}% OFF</span>
                            </div>`;
            }
            return `<p class="detail-price-text text-xl md:text-2xl">${p.price} AED</p>`;
        })()}
                </div>

                <div class="space-y-6 pt-4 border-t border-gray-50">
                    <!-- VARIATION: COLORS FIRST -->
                    ${p.colorVariations && p.colorVariations.length > 0 ? `
                    <div class="variation-section">
                        <span class="detail-label mb-2">Available Colors</span>
                        <div class="flex flex-wrap gap-4">
                            ${p.colorVariations.map((v, i) => `
                                <div class="flex flex-col items-center gap-2 group cursor-pointer" onclick='window.selectColor("${v.price}", "${v.color}", ${JSON.stringify(v.images || v.img)}, this)'>
                                    <div class="color-swatch w-9 h-9 rounded-full border-2 ${i === 0 && (!p.variations || p.variations.length === 0) ? 'border-black scale-110' : 'border-white'} transition-all hover:scale-110" 
                                         style="background-color: ${v.hex || '#000'}">
                                    </div>
                                    <span class="text-[7.5px] font-black uppercase tracking-tighter text-gray-400 group-hover:text-black transition-colors">${v.color}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- VARIATION: SIZES SECOND -->
                    ${p.variations && p.variations.length > 0 ? `
                    <div class="variation-section">
                        <span class="detail-label mb-2">Available Sizes</span>
                        <div class="flex flex-wrap gap-2">
                            ${p.variations.map((v, i) => `
                                <button onclick='window.selectSize("${v.price}", "${v.size}", ${JSON.stringify(v.images || v.img)}, this)' 
                                    class="size-badge px-4 py-3 rounded-xl border ${i === 0 ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-100'} font-bold text-[9px] uppercase tracking-widest transition-all">
                                    ${v.size}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- STATIC SPECS THIRD -->
                    <div class="flex flex-wrap gap-3 pt-2">
                        ${p.size && (!p.variations || p.variations.length === 0) ? `<div class="spec-badge"><i class="fa-solid fa-maximize text-[10px] text-gray-400"></i><span>${p.size}</span></div>` : ''}
                        ${p.material ? `<div class="spec-badge"><i class="fa-solid fa-layer-group text-[10px] text-gray-400"></i><span>${p.material}</span></div>` : ''}
                    </div>
                </div>

                <div class="pt-6 border-t border-gray-50">
                    <span class="detail-label mb-3">Product Story</span>
                    <div class="detail-description-text text-[13px] md:text-[14px] leading-[1.8] text-gray-600 space-y-4 overflow-hidden relative" id="desc-container">
                        ${(() => {
            const desc = p.desc || 'Premium handcrafted selection curated specifically for our collection.';
            const paragraphs = desc.split('\n').filter(line => line.trim());
            const fullHtml = paragraphs.map(p => `<p>${p}</p>`).join('');

            if (desc.length > 280) {
                return `
                                    <div class="desc-content line-clamp-4 transition-all duration-500">${fullHtml}</div>
                                    <button onclick="window.toggleDescription(this)" class="text-[10px] font-black uppercase tracking-widest text-black mt-2 hover:underline">Read More</button>
                                `;
            }
            return fullHtml;
        })()}
                    </div>
                </div>
            </div>

            <div class="flex gap-3 mt-10 lg:mt-auto pt-6">
                <button id="main-inquiry-btn" onclick="inquireOnWhatsApp('${p.id}'${p.variations && p.variations.length > 0 ? `, '${p.variations[0].size}', '${p.variations[0].price}'` : (p.colorVariations && p.colorVariations.length > 0 ? `, null, '${p.colorVariations[0].price}', '${p.colorVariations[0].color}'` : '')})" class="flex-[3] bg-black text-white py-4 rounded-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-95 transition-all">
                    <i class="fa-brands fa-whatsapp text-3xl text-[#25D366]"></i>
                    <div class="flex flex-col items-start leading-tight">
                        <span class="text-[8px] font-bold opacity-60 uppercase tracking-[0.2em]">Enquire Via</span>
                        <span class="text-[13px] font-black uppercase tracking-widest leading-none mt-0.5">WhatsApp</span>
                    </div>
                </button>
                <button id="detail-share-btn" onclick="window.shareProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')" 
                    class="flex-1 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:text-black hover:bg-gray-100 transition-all active:scale-90 border border-gray-100">
                    <i class="fa-solid fa-share-nodes text-xl"></i>
                </button>
                <button id="detail-wish-btn" data-id="${p.id}" onclick="window.toggleWishlist(event, '${p.id}')" 
                    class="flex-1 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-90 border border-gray-100">
                    <i class="${state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === p.id) ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'} text-xl"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- RELATED PRODUCTS -->
    ${(() => {
            const currentCatId = String(p.catId || "");
            const related = DATA.p.filter(item => String(item.catId) === currentCatId && item.id !== p.id && item.inStock !== false).slice(0, 6);
            if (related.length === 0) return '';
            return `
            <div class="mt-20 pt-12 border-t border-gray-50">
                <div class="flex items-center justify-between mb-8 pr-4">
                    <h3 class="recommendations-title mb-0-imp">Recommendations</h3>
                    <div class="lg:hidden flex items-center gap-2 text-gray-300 animate-pulse-slow">
                        <span class="text-[8px] font-black uppercase tracking-widest">Swipe</span>
                        <i class="fa-solid fa-arrow-right-long text-[10px]"></i>
                    </div>
                </div>
                <div class="related-scroll-wrapper no-scrollbar">
                    <div class="related-grid px-1">
                        ${related.map(rp => {
                const rpImg = [rp.img, ...(rp.images || []), rp.img2, rp.img3].find(u => u && u !== 'img/') || 'https://placehold.co/400x500?text=Gift';
                return `
                            <div class="product-card group flex-shrink-0 w-[160px] md:w-[220px]" data-id="${rp.id}" onclick="viewDetail('${rp.id}')">
                                <div class="img-container mb-4 shadow-sm aspect-[4/5] rounded-xl overflow-hidden bg-gray-50 relative">
                                    <img src="${getOptimizedUrl(rpImg, 400)}" 
                                         alt="${rp.name}" 
                                         class="w-full h-full object-cover transition-opacity duration-300 opacity-0"
                                         onload="this.style.opacity='1'"
                                         onerror="this.src='https://placehold.co/400x500?text=Image+Error'">
                                </div>
                                <div class="px-1 text-left">
                                    <h3 class="capitalize truncate leading-none text-gray-900 font-semibold text-[11px] md:text-[13px]">${rp.name}</h3>
                                    <p class="mt-2 font-bold text-[10px] text-gray-400">${rp.price} AED</p>
                                </div>
                            </div>
                        `;
            }).join('')}
                    </div>
                </div>
            </div>
        `;
        })()}
</div>
`;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Handle Pre-selection after render
    if (state.currentVar) {
        const { color, size } = state.currentVar;
        setTimeout(() => {
            if (color) {
                const swatches = document.querySelectorAll('.color-swatch');
                swatches.forEach(s => {
                    const container = s.closest('.cursor-pointer');
                    const label = container?.querySelector('span')?.innerText;
                    if (label && label.trim() === color.trim()) container.click();
                });
            }
            if (size) {
                const badges = document.querySelectorAll('.size-badge');
                badges.forEach(b => {
                    if (b.innerText.trim() === size.trim()) b.click();
                });
            }
        }, 100);
    }
};

window.addColorVariationRow = (colorName = '', price = '', images = [], hex = '#000000') => {
    const container = document.getElementById('color-variation-rows');
    if (!container) return;
    const rowId = 'v-color-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.className = 'color-variation-row bg-white p-4 rounded-xl border border-gray-100 space-y-3 relative fade-in';
    div.innerHTML = `
        <button onclick="this.parentElement.remove()" class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all">
            <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
        <div class="grid grid-cols-2 gap-2">
            <input type="text" class="vc-color admin-input !bg-gray-50" placeholder="Color Name" value="${colorName}">
                <input type="text" class="vc-price admin-input !bg-gray-50" placeholder="Price" value="${price}">
                </div>
                <div class="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                    <span class="text-[9px] font-black uppercase text-gray-400 ml-2">Visual Color:</span>
                    <input type="color" class="vc-hex h-8 w-12 rounded cursor-pointer bg-transparent border-none" value="${hex}">
                        <span class="text-[10px] font-mono text-gray-400">${hex}</span>
                </div>
                <div class="space-y-2">
                    <div id="${rowId}-grid" class="grid grid-cols-4 gap-2 vc-image-grid"></div>
                    <div class="drop-zone flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-gray-100 group hover:border-black transition-all" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleMultiDrop(event, '${rowId}-grid')">
                        <i class="fa-solid fa-images text-gray-200 group-hover:text-black transition-all"></i>
                        <button type="button" onclick="window.cloudinaryMultiUpload('${rowId}-grid')" class="text-[8px] font-black uppercase px-3 py-2 bg-gray-100 rounded-lg hover:bg-black hover:text-white transition-all">Add Photos</button>
                    </div>
                </div>
                `;

    // Update hex text on change
    const picker = div.querySelector('.vc-hex');
    picker.addEventListener('input', (e) => {
        e.target.nextElementSibling.innerText = e.target.value.toUpperCase();
    });

    container.appendChild(div);
    if (images && images.length > 0) {
        images.forEach(img => addImageToGrid(`${rowId}-grid`, img));
    } else if (typeof images === 'string' && images !== 'img/') {
        // Handle legacy single image string
        addImageToGrid(`${rowId}-grid`, images);
    }
};

window.addVariationRow = (size = '', price = '', images = []) => {
    const container = document.getElementById('variation-rows');
    if (!container) return;
    const rowId = 'v-size-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.className = 'variation-row bg-white p-4 rounded-xl border border-gray-100 space-y-3 relative fade-in';
    div.innerHTML = `
                <button onclick="this.parentElement.remove()" class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
                <div class="grid grid-cols-2 gap-2">
                    <input type="text" class="v-size admin-input !bg-gray-50" placeholder="Size" value="${size}">
                        <input type="text" class="v-price admin-input !bg-gray-50" placeholder="Price" value="${price}">
                        </div>
                        <div class="space-y-2">
                            <div id="${rowId}-grid" class="grid grid-cols-4 gap-2 v-image-grid"></div>
                            <div class="drop-zone flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-gray-100 group hover:border-black transition-all" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleMultiDrop(event, '${rowId}-grid')">
                                <i class="fa-solid fa-images text-gray-200 group-hover:text-black transition-all"></i>
                                <button type="button" onclick="window.cloudinaryMultiUpload('${rowId}-grid')" class="text-[8px] font-black uppercase px-3 py-2 bg-gray-100 rounded-lg hover:bg-black hover:text-white transition-all">Add Photos</button>
                            </div>
                        </div>
                        `;
    container.appendChild(div);
    if (images && images.length > 0) {
        images.forEach(img => addImageToGrid(`${rowId}-grid`, img));
    } else if (typeof images === 'string' && images !== 'img/') {
        // Handle legacy single image string
        addImageToGrid(`${rowId}-grid`, images);
    }
};

window.saveProduct = async () => {
    const id = document.getElementById('edit-id')?.value;
    const btn = document.getElementById('p-save-btn');

    // Collect images
    const images = collectImagesFromGrid('p-image-grid');
    const primaryImg = images[0] || 'img/';

    // Collect size variations
    const variationRows = document.querySelectorAll('.variation-row');
    const variations = Array.from(variationRows).map(row => {
        const gridId = row.querySelector('.v-image-grid').id;
        const varImages = collectImagesFromGrid(gridId);
        return {
            size: row.querySelector('.v-size').value,
            price: row.querySelector('.v-price').value,
            images: varImages,
            img: varImages[0] || 'img/' // fallback for existing logic
        };
    }).filter(v => v.size || v.price);

    // Collect color variations
    const colorRows = document.querySelectorAll('.color-variation-row');
    const colorVariations = Array.from(colorRows).map(row => {
        const gridId = row.querySelector('.vc-image-grid').id;
        const varImages = collectImagesFromGrid(gridId);
        return {
            color: row.querySelector('.vc-color').value,
            price: row.querySelector('.vc-price').value,
            images: varImages,
            img: varImages[0] || 'img/', // fallback
            hex: row.querySelector('.vc-hex').value
        };
    }).filter(v => v.color || v.price);

    const data = {
        name: document.getElementById('p-name')?.value || "",
        price: document.getElementById('p-price')?.value || "",
        originalPrice: document.getElementById('p-original-price')?.value || "",
        size: document.getElementById('p-size')?.value || "",
        material: document.getElementById('p-material')?.value || "",
        inStock: document.getElementById('p-stock')?.checked ?? true,
        img: primaryImg || "img/",
        images: images || [],
        catId: document.getElementById('p-cat-id')?.value || "",
        badge: document.getElementById('p-badge')?.value || "",
        isFeatured: document.getElementById('p-featured')?.value === 'true',
        desc: document.getElementById('p-desc')?.value || "",
        keywords: document.getElementById('p-keywords')?.value || "",
        isPinned: document.getElementById('p-pinned')?.checked || false,
        variations: variations || [],
        colorVariations: colorVariations || [],
        updatedAt: Date.now()
    };
    if (!data.name || !data.img) return showToast("Required info missing");
    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try { if (id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id), data); else await addDoc(prodCol, data); showToast("Synced Successfully"); resetForm(); DATA.p = []; refreshData(); }
    catch (e) { console.error("Save Error:", e); showToast("Save Error"); } finally { if (btn) { btn.disabled = false; btn.innerText = "Sync Product"; } }
};

window.saveCategory = async () => {
    const id = document.getElementById('edit-cat-id')?.value;
    const btn = document.getElementById('c-save-btn');
    const data = {
        name: document.getElementById('c-name')?.value,
        img: document.getElementById('c-img')?.value,
        isPinned: document.getElementById('c-pinned')?.checked || false,
        pinnedAt: document.getElementById('c-pinned')?.checked ? (DATA.c.find(c => c.id === id)?.pinnedAt || Date.now()) : null
    };
    if (!data.name) return showToast("Name required");
    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try { if (id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', id), data); else await addDoc(catCol, data); showToast("Category Synced"); resetForm(); DATA.p = []; refreshData(); }
    catch (e) { console.error("Category Error:", e); showToast("Category Error"); } finally { if (btn) { btn.disabled = false; btn.innerText = "Sync Category"; } }
};

window.deleteProduct = async (id) => { if (!confirm("Are you sure?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id)); showToast("Deleted"); refreshData(); } catch (e) { showToast("Delete Error"); } };
window.deleteCategory = async (id) => { if (!confirm("Delete Category?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', id)); showToast("Category Removed"); refreshData(); } catch (e) { showToast("Error"); } };

window.saveMegaMenu = async () => {
    const id = document.getElementById('edit-megamenu-id')?.value;
    const btn = document.getElementById('m-save-btn');

    // Collect checked subcategories
    const checkboxes = document.querySelectorAll('.mega-cat-checkbox:checked');
    const categoryIds = Array.from(checkboxes).map(cb => cb.value);

    const data = {
        name: document.getElementById('m-name')?.value,
        categoryIds: categoryIds,
        order: id ? (DATA.m.find(m => m.id === id)?.order || 0) : Date.now() // simple ordering
    };
    if (!data.name) return showToast("Name required");
    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try {
        if (id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'mega_menus', id), data);
        else await addDoc(megaCol, data);
        showToast("Mega Menu Synced");
        resetForm();
        refreshData();
    }
    catch (e) { console.error("Mega Menu Error:", e); showToast("Mega Menu Error"); }
    finally { if (btn) { btn.disabled = false; btn.innerText = "Save Desktop Menu"; } }
};

window.deleteMegaMenu = async (id) => { if (!confirm("Delete Desktop Menu?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'mega_menus', id)); showToast("Menu Removed"); refreshData(); } catch (e) { showToast("Error"); } };

window.editMegaMenu = (id) => {
    const item = DATA.m.find(x => x.id === id);
    if (!item) return;

    // 1. Switch to megamenu tab FIRST so the DOM gets rendered
    switchAdminTab('megamenu');

    // 2. Now that DOM is ready, fill the form fields
    const editId = document.getElementById('edit-megamenu-id');
    const mName = document.getElementById('m-name');
    const mFormTitle = document.getElementById('m-form-title');
    if (editId) editId.value = item.id;
    if (mName) mName.value = item.name;
    if (mFormTitle) mFormTitle.innerText = 'Editing: ' + item.name;

    // 3. renderAdminMegaMenus rebuilds the checklist - call it to ensure boxes are fresh
    renderAdminMegaMenus();

    // 4. NOW tick the correct boxes (checklist exists in DOM now)
    setTimeout(() => {
        document.querySelectorAll('.mega-cat-checkbox').forEach(cb => {
            cb.checked = Array.isArray(item.categoryIds) && item.categoryIds.includes(cb.value);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
};

window.editProduct = (id) => {
    const item = DATA.p.find(x => x.id === id);
    if (!item) return;
    const editId = document.getElementById('edit-id');
    const pName = document.getElementById('p-name');
    const pPrice = document.getElementById('p-price');
    const pSize = document.getElementById('p-size');
    const pMaterial = document.getElementById('p-material');
    const pStock = document.getElementById('p-stock');
    const pPinned = document.getElementById('p-pinned');
    const pCatId = document.getElementById('p-cat-id');
    const pBadge = document.getElementById('p-badge'); // Added
    const pFeatured = document.getElementById('p-featured');
    const pDesc = document.getElementById('p-desc');
    const pKeywords = document.getElementById('p-keywords');
    const pFormTitle = document.getElementById('p-form-title');

    if (editId) editId.value = item.id;
    if (pName) pName.value = item.name;
    if (pPrice) pPrice.value = item.price;
    if (pSize) pSize.value = item.size || "";
    if (pMaterial) pMaterial.value = item.material || "";
    if (pStock) pStock.checked = item.inStock !== false;
    if (pPinned) pPinned.checked = item.isPinned || false;
    if (pCatId) pCatId.value = item.catId || "";
    if (pBadge) pBadge.value = item.badge || ""; // Added
    if (pFeatured) pFeatured.value = item.isFeatured ? 'true' : 'false';
    const pOriginalPrice = document.getElementById('p-original-price');
    if (pOriginalPrice) pOriginalPrice.value = item.originalPrice || "";

    if (pDesc) pDesc.value = item.desc;
    if (pKeywords) pKeywords.value = item.keywords || "";
    if (pFormTitle) pFormTitle.innerText = "Editing: " + item.name;

    document.getElementById('p-pinned').checked = item.isPinned || false;
    document.getElementById('p-keywords').value = item.keywords || '';

    // Load images
    const pGrid = document.getElementById('p-image-grid');
    if (pGrid) {
        pGrid.innerHTML = '';
        const allImages = [...(item.images || [])];
        // Migration: Add legacy images if not in array
        [item.img, item.img2, item.img3].forEach(img => {
            if (img && img !== 'img/' && !allImages.includes(img)) {
                allImages.push(img);
            }
        });
        allImages.forEach(url => window.addImageToGrid('p-image-grid', url));
    }

    // Load size variations
    const varRows = document.getElementById('variation-rows');
    if (varRows) {
        varRows.innerHTML = '';
        if (item.variations && item.variations.length > 0) {
            item.variations.forEach(v => window.addVariationRow(v.size, v.price, v.images || v.img));
        }
    }

    // Load color variations
    const colorRows = document.getElementById('color-variation-rows');
    if (colorRows) {
        colorRows.innerHTML = '';
        if (item.colorVariations && item.colorVariations.length > 0) {
            item.colorVariations.forEach(v => window.addColorVariationRow(v.color, v.price, v.images || v.img, v.hex || '#000000'));
        }
    }

    switchAdminTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.editCategory = (id) => {
    const item = DATA.c.find(x => x.id === id);
    if (!item) return;
    const editCatId = document.getElementById('edit-cat-id');
    const cName = document.getElementById('c-name');
    const cImg = document.getElementById('c-img');
    const cPinned = document.getElementById('c-pinned');
    const cFormTitle = document.getElementById('c-form-title');

    if (editCatId) editCatId.value = item.id;
    if (cName) cName.value = item.name;
    if (cImg) cImg.value = item.img;
    if (cPinned) cPinned.checked = item.isPinned || false;
    if (cFormTitle) cFormTitle.innerText = "Editing: " + item.name;
    switchAdminTab('categories');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.exportData = () => {
    try {
        const backup = { products: DATA.p, categories: DATA.c, timestamp: Date.now() };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); if (!a) return; a.href = url;
        a.download = `speedgifts_backup_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("Backup Created!");
    } catch (err) { showToast("Export Failed"); }
};

window.exportExcel = () => {
    try {
        if (DATA.p.length === 0) return showToast("No products found");
        const escapeCSV = (val) => { if (val === undefined || val === null) return '""'; let s = String(val).replace(/"/g, '""'); return `"${s}"`; };
        const headers = ["ID", "Name", "Price (AED)", "Category", "Stock Status", "Size", "Material", "Description", "Image 1", "Image 2", "Image 3"];
        const rows = DATA.p.map(p => {
            const catName = DATA.c.find(c => c.id === p.catId)?.name || "Uncategorized";
            const stockStatus = p.inStock !== false ? "In Stock" : "Out of Stock";
            return [p.id, p.name, p.price, catName, stockStatus, p.size || "", p.material || "", p.desc || "", p.img, p.img2 || "", p.img3 || ""].map(escapeCSV).join(",");
        });
        const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); if (!a) return; a.href = url;
        a.download = `speedgifts_inventory_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("Excel Exported!");
    } catch (err) { showToast("Export Failed"); }
};

// NEW: UNIVERSAL MIGRATION LOGIC (FOR FUTURE DB SWITCHING)
window.copyUniversalJSON = () => {
    try {
        const universalBackup = {
            metadata: {
                source: "Speed Gifts Boutique UI",
                version: "2.6.0",
                exportDate: new Date().toISOString(),
                schema: {
                    products: ["id", "name", "price", "catId", "stockStatus", "size", "material", "description", "images"]
                }
            },
            categories: DATA.c.map(c => ({ id: c.id, name: c.name, iconUrl: c.img })),
            products: DATA.p.map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                catId: p.catId,
                stockStatus: p.inStock !== false ? "instock" : "outofstock",
                specs: { size: p.size || "", material: p.material || "" },
                description: p.desc || "",
                images: p.images || [p.img, p.img2, p.img3].filter(u => u && u !== 'img/'),
                variations: p.variations || [],
                colorVariations: p.colorVariations || []
            }))
        };

        const jsonStr = JSON.stringify(universalBackup, null, 2);
        const textArea = document.createElement("textarea");
        if (!textArea) return;
        textArea.value = jsonStr;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast("Universal Migration JSON Copied!");
    } catch (err) { showToast("Migration Prep Failed"); }
};

window.importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm("This will add items from backup to current project. Continue?")) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            showToast("Restoring... Please Wait");

            // 1. Map old IDs to Names from the backup file
            const catOldIdToName = {};
            if (data.categories) {
                data.categories.forEach(c => { if (c.id) catOldIdToName[c.id] = (c.name || "").trim(); });
            }

            // 2. Handle/Create Categories & Build Name to New ID Map
            if (data.categories) {
                for (const cat of data.categories) {
                    const trimmedName = (cat.name || "").trim();
                    const exists = DATA.c.find(c => c.name.trim() === trimmedName);
                    if (!exists) {
                        const cleanCat = { name: trimmedName, img: cat.img || cat.iconUrl || "img/" };
                        const newDoc = await addDoc(catCol, cleanCat);
                        // Add to a temp list so we can map right away
                        DATA.c.push({ id: newDoc.id, ...cleanCat });
                    }
                }
            }

            // Build the final mapping: Trimmed Name -> Current/New ID
            const nameToNewId = {};
            DATA.c.forEach(c => { nameToNewId[c.name.trim()] = c.id; });

            // 3. Handle Products
            if (data.products) {
                for (const p of data.products) {
                    // Find the NEW Category ID
                    let finalCatId = "";
                    const oldCatName = catOldIdToName[p.catId];
                    if (oldCatName && nameToNewId[oldCatName]) {
                        finalCatId = nameToNewId[oldCatName];
                    } else if (p.catId && nameToNewId[p.catId]) {
                        // Fallback if catId in backup was already a name or matches exactly
                        finalCatId = nameToNewId[p.catId];
                    }

                    const pImg = (p.images && p.images[0]) || p.img || "img/";

                    // Refined Duplicate Check (Name + Category + Primary Image)
                    const isDuplicate = DATA.p.some(ep =>
                        ep.name === p.name &&
                        ep.catId === finalCatId &&
                        (ep.img === pImg)
                    );
                    if (isDuplicate) continue;

                    const cleanProd = {
                        name: p.name || "",
                        price: p.price || "",
                        catId: finalCatId,
                        badge: p.badge || "", // Added badge
                        desc: p.desc || p.description || "",
                        size: (p.specs ? p.specs.size : (p.size || "")),
                        material: (p.specs ? p.specs.material : (p.material || "")),
                        inStock: p.inStock !== undefined ? p.inStock : (p.stockStatus !== "outofstock"),
                        isPinned: p.isPinned || false,
                        keywords: p.keywords || "",
                        updatedAt: p.updatedAt || Date.now(),
                        // New fields
                        images: p.images || [],
                        variations: p.variations || [],
                        colorVariations: p.colorVariations || []
                    };

                    // Legacy image mapping for backward compatibility
                    if (p.images && Array.isArray(p.images)) {
                        cleanProd.img = p.images[0] || "img/";
                        cleanProd.img2 = p.images[1] || "img/";
                        cleanProd.img3 = p.images[2] || "img/";
                    } else if (p.img) {
                        cleanProd.img = p.img || "img/";
                        cleanProd.img2 = p.img2 || "img/";
                        cleanProd.img3 = p.img3 || "img/";
                        // Auto-migrate to images array if missing
                        if (!cleanProd.images || cleanProd.images.length === 0) {
                            cleanProd.images = [p.img, p.img2, p.img3].filter(u => u && u !== 'img/');
                        }
                    }

                    await addDoc(prodCol, cleanProd);
                }
            }
            showToast("Restore Successful!");
            refreshData();
        } catch (err) {
            console.error(err);
            showToast("Import Failed");
        }
    };
    reader.readAsText(file);
};

window.toggleSelect = (e, id) => {
    e.stopPropagation();
    const card = e.target.closest('.product-card');
    if (state.selected.includes(id)) {
        state.selected = state.selected.filter(x => x !== id);
        if (card) card.classList.remove('selected');
    } else {
        state.selected.push(id);
        if (card) card.classList.add('selected');
    }
    updateSelectionBar();
};

window.clearSelection = () => { state.selected = []; state.selectionId = null; state.skipScroll = true; renderHome(); };

window.shareSelection = async () => {
    if (state.selected.length === 0) return;
    showToast("Generating link...");
    try {
        const docRef = await addDoc(shareCol, { ids: state.selected, createdAt: Date.now() });
        const shareUrl = `${window.location.origin}${window.location.pathname}?s=${docRef.id}`;
        const textArea = document.createElement("textarea");
        if (!textArea) return;
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast("Secret Link Copied!");
    }
    catch (e) { showToast("Sharing failed."); }
};

window.sendBulkInquiry = () => {
    // Determine which list to use (Selected items for sharing OR Wishlist for sidebar)
    const isSidebarOpen = document.getElementById('favorites-sidebar')?.classList.contains('open');
    const sourceData = isSidebarOpen ? state.wishlist : state.selected;

    if (sourceData.length === 0) return showToast("No items to inquire");

    let msg = `*Hello Speed Gifts!*\nI am interested in these items from my ${isSidebarOpen ? 'Favorites' : 'Selection'}:\n\n`;

    sourceData.forEach((entry, i) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const p = DATA.p.find(x => x.id === id);
        if (!p) return;

        let details = "";
        const price = (entry.var && entry.var.price) ? entry.var.price : p.price;
        if (entry.var) {
            if (entry.var.size) details += ` (Size: ${entry.var.size})`;
            if (entry.var.color) details += ` (Color: ${entry.var.color})`;
        }

        const pUrl = `${window.location.origin}${window.location.pathname}?p=${id}`;
        msg += `${i + 1}. *${p.name}* - ${price} AED${details}\nLink: ${pUrl}\n\n`;
    });

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    const productIdsToTrack = sourceData.map(entry => typeof entry === 'string' ? entry : entry.id);
    window.trackWhatsAppInquiry(productIdsToTrack);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.inquireOnWhatsApp = (id, selectedSize = null, selectedPrice = null, selectedColor = null) => {
    const p = DATA.p.find(x => x.id === id);
    if (!p) return;
    const pUrl = `${window.location.origin}${window.location.pathname}?p=${p.id}`;
    const price = selectedPrice || p.price;
    let details = "";
    if (selectedSize) details += `\n*Size:* ${selectedSize}`;
    if (selectedColor) details += `\n*Color:* ${selectedColor}`;
    if (!selectedSize && !selectedColor && p.size) details += `\n*Size:* ${p.size}`;

    let msg = `*Inquiry regarding:* ${p.name}\n*Price:* ${price} AED${details}\n\n*Product Link:* ${pUrl}\n\nPlease let me know the availability.`;

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    window.trackWhatsAppInquiry(p.id);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.handleFloatingWhatsAppClick = () => {
    let msg = `*Hello Speed Gifts!* \nI visited your website and would like to know more about your premium gift collections.`;

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    // Tracking the inquiry specifically from the floating button
    window.trackWhatsAppInquiry('floating_button');
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.switchImg = (src, el) => {
    const main = document.getElementById('main-detail-img');
    if (main) {
        main.src = getOptimizedUrl(src, 1200);
        // Update click handler for full-screen preview
        main.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${src}')`);
    }
    document.querySelectorAll('.thumb-box').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
};

window.handleZoom = (e, container) => {
    // Only zoom if it's a mouse event and not a touch simulation that triggers click
    const img = container?.querySelector('img');
    if (!img) return;
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    img.style.transformOrigin = `${x}% ${y}%`;
    img.style.transform = 'scale(2)';
};

window.resetZoom = (container) => {
    const img = container?.querySelector('img');
    if (!img) return;
    img.style.transform = 'scale(1)';
    img.style.transformOrigin = `center center`;
};

window.openFullScreen = (src) => {
    const overlay = document.getElementById('img-full-preview');
    const fullImg = document.getElementById('full-preview-img');
    if (overlay && fullImg) {
        fullImg.src = src;
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
};

window.toggleDescription = (btn) => {
    const content = btn.parentElement.querySelector('.desc-content');
    if (content.classList.contains('line-clamp-4')) {
        content.classList.remove('line-clamp-4');
        btn.innerText = "Read Less";
    } else {
        content.classList.add('line-clamp-4');
        btn.innerText = "Read More";
        // Optional: scroll back to top of container if it was long
        btn.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.closeFullScreen = () => {
    const overlay = document.getElementById('img-full-preview');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

window.renderAdminUI = () => {
    const pList = document.getElementById('admin-product-list');
    const cList = document.getElementById('admin-category-list');
    const iList = document.getElementById('admin-insights-list');
    if (!pList || !cList || !iList) return;

    if (state.adminTab === 'insights') {
        renderInsights(iList);
        return;
    }
    if (state.adminTab === 'leads') {
        renderAdminLeads();
        return;
    }
    const filterEl = document.getElementById('admin-cat-filter');
    const catFilter = filterEl ? filterEl.value : "all";

    let products = DATA.p.filter(p => {
        const matchesCat = catFilter === 'all' || p.catId === catFilter;
        return matchesCat;
    });

    const grouped = {};
    products.forEach(p => {
        const catName = DATA.c.find(c => c.id === p.catId)?.name || "Uncategorized";
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(p);
    });

    let pHtml = "";
    Object.keys(grouped).sort().forEach(cat => {
        pHtml += `<div class="col-span-full mt-10 mb-4 flex items-center gap-4">
    <h5 class="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 shrink-0">${cat}</h5>
    <div class="h-[1px] bg-gray-100 flex-1"></div>
    <span class="text-[9px] font-bold text-gray-300 uppercase shrink-0">${grouped[cat].length} Items</span>
</div>`;

        grouped[cat].forEach(p => {
            const stockTag = p.inStock !== false ? '<span class="stock-badge in">In Stock</span>' : '<span class="stock-badge out">Out of Stock</span>';
            const pinIcon = p.isPinned ? '<div class="absolute top-3 left-3 w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg z-20"><i class="fa-solid fa-thumbtack text-[10px]"></i></div>' : '';
            const badgeHtml = p.badge ? `<div class="absolute top-3 left-10 px-3 py-1 bg-black text-white text-[8px] font-black uppercase rounded-full shadow-lg z-10">${getBadgeLabel(p.badge)}</div>` : '';
            const viewCount = (p.views || 0) + (p.adViews || 0);

            pHtml += `
                        <div class="admin-product-card group">
                            <div class="admin-product-img-box">
                                <img src="${getOptimizedUrl(p.img, 400)}" alt="${p.name}">
                                ${pinIcon}
                                ${badgeHtml}
                                <div class="absolute bottom-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-[8px] font-bold text-gray-500 shadow-sm flex items-center gap-1">
                                    <i class="fa-solid fa-eye text-[9px]"></i> ${viewCount}
                                </div>
                                <div class="admin-card-actions">
                                    <button onclick="editProduct('${p.id}')" class="admin-action-btn" title="Edit Item">
                                        <i class="fa-solid fa-pen-to-square text-[11px]"></i>
                                    </button>
                                    <button onclick="deleteProduct('${p.id}')" class="admin-action-btn delete" title="Delete Item">
                                        <i class="fa-solid fa-trash text-[11px]"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="admin-product-info">
                                <h4 class="font-bold text-[13px] capitalize truncate text-gray-800">${p.name}</h4>
                                <div class="flex items-center justify-between mt-1">
                                    <p class="text-[10px] text-gray-500 font-black tracking-widest uppercase">${p.price} AED</p>
                                    ${stockTag}
                                </div>
                            </div>
                        </div>
                        `;
        });
    });

    pList.innerHTML = pHtml || `<div class="col-span-full py-40 text-center"><p class="text-[12px] text-gray-300 font-bold uppercase tracking-widest italic">No items found.</p></div>`;

    cList.innerHTML = DATA.c.map(c => `
                        <div class="flex items-center gap-5 p-5 bg-gray-50 rounded-[2rem] border border-gray-100 relative">
                            <div class="relative shrink-0">
                                <img src="${getOptimizedUrl(c.img, 100) || 'https://placehold.co/100x100?text=Icon'}" class="w-14 h-14 rounded-full object-cover border-4 border-white shadow-sm" ${getOptimizedUrl(c.img, 100) ? "onerror=\"this.src='https://placehold.co/100x100?text=Icon'\"" : ''}>
                                    ${c.isPinned ? '<div class="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center border-2 border-white shadow-lg"><i class="fa-solid fa-thumbtack text-[8px]"></i></div>' : ''}
                            </div>
                            <div class="flex-1 font-bold text-[13px] uppercase">${c.name}</div>
                            <div class="flex gap-2">
                                <button onclick="editCategory('${c.id}')" class="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-lg text-gray-400 hover:text-black transition-all">
                                    <i class="fa-solid fa-pen text-[10px]"></i>
                                </button>
                                <button onclick="deleteCategory('${c.id}')" class="w-10 h-10 flex items-center justify-center bg-red-50 rounded-full text-red-200 hover:text-red-500 transition-all">
                                    <i class="fa-solid fa-trash text-[10px]"></i>
                                </button>
                            </div>
                        </div>
                        `).join('') || `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Categories</p>`;
};

window.handleCategoryRowScroll = (el) => {
    const container = el.parentElement;
    if (!container) return;
    const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
    if (isAtEnd) container.classList.add('scrolled-end');
    else container.classList.remove('scrolled-end');

    // Update progress bar
    const bar = document.getElementById('cat-scroll-bar');
    if (bar && el.scrollWidth > el.clientWidth) {
        const scrollRatio = el.scrollLeft / (el.scrollWidth - el.clientWidth);
        // Bar goes from 20% (at start) to 100% (at end)
        const barWidth = 20 + scrollRatio * 80;
        bar.style.width = barWidth + '%';
    }
};

window.applyFilter = (id, e) => {
    if (e) e.stopPropagation();
    state.filter = id;
    state.search = '';
    state.scrollPos = 0;

    // Only push state if not already in that filter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('c') !== id) {
        safePushState({ c: id === 'all' ? null : id, q: null, p: null });
    }

    renderHome();
};
window.showSearchSuggestions = (show) => {
    // Both desktop and mobile search tags are scoped by IDs globally now
    // the desktop search tags might have a different ID, but mobile is 'search-tags'
    const tags = document.getElementById('search-tags');
    if (tags) {
        if (show) tags.classList.remove('hidden');
        else setTimeout(() => {
            const currentTags = document.getElementById('search-tags');
            if (currentTags) currentTags.classList.add('hidden');
        }, 200);
    }
};
let searchTimeout;
window.applyCustomerSearch = (val) => {
    state.search = val;
    if (val && !state.selectionId) {
        state.filter = 'all';
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        // Push state for search (replace if same type to avoid polluting history with every letter)
        const urlParams = new URLSearchParams(window.location.search);
        const currentQ = urlParams.get('q') || '';
        if (val !== currentQ) {
            // Use replaceState if we are just refining a search, pushState for a new search
            const isRefining = currentQ && val.startsWith(currentQ);
            safePushState({ q: val || null, c: 'all', p: null }, isRefining);
        }
        // Use lightweight search-only render (skips category row, mega menu, slider)
        renderSearchResults();
    }, 500); // 500ms debounce — good balance of speed vs. unnecessary renders

    // Update Clear Button UI immediately with safety
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
        if (val) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    const deskClearBtn = document.getElementById('desk-clear-btn');
    if (deskClearBtn) {
        if (val) deskClearBtn.classList.remove('hidden');
        else deskClearBtn.classList.add('hidden');
    }
};
window.clearCustomerSearch = () => {
    state.search = '';
    exitSearchMode();
    const input = document.getElementById('customer-search');
    const deskInput = document.getElementById('desk-search');
    if (input) { input.value = ''; input.blur(); }
    if (deskInput) deskInput.value = '';
    // Clear the clear buttons
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const deskClearBtn = document.getElementById('desk-clear-btn');
    if (deskClearBtn) deskClearBtn.classList.add('hidden');
    // Clear URL search param
    safePushState({ q: null, c: null, p: null });
    renderHome();
};
window.applyPriceSort = (sort) => { state.sort = sort; renderHome(); };
window.showAdminPanel = () => {
    const u = state.authUser || window._fbAuth?.currentUser || getAuth().currentUser;

    // Auto-retry once to give Firebase time to log in
    if (!u && !window._adminAuthAttempted) {
        window._adminAuthAttempted = true;
        showToast("Verifying Admin Access...");
        setTimeout(() => window.showAdminPanel(), 1500);
        return;
    }

    // Strict block
    if (!u || u.email !== "laszonaicreation@gmail.com") {
        alert("ACCESS DENIED: You are not authorized to view the control panel.");
        window.hideAdminPanel();
        const url = new URL(window.location);
        url.searchParams.delete('admin');
        window.history.replaceState({}, '', url);
        return;
    }

    if (window.innerWidth < 1024) {
        alert("The Admin Panel is only accessible on Desktop devices. Please switch to a computer.");
        return;
    }
    document.getElementById('admin-panel').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // URL Persistence
    const url = new URL(window.location);
    url.searchParams.set('admin', 'true');
    if (state.adminTab) url.searchParams.set('atab', state.adminTab);
    window.history.replaceState({}, '', url);

    // Preset Popup Settings
    if (DATA.popupSettings) {
        if (document.getElementById('popup-title')) document.getElementById('popup-title').value = DATA.popupSettings.title || "";
        if (document.getElementById('popup-msg')) document.getElementById('popup-msg').value = DATA.popupSettings.msg || "";
        if (document.getElementById('popup-img')) document.getElementById('popup-img').value = DATA.popupSettings.img || "img/";

        // Success Message Fields
        if (document.getElementById('popup-success-title'))
            document.getElementById('popup-success-title').value = DATA.popupSettings.successTitle || "";
        if (document.getElementById('popup-success-msg'))
            document.getElementById('popup-success-msg').value = DATA.popupSettings.successMsg || "";
    }

    if (typeof populateLandingProductSelects === 'function') populateLandingProductSelects();
    populateLandingSettingsUI();

    renderAdminUI();
};
window.hideAdminPanel = () => {
    document.getElementById('admin-panel').classList.add('hidden');
    document.body.style.overflow = 'auto';

    // URL Persistence: Clear admin params
    const url = new URL(window.location);
    url.searchParams.delete('admin');
    url.searchParams.delete('atab');
    window.history.replaceState({}, '', url);
};

window.switchAdminTab = (tab) => {
    state.adminTab = tab;

    // URL Persistence: Update active tab
    const url = new URL(window.location);
    if (document.getElementById('admin-panel').classList.contains('hidden') === false) {
        url.searchParams.set('atab', tab);
        window.history.replaceState({}, '', url);
    }
    const isProd = tab === 'products';
    const isCat = tab === 'categories';
    const isMega = tab === 'megamenu';
    const isSlider = tab === 'sliders';
    const isInsight = tab === 'insights';
    const isAnnounce = tab === 'announcements';
    const isLeads = tab === 'leads';
    const isLanding = tab === 'landing';
    const isHomepage = tab === 'homepage';

    document.getElementById('admin-product-section').classList.toggle('hidden', !isProd);
    document.getElementById('admin-migration-section')?.classList.toggle('hidden', !isProd);
    document.getElementById('admin-category-section').classList.toggle('hidden', !isCat);
    document.getElementById('admin-megamenu-section')?.classList.toggle('hidden', !isMega);
    document.getElementById('admin-slider-section').classList.toggle('hidden', !isSlider);
    document.getElementById('admin-landing-section').classList.toggle('hidden', !isLanding);
    document.getElementById('admin-homepage-section')?.classList.toggle('hidden', !isHomepage);
    document.getElementById('admin-insights-section').classList.toggle('hidden', !isInsight);
    document.getElementById('admin-announcements-section').classList.toggle('hidden', !isAnnounce);
    document.getElementById('admin-leads-section').classList.toggle('hidden', !isLeads);

    // Populate homepage admin UI when switching to it
    if (isHomepage) populateHomeAdminUI();

    // Center Insights View Full Width
    document.getElementById('admin-form-container').classList.toggle('hidden', isInsight);
    const rightCol = document.getElementById('admin-right-column');
    if (isInsight) {
        rightCol.className = "transition-all duration-500";
        rightCol.style.gridColumn = "1 / -1";
        rightCol.style.maxWidth = "1000px";
        rightCol.style.margin = "0 auto";
        rightCol.style.width = "100%";
    } else {
        rightCol.className = "lg:col-span-7 transition-all duration-500";
        rightCol.style.gridColumn = "";
        rightCol.style.maxWidth = "";
        rightCol.style.margin = "";
        rightCol.style.width = "";
    }

    document.getElementById('admin-product-list-container').classList.toggle('hidden', !isProd);
    document.getElementById('admin-category-list').classList.toggle('hidden', !isCat);
    document.getElementById('admin-megamenu-list')?.classList.toggle('hidden', !isMega);
    document.getElementById('admin-slider-list').classList.toggle('hidden', !isSlider);
    document.getElementById('admin-announcements-list').classList.toggle('hidden', !isAnnounce);
    document.getElementById('admin-insights-list').classList.toggle('hidden', !isInsight);
    document.getElementById('admin-leads-list').classList.toggle('hidden', !isLeads);

    document.getElementById('product-admin-filters').classList.toggle('hidden', !isProd);

    const activeClass = "flex-1 min-w-[100px] py-4 rounded-xl text-[10px] font-bold uppercase transition-all bg-white shadow-xl";
    const inactiveClass = "flex-1 min-w-[100px] py-4 rounded-xl text-[10px] font-bold uppercase text-gray-400 transition-all hover:bg-white/50";

    document.getElementById('tab-p').className = isProd ? activeClass : inactiveClass;
    document.getElementById('tab-c').className = isCat ? activeClass : inactiveClass;
    const tabM = document.getElementById('tab-m');
    if (tabM) tabM.className = isMega ? activeClass : inactiveClass;
    document.getElementById('tab-s').className = isSlider ? activeClass : inactiveClass;
    document.getElementById('tab-a').className = isAnnounce ? activeClass : inactiveClass;
    document.getElementById('tab-i').className = isInsight ? activeClass : inactiveClass;
    document.getElementById('tab-landing').className = isLanding ? activeClass : inactiveClass;
    document.getElementById('tab-l').className = isLeads ? activeClass : inactiveClass;
    const tabHp = document.getElementById('tab-hp');
    if (tabHp) tabHp.className = isHomepage ? activeClass : inactiveClass;

    document.getElementById('list-title').innerText = isProd ? "Live Inventory" : (isCat ? "Existing Categories" : (isMega ? "Desktop Menus" : (isSlider ? "Management Sliders" : (isAnnounce ? "Manage Notices" : (isLeads ? "Gift Claim Leads" : (isLanding ? "Landing Page Settings" : (isHomepage ? "Home Page Settings" : "")))))));
    renderAdminUI();
};

/* CATEGORY PICKER LOGIC */

function populateCatSelect() {
    const selects = [document.getElementById('p-cat-id'), document.getElementById('landing-sec1-cat'), document.getElementById('landing-sec2-cat'), document.getElementById('spotlight-cat-id')];

    const optionsHtml = `<option value="">Select Category</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    selects.forEach(select => {
        if (select) select.innerHTML = optionsHtml;
    });
}

function populateAdminCatFilter() {
    const select = document.getElementById('admin-cat-filter');
    if (select) select.innerHTML = `<option value="all">All Categories</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

window.resetForm = () => {
    // Basic fields
    const fields = ['edit-id', 'p-name', 'p-price', 'p-size', 'p-material', 'p-desc', 'p-keywords', 'c-name', 'p-badge', 'edit-slider-id', 's-img', 's-mobileImg', 's-title', 's-link', 's-order', 'm-name']; // Added 'p-badge' and 'm-name'
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = "";
    });

    // Reset checkboxes
    const checkboxes = ['p-stock', 'p-pinned', 'c-pinned'];
    checkboxes.forEach(c => {
        const el = document.getElementById(c);
        if (el) el.checked = (c === 'p-stock'); // Default stock to true, others false
    });

    // Reset titles
    const pTitle = document.getElementById('p-form-title');
    if (pTitle) pTitle.innerText = "Product Details";
    const cTitle = document.getElementById('c-form-title');
    if (cTitle) cTitle.innerText = "New Category";
    const sTitle = document.getElementById('s-form-title');
    if (sTitle) sTitle.innerText = "New Slider Image";
    const sImgField = document.getElementById('s-img');
    if (sImgField) sImgField.value = "img/";
    const sMobileImgField = document.getElementById('s-mobileImg');
    if (sMobileImgField) sMobileImgField.value = "img/";

    // Clear dynamic grids
    const grids = ['variation-rows', 'color-variation-rows', 'p-image-grid'];
    grids.forEach(g => {
        const el = document.getElementById(g);
        if (el) el.innerHTML = '';
    });

    // Reset selects
    const catSelect = document.getElementById('p-cat-id');
    if (catSelect) catSelect.value = "";
    const filter = document.getElementById('admin-cat-filter');
    if (filter) filter.value = "all";
};

// MULTI-IMAGE HELPERS
window.addImageToGrid = (containerId, url) => {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    const div = document.createElement('div');
    div.className = 'relative aspect-square border-2 border-gray-100 rounded-xl overflow-hidden group hover:border-black transition-all bg-white';
    div.innerHTML = `
                        <img src="${getOptimizedUrl(url, 300)}" class="w-full h-full object-cover">
                            <input type="hidden" class="grid-img-url" value="${url}">
                                <button type="button" onclick="this.parentElement.remove()" class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-all">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                                `;
    grid.appendChild(div);
};

window.handleMultiDrop = async (e, containerId) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;

    showToast(`Uploading ${files.length} images...`);
    for (const file of files) {
        try {
            const url = await directCloudinaryUpload(file);
            addImageToGrid(containerId, url);
        } catch (err) {
            showToast("One or more uploads failed.");
        }
    }
    showToast("Upload Complete!");
};

window.cloudinaryMultiUpload = (containerId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        showToast(`Uploading ${files.length} images...`);
        for (const file of files) {
            try {
                const url = await directCloudinaryUpload(file);
                addImageToGrid(containerId, url);
            } catch (err) {
                showToast("One or more uploads failed.");
            }
        }
        showToast("Upload Complete!");
    };
    input.click();
};

function collectImagesFromGrid(containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('.grid-img-url')).map(input => input.value);
}

// Ensure handleDragOver/Leave are accessible
window.handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-black', 'bg-gray-50');
};
window.handleDragLeave = (e) => {
    e.currentTarget.classList.remove('border-black', 'bg-gray-50');
};

window.handleDrop = async (e, fieldId) => {
    e.preventDefault();
    const zone = e.currentTarget;
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return showToast("Please drop an image file.");

    zone.classList.add('uploading');
    try {
        const url = await directCloudinaryUpload(file);
        document.getElementById(fieldId).value = url;
        showToast("Image Uploaded!");
    } catch (err) {
        showToast("Upload Failed.");
    } finally {
        zone.classList.remove('uploading');
    }
};

window.handleVariationDrop = async (e, zone) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return showToast("Please drop an image file.");

    zone.classList.add('uploading');
    try {
        const url = await directCloudinaryUpload(file);
        const input = zone.querySelector('.v-img, .vc-img');
        if (input) input.value = url;
        showToast("Image Uploaded!");
    } catch (err) {
        showToast("Upload Failed.");
    } finally {
        zone.classList.remove('uploading');
    }
};

async function directCloudinaryUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'speed_preset');
    formData.append('cloud_name', 'dxkcvm2yh');

    const res = await fetch(`https://api.cloudinary.com/v1_1/dxkcvm2yh/image/upload`, {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    throw new Error("Upload failed");
}

let cloudinaryWidget = null;
let cloudinaryTarget = null; // Can be ID string or input element

window.cloudinaryUpload = (target) => {
    cloudinaryTarget = target;
    if (cloudinaryWidget) {
        cloudinaryWidget.open();
        return;
    }
    cloudinaryWidget = cloudinary.createUploadWidget({
        cloudName: 'dxkcvm2yh',
        apiKey: '749457642941763',
        uploadPreset: 'speed_preset',
        sources: ['local', 'url', 'camera'],
        multiple: false,
        styles: {
            palette: { window: '#FFFFFF', windowBorder: '#90A0B3', tabIcon: '#000000', menuIcons: '#5A616A', textDark: '#000000', textLight: '#FFFFFF', link: '#000000', action: '#111111', inactiveTabIcon: '#0E2F5A', error: '#F44235', inProgress: '#0078FF', complete: '#20B832', sourceBg: '#E4EBF1' }
        }
    }, (error, result) => {
        if (!error && result && result.event === "success") {
            if (typeof cloudinaryTarget === 'string') {
                const el = document.getElementById(cloudinaryTarget);
                if (el) el.value = result.info.secure_url;
            } else if (cloudinaryTarget instanceof HTMLElement) {
                cloudinaryTarget.value = result.info.secure_url;
            }
            showToast("Image Uploaded!");
        }
    });
    cloudinaryWidget.open();
};

window.cloudinaryUploadForVariation = (btn) => {
    window.cloudinaryUpload(btn.parentElement.querySelector('.v-img, .vc-img'));
};

window.selectSize = (price, size, imgs, el) => {
    // Update price
    const priceDisplay = document.querySelector('.detail-price-text');
    if (priceDisplay) priceDisplay.innerText = `${price} AED`;

    // Handle images
    const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
    if (images.length > 0) {
        const mainImg = document.getElementById('main-detail-img');
        if (mainImg) {
            mainImg.src = getOptimizedUrl(images[0], 1200);
            mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
        }

        // Update thumbnail grid
        const thumbGrid = document.getElementById('detail-thumb-grid');
        if (thumbGrid) {
            thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
        }
    }

    // Highlight selected size badge
    document.querySelectorAll('.size-badge').forEach(b => {
        b.classList.remove('bg-black', 'text-white', 'border-black');
        b.classList.add('bg-white', 'text-black', 'border-gray-200');
    });
    el.classList.remove('bg-white', 'text-black', 'border-gray-200');
    el.classList.add('bg-black', 'text-white', 'border-black');

    // Update state for wishlist
    state.currentVar = { size, price, img: images[0] };

    // Update WhatsApp inquiry button state
    updateInquiryButton(size, price, null);

    // Auto-scroll on mobile
    if (window.innerWidth < 768) {
        const container = document.querySelector('.detail-view-container');
        if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
    }
};

window.selectColor = (price, color, imgs, el) => {
    // Update price
    const priceDisplay = document.querySelector('.detail-price-text');
    if (priceDisplay) priceDisplay.innerText = `${price} AED`;

    // Handle images
    const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
    if (images.length > 0) {
        const mainImg = document.getElementById('main-detail-img');
        if (mainImg) {
            mainImg.src = getOptimizedUrl(images[0], 1200);
            mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
        }

        // Update thumbnail grid
        const thumbGrid = document.getElementById('detail-thumb-grid');
        if (thumbGrid) {
            thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
        }
    }

    // Highlight selected color swatch
    document.querySelectorAll('.color-swatch').forEach(b => {
        b.classList.remove('border-black', 'scale-110');
        b.classList.add('border-white');
    });

    const swatch = el.querySelector('.color-swatch');
    if (swatch) {
        swatch.classList.remove('border-white');
        swatch.classList.add('border-black', 'scale-110');
    }

    // Update state for wishlist
    state.currentVar = { color, price, img: images[0] };

    // Update WhatsApp inquiry button state
    updateInquiryButton(null, price, color);

    // Auto-scroll on mobile
    if (window.innerWidth < 768) {
        const container = document.querySelector('.detail-view-container');
        if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
    }
};

function updateInquiryButton(selectedSize, selectedPrice, selectedColor) {
    const inquiryBtn = document.getElementById('main-inquiry-btn');
    if (!inquiryBtn) return;

    // Extract existing values if not provided
    const match = inquiryBtn.getAttribute('onclick').match(/inquireOnWhatsApp\('([^']+)'(?:, '([^']*)')?(?:, '([^']*)')?(?:, '([^']*)')?\)/);
    if (!match) return;

    const id = match[1];
    const currentSize = selectedSize !== null ? selectedSize : (match[2] !== 'null' ? match[2] : null);
    const currentPrice = selectedPrice !== null ? selectedPrice : (match[3] !== 'null' ? match[3] : null);
    const currentColor = selectedColor !== null ? selectedColor : (match[4] !== 'null' ? match[4] : null);

    let args = `'${id}'`;
    if (currentSize) args += `, '${currentSize}'`; else args += `, null`;
    if (currentPrice) args += `, '${currentPrice}'`; else args += `, null`;
    if (currentColor) args += `, '${currentColor}'`;

    inquiryBtn.setAttribute('onclick', `inquireOnWhatsApp(${args})`);
}

function showToast(msg) {
    const t = document.getElementById('toast'); if (!t) return;
    t.innerText = msg; t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
}

window.shareProduct = async (id, name) => {
    const url = `${window.location.origin}${window.location.pathname}?p=${id}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: name, url: url });
        } catch (err) { console.log('Share Cancelled'); }
    } else {
        try {
            await navigator.clipboard.writeText(url);
            showToast("Link Copied to Clipboard");
        } catch (err) { showToast("Copy Failed"); }
    }
};

window.handleFavoritesClick = () => {
    window.openFavoritesSidebar();
};

window.openFavoritesSidebar = () => {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (sidebar && overlay) {
        renderFavoritesSidebar();
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeFavoritesSidebar = () => {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

window.openCategoriesSidebar = () => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (sidebar && overlay) {
        renderCategoriesSidebar();
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeCategoriesSidebar = () => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

window.renderCategoriesSidebar = () => {
    const container = document.getElementById('sidebar-categories-list');
    if (!container) return;

    if (DATA.c.length === 0) {
        container.innerHTML = `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Categories</p>`;
        return;
    }

    container.innerHTML = DATA.c.map(c => {
        const productCount = DATA.p.filter(p => p.catId === c.id).length;
        return `
            <div class="sidebar-cat-item group" onclick="window.closeCategoriesSidebar(); applyFilter('${c.id}')">
                <div class="sidebar-cat-img-box">
                    <img src="${getOptimizedUrl(c.img, 100) || 'https://placehold.co/100x100?text=Icon'}" alt="${c.name}" ${getOptimizedUrl(c.img, 100) ? "onerror=\"this.src='https://placehold.co/100x100?text=Icon'\"" : ''}>
                </div>
                <h4 class="sidebar-cat-name">${c.name}</h4>
                <span class="sidebar-cat-count">${productCount}</span>
            </div>
        `;
    }).join('');
};

// End of sidebar functions (cleaned duplicates)


window.renderFavoritesSidebar = () => {
    const container = document.getElementById('sidebar-items');
    if (!container) return;

    if (state.wishlist.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center px-6">
                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <i class="fa-solid fa-heart text-gray-200 text-2xl"></i>
                </div>
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Your list is empty</p>
                <p class="text-[9px] text-gray-300 mt-2 leading-relaxed">Add items you love to find them here easily.</p>
            </div>
        `;
        document.getElementById('sidebar-inquiry-btn')?.classList.add('hidden');
        return;
    }

    document.getElementById('sidebar-inquiry-btn')?.classList.remove('hidden');

    const items = state.wishlist.map(entry => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const p = DATA.p.find(x => x.id === id);
        if (!p) return null;

        let displayP = { ...p };
        let preSelect = null;
        if (entry.var) {
            displayP = { ...displayP, ...entry.var };
            preSelect = entry.var;
        }
        return { ...displayP, originalId: id, preSelect };
    }).filter(x => x);

    container.innerHTML = items.map(p => `
                                <div class="sidebar-item group" onclick="window.closeFavoritesSidebar(); viewDetail('${p.originalId}', false, ${p.preSelect ? JSON.stringify(p.preSelect) : 'null'})">
                                    <div class="sidebar-img-box">
                                        <img src="${getOptimizedUrl(p.img, 300)}" alt="${p.name}">
                                    </div>
                                    <div class="sidebar-info">
                                        <h4 class="sidebar-item-name">${p.name}</h4>
                                        <p class="sidebar-item-price">${p.price} AED</p>
                                    </div>
                                    <button onclick="event.stopPropagation(); window.toggleWishlist(null, '${p.originalId}')"
                                        class="sidebar-remove-btn shadow-sm">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                                `).join('');
};

window.preloadProductImage = (id, priority = 'low') => {
    const p = DATA.p.find(x => x.id === id);
    if (!p || p._preloaded) return;
    const imgUrl = getOptimizedUrl(p.images?.[0] || p.img, window.innerWidth < 768 ? 600 : 1200);
    const img = new Image();
    if (priority === 'high') img.fetchPriority = 'high';
    img.src = imgUrl;
    p._preloaded = true;
};

// Aggressively preload first 8 products for "instant" feel
// Aggressively preload sliders and first 8 products for "instant" feel
window.preloadInitialBatch = () => {
    // 1. Preload Sliders (High Priority)
    if (DATA.s && DATA.s.length) {
        DATA.s.forEach(s => {
            const isMobile = window.innerWidth < 768;
            const imgUrl = getOptimizedUrl(isMobile ? s.mobileImg : s.img, isMobile ? 1200 : 1920);
            const img = new Image();
            img.fetchPriority = 'high';
            img.src = imgUrl;
        });
    }
    // 2. Preload Product Detail Images (High Priority)
    if (DATA.p && DATA.p.length) {
        DATA.p.slice(0, 8).forEach(p => window.preloadProductImage(p.id, 'high'));
    }
};


function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string') return '';
    if (!url.includes('cloudinary.com')) return url;

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

// Fallback: If Cloudinary transform URL fails, retry with original URL
window.handleImgError = function (img) {
    if (img._retried) return; // Avoid infinite loop
    img._retried = true;
    const src = img.src || '';
    if (!src.includes('cloudinary.com')) return;
    // Strip all transforms and load the raw original URL
    const originalUrl = src.replace(/\/upload\/[^/]+\//, '/upload/');
    if (originalUrl !== src) {
        img.src = originalUrl;
    }
};


async function trackProductView(id) {
    if (!id || typeof id !== 'string') return;
    const today = getTodayStr();
    const sessionKey = `product_view_tracked_${today}_${id}`;

    // Strict Synchronous Guard to prevent double/triple counting
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    console.log(`[Traffic] Product interaction tracking triggered: ${id}. waiting for auth...`);
    await waitForAuth();

    try {
        const isAd = sessionStorage.getItem('traffic_source') === 'Google Ads';

        // 1. Update Global Stats (Product Journey Pillar)
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        const globalField = isAd ? 'adProductClicks' : 'normalProductClicks';

        // 2. Update Per-Product Stats (Top Items)
        const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
        const prodField = isAd ? 'adViews' : 'views';

        // Perform both updates (Batch would be cleaner but setDoc merge is fine here)
        await Promise.all([
            setDoc(statsRef, { [globalField]: increment(1) }, { merge: true }),
            setDoc(dailyProdRef, { [prodField]: increment(1), productId: id, date: today }, { merge: true })
        ]);

        console.log(`[Traffic] ${isAd ? 'AD' : 'Normal'} Product view recorded for: ${id}`);
    } catch (e) {
        console.error("[Traffic] Consolidated tracking failed:", e);
    }
}

function getBadgeLabel(badge) {
    const labels = {
        'new': 'New Arrival',
        'best': 'Best Seller',
        'limited': 'Limited Stock',
        'sale': 'On Sale',
        'trending': 'Trending'
    };
    return labels[badge] || badge;
}

function renderInsights(container, rangeData = null) {
    // 1. Auto-fetch Today's detailed stats in background if first open
    if (!rangeData) {
        const today = getTodayStr();
        window.updateInsightsRange(today, today, true);
    }

    // 2. Data Aggregation
    const source = rangeData || {
        stats: DATA.stats || {},
        p: DATA.p || []
    };

    // Use current in-memory stats if no range is selected
    const today = getTodayStr();

    // Calculate total views for health rate. If range, use range products. If all-time, use all products.
    const totalViews = source.p.reduce((acc, p) => acc + (p.views || 0) + (p.adViews || 0), 0);
    const adVisits = source.stats.adVisits || 0;
    const normalVisits = source.stats.normalVisits || 0;
    const adProductClicks = source.stats.adProductClicks || 0;
    const normalProductClicks = source.stats.normalProductClicks || 0;
    const adInquiries = source.stats.adInquiries || 0;
    const imageFail = source.stats.imageLoadFail || 0;

    // 2. Calculations
    const adJourneyPercent = adVisits ? Math.round((adProductClicks / adVisits) * 100) : 0;
    const normalJourneyPercent = normalVisits ? Math.round((normalProductClicks / normalVisits) * 100) : 0;
    const leadRate = adVisits ? ((adInquiries / adVisits) * 100).toFixed(1) : 0;
    const healthRate = totalViews ? Math.max(0, Math.min(100, 100 - (imageFail / totalViews * 100))).toFixed(1) : 100;

    const topProducts = [...source.p]
        .filter(p => (p.views || 0) > 0 || (p.adInquiries || 0) > 0 || (p.adViews || 0) > 0 || (p.adImpressions || 0) > 0)
        .sort((a, b) => ((b.views || 0) + (b.adViews || 0)) - ((a.views || 0) + (a.adViews || 0)))
        .slice(0, 50); // Show more in detailed view

    // Default dates for pickers
    const defaultStart = rangeData?.startDate || today;
    const defaultEnd = rangeData?.endDate || today;

    // Error Alert if any
    const errorAlert = source.error ? `
        <div class="bg-red-50 text-red-600 px-6 py-2 rounded-full text-[9px] font-bold uppercase tracking-widest mb-6 flex items-center justify-center gap-2 border border-red-100 w-fit mx-auto animate-bounce">
            <i class="fa-solid fa-circle-exclamation"></i>
            Live sync delayed. Refreshing...
        </div>` : '';

    let html = `
        <div class="space-y-6 px-16">
            ${errorAlert}
            <!-- Header with Compact Controls -->
            <div class="flex justify-between items-center mb-10">
                <h2 class="text-[16px] font-bold text-gray-800 tracking-tight">Insights Dashboard</h2>
                
                <div class="flex items-center gap-4">
                    <!-- Symmetrical Simple Date Filter -->
                    <div class="flex items-center gap-6 bg-white px-8 py-2 rounded-full border border-gray-100 shadow-sm">
                        <div class="flex items-center gap-3">
                            <input type="date" id="insights-start" value="${defaultStart}" class="bg-transparent border-none text-[11px] font-bold text-gray-700 focus:ring-0 p-0 w-32 text-center">
                            <span class="text-gray-300 text-[10px] uppercase font-black">to</span>
                            <input type="date" id="insights-end" value="${defaultEnd}" class="bg-transparent border-none text-[11px] font-bold text-gray-700 focus:ring-0 p-0 w-32 text-center">
                        </div>
                        
                        <div class="flex items-center gap-3">
                            <button onclick="updateInsightsRange()" id="update-range-btn" class="px-5 py-2 bg-black text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                                Update
                            </button>
                            
                            ${rangeData ? `
                                <button title="Clear Filter" onclick="renderInsights(document.getElementById('admin-insights-list'))" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all">
                                    <i class="fa-solid fa-xmark text-[11px]"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <button onclick="resetInsightsData()" class="px-6 py-2 bg-red-50 text-red-600 rounded-full text-[10px] font-bold hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100 uppercase tracking-widest">
                        <i class="fa-solid fa-rotate-left"></i>
                        Reset
                    </button>
                </div>
            </div>

            <!-- PILLARS 1, 2, 3 & 4: TRAFFIC, JOURNEY, LEADS & HEALTH -->
            <div class="grid gap-4" style="grid-template-columns: repeat(4, 1fr);">
                <!-- Website Visitor Card -->
                <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <h5 class="text-[11px] font-semibold text-gray-400 mb-4">Website Visitor</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="border-r border-gray-50 pr-4">
                            <p class="text-[26px] font-semibold text-blue-600 leading-none">${adVisits}</p>
                            <p class="text-[11px] font-medium text-blue-300 mt-1">AD Customer</p>
                        </div>
                        <div class="pl-4">
                            <p class="text-[26px] font-semibold text-green-600 leading-none">${normalVisits}</p>
                            <p class="text-[11px] font-medium text-green-300 mt-1">OG Customer</p>
                        </div>
                    </div>
                </div>

                <!-- Product Detail Page Visitors Card -->
                <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <h5 class="text-[11px] font-semibold text-gray-400 mb-4">Product Journey</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="border-r border-gray-50 pr-4">
                            <p class="text-[26px] font-semibold text-blue-600 leading-none">${adProductClicks}</p>
                            <p class="text-[11px] font-medium text-blue-300 mt-1">AD Customer</p>
                        </div>
                        <div class="pl-4">
                            <p class="text-[26px] font-semibold text-green-600 leading-none">${normalProductClicks}</p>
                            <p class="text-[11px] font-medium text-green-300 mt-1">OG Customer</p>
                        </div>
                    </div>
                </div>

                <!-- Leads Card -->
                <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <h5 class="text-[11px] font-semibold text-gray-400 mb-4">Google AD Leads</h5>
                    <p class="text-[26px] font-semibold text-blue-600 leading-none">${adInquiries}</p>
                    <p class="text-[11px] font-medium text-blue-300 mt-1">Conversion: ${leadRate}%</p>
                </div>

                <!-- Website Health Card -->
                <div class="bg-black p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-4">
                        <h5 class="text-[11px] font-semibold text-gray-400">Website Health</h5>
                        ${(imageFail > 0 || (source.stats.brokenImages || []).length > 0) ? `<button onclick="window.clearHealthErrors()" title="Clear error count" style="background:rgba(255,255,255,0.08);border:none;cursor:pointer;border-radius:999px;padding:4px 10px;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)';this.style.color='#f87171'" onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.color='#9ca3af'">
                            <i class="fa-solid fa-rotate-left" style="margin-right:4px;"></i>Clear
                        </button>` : ''}
                    </div>
                    <p class="text-[26px] font-semibold leading-none ${imageFail === 0 ? 'text-green-400' : imageFail <= 10 ? 'text-yellow-400' : imageFail <= 30 ? 'text-orange-400' : 'text-red-400'}">
                        ${imageFail === 0 ? '✓ Clean' : imageFail + ' Errors'}
                    </p>
                    <p class="text-[11px] font-medium text-gray-500 mt-1">
                        ${imageFail === 0 ? 'All assets loading fine' : imageFail <= 10 ? 'Minor — a few broken images' : imageFail <= 30 ? 'Fair — check product images' : 'Action needed — many broken images'}
                    </p>
                    ${(source.stats.brokenImages || []).length > 0 ? `
                    <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                        <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Broken Image URLs</p>
                        <div style="display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto;">
                            ${(source.stats.brokenImages || []).map(url => {
        // Try to match URL to a product or category name
        const matchedProd = DATA.p.find(p => p.img && url.includes(p.img.split('/').pop().split('?')[0]));
        const matchedCat = DATA.c.find(c => c.img && url.includes(c.img.split('/').pop().split('?')[0]));
        const label = matchedProd ? matchedProd.name : matchedCat ? matchedCat.name + ' (Category)' : url.split('/').pop().split('?')[0].substring(0, 30);
        return `<div style="display:flex;align-items:center;gap:8px;background:rgba(239,68,68,0.1);border-radius:8px;padding:6px 8px;">
                                    <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;font-size:9px;flex-shrink:0;"></i>
                                    <span style="font-size:9px;font-weight:600;color:#d1d5db;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${url}">${label}</span>
                                </div>`;
    }).join('')}
                        </div>
                    </div>` : ''}
                </div>
            </div>

            <!-- Top Products Table -->
            <div class="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-50">
                    <h5 class="text-[12px] font-semibold text-gray-400">Top Performing Items</h5>
                </div>
                <div class="divide-y divide-gray-50">
                    ${topProducts.map((p, i) => `
                        <div class="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors group">
                            <div class="text-[11px] font-medium text-gray-300 w-4">${i + 1}</div>
                            <img src="${getOptimizedUrl(p.img, 100)}" class="w-10 h-10 rounded-xl object-cover shadow-sm">
                            <div class="flex-1">
                                <p class="text-[13px] font-medium text-gray-800 truncate">${p.name}</p>
                                <p class="text-[10px] font-medium text-gray-400">${DATA.c.find(c => c.id === p.catId)?.name || 'General'}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[12px] font-semibold text-green-600">${p.views || 0}</p>
                                <p class="text-[9px] font-medium text-green-400 leading-tight">Og clicks</p>
                            </div>
                            <!-- Ad Views (Clicks) column - Blue -->
                            <div class="text-right pl-3 border-l border-gray-50 min-w-[35px]">
                                <p class="text-[12px] font-semibold text-blue-600">${p.adViews || 0}</p>
                                <p class="text-[9px] font-medium text-blue-300 leading-tight">Ad clicks</p>
                            </div>
                            <div class="text-right pl-3 border-l border-gray-50 min-w-[45px]">
                                <p class="text-[12px] font-semibold text-blue-600">${p.adInquiries || 0}</p>
                                <p class="text-[9px] font-medium text-blue-200 leading-tight">Ad leads</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

window.updateInsightsRange = async function (passedStart = null, passedEnd = null, isSilent = false) {
    if (typeof passedStart !== 'string') passedStart = null;
    if (typeof passedEnd !== 'string') passedEnd = null;
    const start = passedStart || document.getElementById('insights-start')?.value;
    const end = passedEnd || document.getElementById('insights-end')?.value;
    const btn = document.getElementById('update-range-btn');

    if (!start || !end) {
        if (!isSilent) alert("Please select both dates.");
        return;
    }

    if (!isSilent && btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Fetching...';
    }

    try {
        console.log(`[Insights] Fetching range: ${start} to ${end}`);
        // 1. Fetch Global Stats
        // Firebase documentId() inequality queries require full document paths.
        // To avoid issues with existing data, we fetch all daily_stats (1 doc/day) and filter locally.
        const globalRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_stats');
        const globalSnap = await getDocs(globalRef);

        const aggregatedStats = {
            adVisits: 0, normalVisits: 0, adProductClicks: 0,
            normalProductClicks: 0, adInquiries: 0, imageLoadFail: 0,
            landingAdVisits: 0, brokenImages: []
        };

        globalSnap.forEach(doc => {
            const docId = doc.id;
            // Filter by date range in memory
            if (docId >= start && docId <= end) {
                const d = doc.data();
                aggregatedStats.adVisits += (d.adVisits || 0);
                aggregatedStats.normalVisits += (d.normalVisits || 0);
                aggregatedStats.landingAdVisits += (d.landingAdVisits || 0);
                aggregatedStats.adProductClicks += (d.adProductClicks || 0);
                aggregatedStats.normalProductClicks += (d.normalProductClicks || 0);
                aggregatedStats.adInquiries += (d.adInquiries || 0);
                aggregatedStats.imageLoadFail += (d.imageLoadFail || d.imageFail || 0);
                // Collect all unique broken image URLs across the range
                if (Array.isArray(d.brokenImages)) {
                    d.brokenImages.forEach(u => {
                        if (!aggregatedStats.brokenImages.includes(u)) aggregatedStats.brokenImages.push(u);
                    });
                }
            }
        });

        // Combine landing page hits into AD traffic for a unified view
        aggregatedStats.adVisits = (aggregatedStats.adVisits || 0) + (aggregatedStats.landingAdVisits || 0);

        // 2. Fetch Product Stats
        const prodRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats');
        const qProd = query(prodRef, where("date", ">=", start), where("date", "<=", end));
        const prodSnap = await getDocs(qProd);

        const prodMap = {}; // productId -> combined stats
        prodSnap.forEach(doc => {
            const d = doc.data();
            const pid = d.productId;
            if (!pid) return;
            if (!prodMap[pid]) {
                const specialNames = { 'floating_button': 'Main Floating WhatsApp', 'landing_floating': 'Landing Floating WhatsApp', 'bulk_inquiry': 'Cart Checkout Inquiry' };
                const original = DATA.p.find(p => p.id === pid) || { name: specialNames[pid] || 'Unknown', img: '', catId: '' };
                prodMap[pid] = { ...original, views: 0, adViews: 0, adInquiries: 0 };
            }
            prodMap[pid].views += (d.views || 0);
            prodMap[pid].adViews += (d.adViews || 0);
            prodMap[pid].adInquiries += (d.adInquiries || 0);
        });

        const rangeData = {
            stats: aggregatedStats,
            p: Object.values(prodMap),
            startDate: start,
            endDate: end
        };

        console.log("[Insights] Data aggregated, rendering...", rangeData.stats);
        const container = document.getElementById('admin-insights-list');
        if (container) renderInsights(container, rangeData);

    } catch (e) {
        console.error("[Insights] Range update error:", e);
        if (!isSilent) alert("Failed to fetch range data. Please try again.");

        // RECOVERY: Even if it fails, try to show the dashboard with whatever local data we have to clear the spinner.
        const container = document.getElementById('admin-insights-list');
        if (container && container.innerHTML.includes('animate-spin')) {
            renderInsights(container, {
                stats: { adVisits: 0, normalVisits: 0, adProductClicks: 0, normalProductClicks: 0, adInquiries: 0, imageLoadFail: 0 },
                p: [],
                startDate: start,
                endDate: end,
                error: true
            });
        }
    } finally {
        if (!isSilent && btn) {
            btn.disabled = false;
            btn.innerText = 'Update View';
        }
    }
}




window.resetAdTraffic = async () => {
    if (!confirm("Are you sure you want to reset all Ad Traffic, Impressions, and Session data?")) return;
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(statsRef, {
            adVisits: 0,
            adInquiries: 0,
            adImpressions: 0,
            totalSessionSeconds: 0,
            adHops: 0,
            normalVisits: 0,
            adProductClicks: 0,
            normalProductClicks: 0,
            imageLoadFail: 0
        }, { merge: true });
        DATA.stats.adVisits = 0;
        DATA.stats.adInquiries = 0;
        DATA.stats.adImpressions = 0;
        DATA.stats.totalSessionSeconds = 0;
        DATA.stats.adHops = 0;
        DATA.stats.normalVisits = 0;
        DATA.stats.adProductClicks = 0;
        DATA.stats.normalProductClicks = 0;
        DATA.stats.imageLoadFail = 0;
        renderAdminUI();
        showToast("Ad Data Reset Successfully");
    } catch (e) {
        console.error("Reset Error:", e);
        showToast("Error resetting data");
    }
};

// Clear today's image error count (used by admin health card "Clear" button)
window.clearHealthErrors = async () => {
    try {
        const today = getTodayStr();
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        await setDoc(statsRef, { imageLoadFail: 0, brokenImages: [] }, { merge: true });

        // Also clear legacy/all-time counter
        const legacyRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(legacyRef, { imageLoadFail: 0, brokenImages: [] }, { merge: true });

        // Clear in-memory tracking so fresh errors are counted from now
        DATA.stats.imageLoadFail = 0;
        DATA.stats.brokenImages = [];
        _errorTrackedUrls.clear();

        // Re-render the admin UI so health card updates immediately
        const container = document.getElementById('admin-insights-list');
        if (container) {
            window.updateInsightsRange(today, today, false);
        }
        showToast("Health errors cleared ✓");
    } catch (e) {
        console.error("Clear Health Error:", e);
        showToast("Failed to clear errors");
    }
};

window.resetAllAnalytics = async () => {
    if (!confirm("CRITICAL: This will reset ALL VIEWS, AD TRAFFIC, IMPRESSIONS, and LEADS. This cannot be undone. Proceed?")) return;

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        const batch = writeBatch(db);

        // 1. Reset Global Ad Stats
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        batch.set(statsRef, { adVisits: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0, adHops: 0 }, { merge: true });

        // 2. Reset All Products (Views, AdViews, AdInquiries, AdImpressions)
        const products = DATA.p;
        products.forEach(p => {
            const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
            batch.update(pRef, { views: 0, adViews: 0, adInquiries: 0, adImpressions: 0 });
        });

        await batch.commit();

        // Update Local memory
        DATA.stats.adVisits = 0;
        DATA.stats.adInquiries = 0;
        DATA.stats.adImpressions = 0;
        DATA.stats.totalSessionSeconds = 0;
        DATA.stats.adHops = 0;
        DATA.p.forEach(p => {
            p.views = 0;
            p.adViews = 0;
            p.adInquiries = 0;
            p.adImpressions = 0;
        });

        renderAdminUI();
        showToast("All Analytics Reset to Zero");
    } catch (e) {
        console.error("Master Reset Error:", e);
        showToast("Error during Master Reset");
    } finally {
        if (loader) loader.style.display = 'none';
    }
};

window.focusSearch = () => {
    // Navigate home first if we're not there
    if (new URLSearchParams(window.location.search).has('p') || state.selectionId) {
        window.goBackToHome(true);
    }

    setTimeout(() => {
        const searchInput = document.getElementById('customer-search');
        if (!searchInput) return;

        // Ensure the container is visible (renderSlider can hide it based on state)
        const topElements = document.getElementById('home-top-elements');
        if (topElements) topElements.classList.remove('hidden');
        const searchContainer = document.getElementById('customer-search-container');
        if (searchContainer) searchContainer.classList.remove('hidden');

        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        searchInput.focus();
    }, 300);
};

// SLIDER LOGIC
let sliderInterval;
let currentSlide = 0;

function renderSlider() {
    const wrapper = document.getElementById('home-top-elements');
    const container = document.getElementById('home-slider-container');
    const slider = document.getElementById('home-slider');
    const dots = document.getElementById('slider-dots');

    // Safety: always hide slider when a product detail is open (?p= in URL)
    const isProductDetail = new URLSearchParams(window.location.search).has('p');
    if (!slider || !DATA.s.length || isProductDetail || state.filter !== 'all' || state.selectionId) {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }

    // When search is active, only hide the slider container — keep the mobile search bar visible
    if (state.search) {
        if (container) container.classList.add('hidden');
        // Keep the wrapper visible so the mobile search bar (md:hidden) stays accessible
        if (wrapper) wrapper.classList.remove('hidden');
        return;
    }

    if (container) container.classList.remove('hidden');
    if (wrapper) wrapper.classList.remove('hidden');

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const sortedSliders = [...DATA.s].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    // RELAXED FILTERING: Block only the default placeholder
    const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';

    const visibleSliders = sortedSliders.filter(s => {
        const hasMobile = isUrl(s.mobileImg);
        const hasDesktop = isUrl(s.img);
        return isMobile ? hasMobile : hasDesktop;
    });

    if (!visibleSliders.length) {
        if (container) container.classList.add('hidden');
        return;
    }

    slider.innerHTML = visibleSliders.map((s, i) => {
        const displayImg = isMobile ? s.mobileImg : s.img;

        // Exact original mobile overlay vs New premium desktop overlay
        const overlayHTML = s.title ? (isMobile
            ? `<div class="absolute bottom-12 left-8 text-white z-20">
                 <h2 class="text-2xl font-black uppercase tracking-tighter">${s.title}</h2>
               </div>`
            : `<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex items-end pb-14 pl-16 z-20 pointer-events-none">
                 <h2 class="text-5xl lg:text-5xl font-black text-white uppercase tracking-[-0.03em] drop-shadow-md max-w-2xl leading-[1]">${s.title}</h2>
               </div>`
        ) : '';

        return `
            <div class="slider-slide relative" data-index="${i}">
                <img src="${getOptimizedUrl(displayImg, isMobile ? 1200 : 1920)}" 
                     class="${i === 0 ? 'no-animation' : ''} w-full h-full object-cover"
                     alt="${s.title || ''}" 
                     ${i === 0 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                     onclick="${s.link ? `window.open('${s.link}', '_blank')` : ''}" 
                     style="${s.link ? 'cursor:pointer' : ''}"
                     draggable="false">
                ${overlayHTML}
            </div>
        `;
    }).join('');

    if (dots) {
        dots.innerHTML = visibleSliders.map((_, i) => `
            <div class="slider-dot ${i === 0 ? 'active' : ''}" onclick="window.goToSlide(${i})"></div>
        `).join('');
    }

    currentSlide = 0;
    startSliderAutoPlay();

    // Sync dots on manual scroll/swipe
    slider.onscroll = () => {
        const index = Math.round(slider.scrollLeft / slider.offsetWidth);
        if (index !== currentSlide && !isNaN(index)) {
            currentSlide = index;
            const allDots = dots.querySelectorAll('.slider-dot');
            allDots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlide);
            });
            // Reset autoplay timer when user interacts manually
            startSliderAutoPlay();
        }
    };

    // Desktop Mouse Drag Support
    initSliderDrag(slider);
}

// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP SLIDER DRAG — click-and-drag for better desktop UX
// ─────────────────────────────────────────────────────────────────────────────
function initSliderDrag(slider) {
    if (!slider || slider._dragInitialized) return;
    slider._dragInitialized = true;

    let isDown = false;
    let startX = 0;
    let moveDistance = 0;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.clientX;
        moveDistance = 0;
        slider.style.cursor = 'grab';
    });

    slider.addEventListener('mouseup', (e) => {
        if (!isDown) return;
        isDown = false;

        const endX = e.clientX;
        const diff = endX - startX;
        moveDistance = Math.abs(diff);

        // TRIGGER ON RELEASE ONLY (Flick)
        if (moveDistance > 40) { // More sensitive for easier swiping
            if (diff > 0) {
                window.moveSlider(-1);
            } else {
                window.moveSlider(1);
            }
        }
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
    });

    slider.addEventListener('mousemove', (e) => {
        if (isDown) {
            e.preventDefault();
        }
    });

    slider.addEventListener('click', (e) => {
        if (moveDistance > 15) { // Threshold to distinguish click from swipe
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

window.moveSlider = (dir) => {
    const slider = document.getElementById('home-slider');
    if (!slider) return;
    const slides = slider.querySelectorAll('.slider-slide');
    currentSlide = (currentSlide + dir + slides.length) % slides.length;
    updateSliderUI();
};

window.goToSlide = (index) => {
    currentSlide = index;
    updateSliderUI();
};

function updateSliderUI() {
    const slider = document.getElementById('home-slider');
    const dots = document.querySelectorAll('.slider-dot');
    if (!slider) return;

    slider.scrollTo({
        left: slider.offsetWidth * currentSlide,
        behavior: 'smooth'
    });

    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });

    startSliderAutoPlay(); // Reset timer
}

function startSliderAutoPlay() {
    clearInterval(sliderInterval);
    sliderInterval = setInterval(() => {
        window.moveSlider(1);
    }, 5000);
}

// ADMIN SLIDER FUNCTIONS
window.saveSlider = async () => {
    const id = document.getElementById('edit-slider-id').value;
    const sliderData = {
        img: document.getElementById('s-img').value.trim(),
        mobileImg: document.getElementById('s-mobileImg').value.trim(),
        title: document.getElementById('s-title').value.trim(),
        link: document.getElementById('s-link').value.trim(),
        order: Number(document.getElementById('s-order').value) || 0,
        updatedAt: Date.now()
    };

    const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';
    const hasImg = isUrl(sliderData.img);
    const hasMobileImg = isUrl(sliderData.mobileImg);

    if (!hasImg && !hasMobileImg) return showToast("Image is required");

    try {
        if (id) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sliders', id), sliderData);
            showToast("Slider Updated");
        } else {
            await addDoc(sliderCol, sliderData);
            showToast("Slider Added");
        }
        resetForm();
        DATA.s = []; // Clear local to force refresh
        refreshData();
    } catch (e) {
        console.error("Slider Save Error:", e);
        showToast("Error saving slider");
    }
};

window.cloudinaryBulkSliderUpload = (type) => {
    cloudinary.openUploadWidget({
        cloudName: 'dxkcvm2yh',
        uploadPreset: 'speed_preset',
        multiple: true,
        maxFiles: 20,
        sources: ['local', 'url', 'camera']
    }, async (error, result) => {
        if (!error && result && result.event === "success") {
            const url = result.info.secure_url;
            showToast(`Saving ${type} image...`);

            const sliderData = {
                title: "",
                link: "",
                order: DATA.s.length + 1,
                updatedAt: Date.now()
            };

            if (type === 'desktop') {
                sliderData.img = url;
                sliderData.mobileImg = "img/";
            } else {
                sliderData.img = "img/";
                sliderData.mobileImg = url;
            }

            try {
                await addDoc(sliderCol, sliderData);
                DATA.s = []; // Trigger full refresh
                refreshData();
                showToast(`New ${type} slider added!`);
            } catch (err) {
                console.error("Bulk Upload Save Error:", err);
                showToast("Save failed");
            }
        }
    });
};

window.handleSliderBulkDrop = async (e, type) => {
    e.preventDefault();
    const zone = e.currentTarget;
    zone.classList.remove('border-black', 'bg-gray-50');

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return showToast("No images found.");

    showToast(`Uploading ${files.length} ${type} images...`);

    for (const file of files) {
        try {
            const url = await directCloudinaryUpload(file);
            const sliderData = {
                title: "",
                link: "",
                order: DATA.s.length + 1,
                updatedAt: Date.now(),
                img: type === 'desktop' ? url : "img/",
                mobileImg: type === 'mobile' ? url : "img/"
            };
            await addDoc(sliderCol, sliderData);
        } catch (err) {
            console.error("Bulk Drop Error:", err);
            showToast("One or more uploads failed");
        }
    }

    DATA.s = [];
    refreshData();
    showToast("Bulk Upload Complete!");
};

window.editSlider = (id) => {
    const s = DATA.s.find(x => x.id === id);
    if (!s) return;
    document.getElementById('edit-slider-id').value = s.id;
    document.getElementById('s-img').value = s.img;
    document.getElementById('s-mobileImg').value = s.mobileImg || "img/";
    document.getElementById('s-title').value = s.title || "";
    document.getElementById('s-link').value = s.link || "";
    document.getElementById('s-order').value = s.order || 0;
    document.getElementById('slider-form-title').innerText = "Edit Slider Image";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteSlider = async (id) => {
    if (!confirm("Are you sure?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sliders', id));
        showToast("Slider Deleted");
        refreshData();
    } catch (e) {
        showToast("Error deleting slider");
    }
};

function renderAdminSliders(container) {
    const sorted = [...DATA.s].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    container.innerHTML = sorted.map(s => {
        const hasMobile = s.mobileImg && s.mobileImg !== 'img/';
        const hasDesktop = s.img && s.img !== 'img/';

        return `
            <div class="admin-slider-card">
                <div class="flex gap-4 w-full">
                    <div class="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border">
                        <img src="${getOptimizedUrl(s.img, 200)}" class="w-full h-full object-cover ${!hasDesktop ? 'opacity-20 grayscale' : ''}">
                        <div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[7px] text-center font-bold uppercase py-1">Desktop</div>
                    </div>
                    <div class="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border">
                        <img src="${getOptimizedUrl(s.mobileImg, 200)}" class="w-full h-full object-cover ${!hasMobile ? 'opacity-20 grayscale' : ''}" onerror="this.src='https://placehold.co/200x200?text=No+Mobile'">
                        <div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[7px] text-center font-bold uppercase py-1">Mobile</div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-[13px] truncate">${s.title || 'Untitled Slide'}</p>
                        <p class="text-[9px] text-gray-400 font-black uppercase mt-1">Order: ${s.order}</p>
                        <div class="flex gap-2 mt-2">
                             ${hasDesktop ? '<span class="px-2 py-0.5 bg-blue-50 text-blue-400 text-[7px] font-black rounded-full uppercase">Desktop On</span>' : '<span class="px-2 py-0.5 bg-gray-50 text-gray-300 text-[7px] font-black rounded-full uppercase">Desktop Off</span>'}
                             ${hasMobile ? '<span class="px-2 py-0.5 bg-green-50 text-green-400 text-[7px] font-black rounded-full uppercase">Mobile On</span>' : '<span class="px-2 py-0.5 bg-gray-50 text-gray-300 text-[7px] font-black rounded-full uppercase">Mobile Off</span>'}
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button onclick="editSlider('${s.id}')" class="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-full text-gray-400 hover:text-black transition-all">
                            <i class="fa-solid fa-pen text-[10px]"></i>
                        </button>
                        <button onclick="deleteSlider('${s.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 rounded-full text-red-200 hover:text-red-500 transition-all">
                            <i class="fa-solid fa-trash text-[10px]"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('') || `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Sliders</p>`;
}

// ANNOUNCEMENT BAR LOGIC
let announcementInterval;
let currentAnnouncement = 0;

function renderAnnouncementBar() {
    const bar = document.getElementById('announcement-bar');
    const nav = document.querySelector('nav');
    if (!bar) return;

    let msgs = DATA.announcements || [];
    if (msgs.length === 0 || (msgs.length === 1 && msgs[0].trim() === "")) {
        bar.style.display = 'none';
        if (nav) nav.style.marginTop = '10px';
        return;
    }
    bar.style.display = 'flex';
    if (nav) nav.style.marginTop = '0px';

    bar.innerHTML = msgs.map((msg, idx) => `
        <div class="announcement-item ${idx === 0 ? 'active' : ''}">
            <span class="announcement-text">${msg}</span>
        </div>
    `).join('');

    initAnnouncementRotation();
}

function initAnnouncementRotation() {
    clearInterval(announcementInterval);
    const items = document.querySelectorAll('.announcement-item');
    if (items.length <= 1) return;

    announcementInterval = setInterval(() => {
        items[currentAnnouncement].classList.remove('active');
        currentAnnouncement = (currentAnnouncement + 1) % items.length;
        items[currentAnnouncement].classList.add('active');
    }, 3000);
}

// ADMIN ANNOUNCEMENTS
window.addAnnouncementRow = (text = "") => {
    const container = document.getElementById('announcement-rows');
    if (!container) return;
    const div = document.createElement('div');
    div.className = "flex gap-3 animate-fade-in";
    div.innerHTML = `
        <input type="text" class="admin-input flex-1 a-msg" placeholder="Notice text..." value="${text}">
        <button onclick="this.parentElement.remove()" class="w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    container.appendChild(div);
};

window.saveAnnouncements = async () => {
    const btn = document.getElementById('a-save-btn');
    const msgs = Array.from(document.querySelectorAll('.a-msg')).map(i => i.value.trim()).filter(v => v);

    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_announcements_');
        await setDoc(statsRef, { messages: msgs, updatedAt: Date.now() });
        showToast("Announcements Saved!");
        refreshData();
    } catch (e) {
        console.error("Save Error:", e);
        showToast("Error saving data");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Save Announcements"; }
    }
};

function renderAdminAnnouncements() {
    const container = document.getElementById('announcement-rows');
    if (!container) return;
    container.innerHTML = '';
    const msgs = DATA.announcements || [];
    if (msgs.length === 0) {
        addAnnouncementRow("");
    } else {
        msgs.forEach(m => addAnnouncementRow(m));
    }
}

function renderAdminMegaMenus() {
    const list = document.getElementById('admin-megamenu-list');
    const checklist = document.getElementById('m-categories-checkboxes');
    if (!list || !checklist) return;

    // 1. Render Checklist (all normal categories)
    checklist.innerHTML = DATA.c.map(c => `
        <label class="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer border border-gray-100 bg-white shadow-sm transition-all hover:border-black">
            <input type="checkbox" value="${c.id}" class="mega-cat-checkbox w-4 h-4 text-black focus:ring-black border-gray-300 rounded cursor-pointer">
            <img src="${getOptimizedUrl(c.img, 50)}" class="w-8 h-8 object-cover rounded bg-gray-100" onerror="this.src='https://placehold.co/50x50?text=Icon'">
            <span class="text-[13px] font-bold text-gray-800 flex-1">${c.name}</span>
        </label>
    `).join('');

    // 2. Render created Mega Menus
    const sorted = [...(DATA.m || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    list.innerHTML = sorted.map(m => {
        // Get mapped category objects
        const mappedCats = (m.categoryIds || [])
            .map(cId => DATA.c.find(c => c.id === cId))
            .filter(Boolean);

        const thumbs = mappedCats.slice(0, 5).map(c => `
            <img src="${getOptimizedUrl(c.img, 60)}" title="${c.name}"
                class="w-9 h-9 rounded-xl object-cover border-2 border-white shadow-sm -ml-2 first:ml-0 bg-gray-100"
                onerror="this.src='https://placehold.co/60x60?text=?'">
        `).join('');

        const extra = mappedCats.length > 5 ? `<span class="w-9 h-9 rounded-xl bg-gray-100 border-2 border-white shadow-sm -ml-2 flex items-center justify-center text-[9px] font-black text-gray-500">+${mappedCats.length - 5}</span>` : '';

        return `
        <div style="background:#fff; border:1px solid #f0f0f0; border-radius:20px; padding:16px 20px; display:flex; align-items:center; gap:16px; box-shadow:0 2px 12px rgba(0,0,0,0.04);">
            <!-- Left: Title + Category Thumbs -->
            <div style="flex:1; min-width:0;">
                <p style="font-size:13px; font-weight:900; color:#111; margin:0 0 8px;">${m.name}</p>
                <div style="display:flex; align-items:center; gap:0;">
                    ${thumbs}${extra}
                    ${mappedCats.length === 0 ? '<span style="font-size:10px;color:#9ca3af;font-style:italic;">No categories mapped</span>' : ''}
                </div>
                ${mappedCats.length > 0 ? `<p style="font-size:9px;color:#9ca3af;font-weight:700;margin-top:6px;text-transform:uppercase;letter-spacing:0.1em;">${mappedCats.length} categor${mappedCats.length === 1 ? 'y' : 'ies'} mapped</p>` : ''}
            </div>

            <!-- Right: Edit + Delete Buttons -->
            <div style="display:flex; gap:8px; flex-shrink:0;">
                <button onclick="editMegaMenu('${m.id}')"
                    style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:#f3f4f6;border:none;border-radius:12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#374151;cursor:pointer;transition:all 0.2s;"
                    onmouseover="this.style.background='#000';this.style.color='#fff'"
                    onmouseout="this.style.background='#f3f4f6';this.style.color='#374151'">
                    <i class="fa-solid fa-pen" style="font-size:9px;"></i> Edit
                </button>
                <button onclick="deleteMegaMenu('${m.id}')"
                    style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:#fff0f0;border:none;border-radius:12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#ef4444;cursor:pointer;transition:all 0.2s;"
                    onmouseover="this.style.background='#ef4444';this.style.color='#fff'"
                    onmouseout="this.style.background='#fff0f0';this.style.color='#ef4444'">
                    <i class="fa-solid fa-trash" style="font-size:9px;"></i> Delete
                </button>
            </div>
        </div>
        `;
    }).join('') || `<div style="text-align:center;padding:60px 20px;color:#d1d5db;font-size:11px;font-style:italic;">No Desktop Menus created yet.</div>`;
}

// Update renderAdminUI to handle announcements and megamenus
const originalRenderAdminUI = window.renderAdminUI;
window.renderAdminUI = () => {
    originalRenderAdminUI();
    const sList = document.getElementById('admin-slider-list');
    if (sList && state.adminTab === 'sliders') {
        renderAdminSliders(sList);
    }
    if (state.adminTab === 'announcements') {
        renderAdminAnnouncements();
    }
    if (state.adminTab === 'megamenu') {
        renderAdminMegaMenus();
    }
};

// Auth state and data fetching are handled by onAuthStateChanged.
refreshData();

// Responsive Slider Refresh
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (document.getElementById('home-slider-container')) {
            renderSlider();
        }
    }, 250);
});

// Smart Mobile Nav Scroll Behavior
let navScrollTimeout;
window.addEventListener('scroll', () => {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav || window.innerWidth >= 768) return;

    const currentScroll = window.pageYOffset;

    // Hide on down-scroll, show on up-scroll
    if (currentScroll > state.scrollPos && currentScroll > 60) {
        nav.classList.add('nav-hidden');
    } else {
        nav.classList.remove('nav-hidden');
    }

    state.scrollPos = currentScroll;

    // Always show when scrolling stops for a moment
    clearTimeout(navScrollTimeout);
    navScrollTimeout = setTimeout(() => {
        nav.classList.remove('nav-hidden');
    }, 1000);
}, { passive: true });
// --- LEAD POPUP CORE ---
window.initPopup = () => {
    console.log("[Popup] Initializing logic...");
    // Check if user is from Google Ads
    if (sessionStorage.getItem('traffic_source') !== 'Google Ads') {
        console.log("[Popup] Blocked: Non-ads visitor.");
        return;
    }

    // Check if user already submitted or dismissed
    if (localStorage.getItem('popup_submitted')) {
        console.log("[Popup] Blocked: Already submitted.");
        return;
    }
    if (localStorage.getItem('popup_dismissed')) {
        console.log("[Popup] Blocked: Already dismissed.");
        return;
    }

    console.log("[Popup] Timer started: 20s delay...");
    setTimeout(async () => {
        window.forceShowPopup();
    }, 20000); // 20 Seconds Delay
};

window.forceShowPopup = async () => {
    console.log("[Popup] Triggering show...");
    // Fetch current settings from Firestore
    try {
        const snap = await getDocs(popupSettingsCol);
        if (!snap.empty) {
            const settings = snap.docs[0].data();
            DATA.popupSettings = settings;

            // Update UI
            const title = document.getElementById('popup-gift-title');
            const msg = document.getElementById('popup-gift-msg');
            const img = document.getElementById('popup-gift-img');
            const sTitle = document.getElementById('success-title');
            const sMsg = document.getElementById('success-msg');

            if (title) title.innerText = settings.title || "Claim Your Free Gift";
            if (msg) msg.innerText = settings.msg || "Limited Edition • Exclusive Offer";
            if (img) img.src = (settings.img && settings.img !== 'img/') ? getOptimizedUrl(settings.img, 800) : "https://placehold.co/600x400?text=Gift";

            // Success State Content
            if (sTitle) sTitle.innerText = settings.successTitle || "Congratulations!";
            if (sMsg) sMsg.innerText = settings.successMsg || "Your gift has been secured. We will contact you through WhatsApp shortly.";
        }
    } catch (e) {
        console.error("[Popup] Settings fetch failed", e);
    }

    const overlay = document.getElementById('gift-popup-overlay');
    if (overlay) {
        console.log("[Popup] Showing overlay...");
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Initialize Intl-Tel-Input
        const input = document.getElementById('lead-whatsapp');
        const itild = window.intlTelInput;

        if (input && itild) {
            try {
                console.log("[Popup] Initializing ITI...");
                if (iti) iti.destroy(); // Avoid double init
                iti = itild(input, {
                    initialCountry: "ae",
                    separateDialCode: true,
                    autoPlaceholder: "off",
                    useFullscreenPopup: true, // BETTER FOR MOBILE: Avoids keyboard interference
                    dropdownContainer: document.body, // FIX: Appends to body to avoid popup clipping/layering bugs
                    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@24.5.0/build/js/utils.js",
                });

                // Aesthetic: Add a small delay and focus name if visible, but avoid forcing keyboard
                // on the phone input immediately
            } catch (err) {
                console.error("[Popup] ITI Init Error:", err);
            }
        } else {
            console.warn("[Popup] ITI skip: input or itild missing", { input: !!input, itild: !!itild });
        }
    } else {
        console.error("[Popup] Error: gift-popup-overlay element not found!");
    }
};

window.closeGiftPopup = () => {
    const overlay = document.getElementById('gift-popup-overlay');
    if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
        localStorage.setItem('popup_dismissed', 'true');
    }
};

window.submitLead = async (e) => {
    if (e) e.preventDefault();
    const btn = document.getElementById('lead-submit-btn');
    const name = document.getElementById('lead-name').value;
    const whatsapp = document.getElementById('lead-whatsapp').value;
    const age = document.getElementById('lead-age').value;

    console.log("Submitting to:", leadsCol.path);

    if (!name || !whatsapp || !age) return showToast("Please fill all fields");

    // Validate phone number - fallback to basic length check if library is unsure
    const isValid = iti ? (iti.isValidNumber() || whatsapp.trim().length > 7) : whatsapp.trim().length > 7;
    if (!isValid) {
        console.warn("[Popup] Phone validation failed:", { whatsapp, itiValid: iti?.isValidNumber() });
        return showToast("Please enter a valid WhatsApp number");
    }

    // Capture number - fallback to raw value if getNumber fails
    let fullNumber = iti ? iti.getNumber() : whatsapp;
    console.log("[Popup] initial getNumber:", fullNumber);

    // Force country code inclusion
    if (iti) {
        const countryData = iti.getSelectedCountryData();
        const dialCode = countryData.dialCode;
        console.log("[Popup] Selected Dial Code:", dialCode);

        // Remove non-digits and leading zeros from the local part
        const cleanLocal = whatsapp.replace(/\D/g, '').replace(/^0+/, '');

        // If the number doesn't look like it has the dial code, construct it manually
        if (!fullNumber || !fullNumber.startsWith('+') || !fullNumber.includes(dialCode)) {
            console.log("[Popup] Constructing manual international number");
            fullNumber = `+${dialCode}${cleanLocal}`;
        }
    }

    if (!fullNumber || fullNumber === "") {
        fullNumber = whatsapp.trim();
    }

    console.log("[Popup] FINAL Captured number:", fullNumber);

    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const leadData = {
            name: name,
            whatsapp: fullNumber,
            age: parseInt(age) || 0,
            status: 'new',
            createdAt: new Date().toISOString()
        };

        await addDoc(leadsCol, leadData);

        // TRANSITION TO SUCCESS STATE
        const form = document.getElementById('lead-form');
        const imgBox = document.querySelector('.popup-image-box');
        const successState = document.getElementById('lead-success-state');
        const mainTitle = document.getElementById('popup-gift-title');
        const mainMsg = document.getElementById('popup-gift-msg');

        if (form) form.classList.add('hidden');
        if (imgBox) imgBox.classList.add('hidden');
        if (mainTitle) mainTitle.classList.add('hidden');
        if (mainMsg) mainMsg.classList.add('hidden');

        if (successState) {
            successState.classList.remove('hidden');
        }

        showToast("Success! Lead captured.");
        localStorage.setItem('popup_submitted', 'true');

        // Allow user to read the success message before auto-closing (if they don't click Continue)
        setTimeout(() => {
            // Only auto-close if the popup is still open
            if (document.getElementById('gift-popup-overlay')?.classList.contains('open')) {
                window.closeGiftPopup();
            }
        }, 8000); // 8 seconds to read the message
    } catch (err) {
        console.error("Lead Submission Error:", err);
        showToast("Submission Error: " + (err.message || "Please check connection"));
        btn.innerText = "Try Again";
        btn.disabled = false;
    }
};

// --- ADMIN LEAD MANAGEMENT ---
window.savePopupSettings = async () => {
    const title = document.getElementById('popup-title').value;
    const msg = document.getElementById('popup-msg').value;
    const img = document.getElementById('popup-img').value;
    const successTitle = document.getElementById('popup-success-title').value;
    const successMsg = document.getElementById('popup-success-msg').value;
    const btn = document.getElementById('popup-save-btn');

    if (!title) return showToast("Title is required");

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const snap = await getDocs(popupSettingsCol);
        const data = { title, msg, img, successTitle, successMsg };
        if (snap.empty) {
            await addDoc(popupSettingsCol, data);
        } else {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'popupSettings', snap.docs[0].id), data);
        }
        showToast("Popup Settings Updated");
        DATA.popupSettings = data;

        // Update Admin UI fields just in case
        document.getElementById('popup-success-title').value = successTitle;
        document.getElementById('popup-success-msg').value = successMsg;
    } catch (err) {
        console.error(err);
        showToast("Save Error");
    } finally {
        btn.innerText = "Update Popup";
        btn.disabled = false;
    }
};

window.landingSec1Selected = [];
window.landingSec2Selected = [];

window.searchLandingProducts = (sec, query) => {
    const dropdown = document.getElementById(`landing-${sec}-dropdown`);
    if (!dropdown) return;

    const selectedList = sec === 'sec1' ? window.landingSec1Selected : window.landingSec2Selected;
    let matches = DATA.p.filter(p => !p.id.startsWith('_') && !p.id.startsWith('-'));

    if (query && query.trim()) {
        matches = matches.filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()));
    }

    // Build category tabs using actual catId → name from DATA.c
    const catIds = [...new Set(matches.map(p => p.catId).filter(Boolean))];
    const activeCat = dropdown.dataset.activeCat || 'all';

    let filtered = matches;
    if (activeCat !== 'all') {
        filtered = matches.filter(p => p.catId === activeCat);
    }

    const tabBase = 'padding:3px 8px;border-radius:8px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;border:1px solid #e5e7eb;transition:all .2s;';
    const tabActive = tabBase + 'background:#000;color:#fff;border-color:#000;';
    const tabInactive = tabBase + 'background:#fff;color:#6b7280;';

    const catTabsHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid #f3f4f6;background:#f9fafb;position:sticky;top:0;z-index:10;">
            <button onclick="landingSetCat('${sec}','all')" style="${activeCat === 'all' ? tabActive : tabInactive}">All (${matches.length})</button>
            ${catIds.map(cid => { const cat = DATA.c.find(c => c.id === cid); const label = cat ? cat.name : cid; return `<button onclick="landingSetCat('${sec}','${cid}')" style="${activeCat === cid ? tabActive : tabInactive}">${label}</button>`; }).join('')}
        </div>`;

    if (filtered.length === 0) {
        dropdown.innerHTML = catTabsHTML + `<div style="padding:16px;text-align:center;font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-style:italic;">No products found</div>`;
    } else {
        const gridItems = filtered.map(p => {
            const isSelected = selectedList.includes(p.id);
            const wrapStyle = `position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border-radius:10px;cursor:pointer;transition:all .2s;border:2px solid ${isSelected ? '#000' : 'transparent'};background:${isSelected ? 'rgba(0,0,0,0.04)' : 'transparent'};`;
            const checkmark = isSelected ? `<div style="position:absolute;top:3px;right:3px;width:14px;height:14px;background:#000;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-check" style="color:#fff;font-size:7px;"></i></div>` : '';
            const nameStyle = `font-size:8px;font-weight:700;text-transform:uppercase;text-align:center;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:100%;`;
            return `
            <div onclick="${isSelected ? `removeLandingProduct('${sec}','${p.id}')` : `addLandingProduct('${sec}','${p.id}')`}" style="${wrapStyle}">
                ${checkmark}
                <img src="${getOptimizedUrl(p.img, 80)}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">
                <span style="${nameStyle}">${p.name}</span>
            </div>`;
        }).join('');
        dropdown.innerHTML = catTabsHTML + `<div style="padding:8px;"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">${gridItems}</div></div>`;
    }
    dropdown.classList.remove('hidden');
};

window.landingSetCat = (sec, cat) => {
    const dropdown = document.getElementById(`landing-${sec}-dropdown`);
    if (dropdown) dropdown.dataset.activeCat = cat;
    const query = document.getElementById(`landing-${sec}-search`)?.value || '';
    window.searchLandingProducts(sec, query);
};

window.addLandingProduct = (sec, id) => {
    const list = sec === 'sec1' ? window.landingSec1Selected : window.landingSec2Selected;
    if (!list.includes(id)) list.push(id);
    renderLandingPills(sec);
    // refresh grid to show checkmark
    const query = document.getElementById(`landing-${sec}-search`)?.value || '';
    window.searchLandingProducts(sec, query);
};

window.removeLandingProduct = (sec, id) => {
    if (sec === 'sec1') {
        window.landingSec1Selected = window.landingSec1Selected.filter(x => x !== id);
    } else {
        window.landingSec2Selected = window.landingSec2Selected.filter(x => x !== id);
    }
    renderLandingPills(sec);
    // refresh grid to remove checkmark
    const query = document.getElementById(`landing-${sec}-search`)?.value || '';
    window.searchLandingProducts(sec, query);
};

window.renderLandingPills = (sec) => {
    const list = sec === 'sec1' ? window.landingSec1Selected : window.landingSec2Selected;
    const container = document.getElementById(`landing-${sec}-pills`);
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `<span class="text-[9px] text-gray-400 italic font-bold">No products selected...</span>`;
        return;
    }

    container.innerHTML = list.map(id => {
        const p = DATA.p.find(x => x.id === id);
        if (!p) return '';
        return `
            <div class="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                <img src="${getOptimizedUrl(p.img, 50)}" class="w-4 h-4 rounded-full object-cover">
                <span class="text-[9px] font-bold uppercase truncate max-w-[120px]">${p.name}</span>
                <button type="button" onclick="removeLandingProduct('${sec}', '${id}')" class="text-gray-400 hover:text-red-500 ml-1">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `;
    }).join('');
};

window.populateLandingProductSelects = () => {
    // Legacy function, replaced by custom pill UI logic. Kept empty for compatibility with old calls.
};

window.populateLandingSettingsUI = () => {
    if (DATA.landingSettings) {
        if (document.getElementById('landing-announcement')) document.getElementById('landing-announcement').value = DATA.landingSettings.announcement || "";
        if (document.getElementById('landing-hero-mob')) document.getElementById('landing-hero-mob').value = DATA.landingSettings.heroMob || "img/";
        if (document.getElementById('landing-hero-desk')) document.getElementById('landing-hero-desk').value = DATA.landingSettings.heroDesk || "img/";
        if (document.getElementById('landing-sec1-title')) document.getElementById('landing-sec1-title').value = DATA.landingSettings.sec1Title || "";
        if (document.getElementById('landing-sec1-subtitle')) document.getElementById('landing-sec1-subtitle').value = DATA.landingSettings.sec1Subtitle || "";

        window.landingSec1Selected = DATA.landingSettings.sec1Products || [];
        renderLandingPills('sec1');

        if (document.getElementById('landing-sec2-title')) document.getElementById('landing-sec2-title').value = DATA.landingSettings.sec2Title || "";
        if (document.getElementById('landing-sec2-subtitle')) document.getElementById('landing-sec2-subtitle').value = DATA.landingSettings.sec2Subtitle || "";

        window.landingSec2Selected = DATA.landingSettings.sec2Products || [];
        renderLandingPills('sec2');
    }
};

window.saveLandingSettings = async () => {
    const announcement = document.getElementById('landing-announcement').value;
    const heroMob = document.getElementById('landing-hero-mob').value;
    const heroDesk = document.getElementById('landing-hero-desk').value;
    const sec1Title = document.getElementById('landing-sec1-title').value;
    const sec1Subtitle = document.getElementById('landing-sec1-subtitle').value;
    const sec1Products = window.landingSec1Selected || [];

    const sec2Title = document.getElementById('landing-sec2-title').value;
    const sec2Subtitle = document.getElementById('landing-sec2-subtitle').value;
    const sec2Products = window.landingSec2Selected || [];

    const btn = document.getElementById('landing-save-btn');

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const data = { announcement, heroMob, heroDesk, sec1Title, sec1Subtitle, sec1Products, sec2Title, sec2Subtitle, sec2Products };

        // Save using setDoc into the products collection to bypass potential new collection Firebase Rules
        const landRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_landing_settings_');
        await setDoc(landRef, data);

        showToast("Landing Page Settings Saved");
        DATA.landingSettings = data;
    } catch (err) {
        console.error(err);
        showToast("Save Error");
    } finally {
        btn.innerText = "Save Landing Page";
        btn.disabled = false;
    }
};

// Global mousedown to close dropdowns (mousedown fires before click, so dropdown items still register their click)
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#landing-sec1-search') && !e.target.closest('#landing-sec1-dropdown')) {
        document.getElementById('landing-sec1-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#landing-sec2-search') && !e.target.closest('#landing-sec2-dropdown')) {
        document.getElementById('landing-sec2-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#spotlight-product-search') && !e.target.closest('#spotlight-dropdown')) {
        document.getElementById('spotlight-dropdown')?.classList.add('hidden');
    }
});

/* ==============================================================================
   HOME PAGE (SPOTLIGHT) SETTINGS LOGIC
   ============================================================================== */

window.spotlightSelectedProducts = [];

window.addSpotlightProduct = (id) => {
    if (!window.spotlightSelectedProducts.includes(id)) {
        window.spotlightSelectedProducts.push(id);
    }
    const searchInput = document.getElementById('spotlight-product-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('spotlight-dropdown')?.classList.add('hidden');
    renderSpotlightPills();
};

window.removeSpotlightProduct = (id) => {
    window.spotlightSelectedProducts = window.spotlightSelectedProducts.filter(x => x !== id);
    renderSpotlightPills();
};

window.renderSpotlightPills = () => {
    const container = document.getElementById('spotlight-pills');
    if (!container) return;

    if (!window.spotlightSelectedProducts || window.spotlightSelectedProducts.length === 0) {
        container.innerHTML = `<span class="text-[9px] text-gray-400 italic font-bold">No products selected yet...</span>`;
        return;
    }

    container.innerHTML = window.spotlightSelectedProducts.map(id => {
        const p = DATA.p.find(x => x.id === id);
        if (!p) return '';
        return `
            <div class="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-sm transition-all hover:border-black group">
                <img src="${getOptimizedUrl(p.img, 50)}" class="w-5 h-5 rounded-lg object-cover shadow-sm bg-gray-50">
                <span class="text-[9px] font-black uppercase tracking-tight truncate max-w-[140px] text-gray-800">${p.name}</span>
                <button type="button" onclick="removeSpotlightProduct('${id}')" 
                    class="w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all ml-1">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `;
    }).join('');
};

window.searchSpotlightProducts = (query) => {
    const dropdown = document.getElementById('spotlight-dropdown');
    if (!query || query.trim().length < 1) {
        dropdown?.classList.add('hidden');
        return;
    }

    const q = query.toLowerCase().trim();
    const matches = DATA.p.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase() === q)
    ).slice(0, 8);

    if (matches.length === 0) {
        if (dropdown) {
            dropdown.innerHTML = `<div class="p-4 text-[10px] text-gray-400 font-bold uppercase italic text-center">No products found</div>`;
            dropdown.classList.remove('hidden');
        }
        return;
    }

    if (dropdown) {
        dropdown.innerHTML = matches.map(p => `
            <div onclick="addSpotlightProduct('${p.id}')" 
                 class="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors group">
                <img src="${getOptimizedUrl(p.img, 100)}" class="w-10 h-10 rounded-xl object-cover bg-gray-50 shadow-sm group-hover:scale-105 transition-transform">
                <div class="flex-1 min-w-0">
                    <div class="text-[10px] font-black uppercase text-gray-900 truncate">${p.name}</div>
                    <div class="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">${p.price} AED</div>
                </div>
                <i class="fa-solid fa-plus text-gray-300 group-hover:text-black mr-2 text-[10px]"></i>
            </div>
        `).join('');
        dropdown.classList.remove('hidden');
    }
};

window.populateHomeAdminUI = () => {

    if (DATA.homeSettings) {
        if (document.getElementById('spotlight-enabled')) document.getElementById('spotlight-enabled').checked = DATA.homeSettings.spotlightEnabled || false;
        if (document.getElementById('spotlight-title')) document.getElementById('spotlight-title').value = DATA.homeSettings.spotlightTitle || "";
        if (document.getElementById('spotlight-subtitle')) document.getElementById('spotlight-subtitle').value = DATA.homeSettings.spotlightSubtitle || "";
        if (document.getElementById('spotlight-cat-id')) document.getElementById('spotlight-cat-id').value = DATA.homeSettings.spotlightCatId || "";
        if (document.getElementById('spotlight-limit')) document.getElementById('spotlight-limit').value = DATA.homeSettings.spotlightLimit || 8;

        window.spotlightSelectedProducts = DATA.homeSettings.spotlightProducts || [];
        renderSpotlightPills();
    }
};

window.saveHomeSettings = async () => {
    const spotlightEnabled = document.getElementById('spotlight-enabled').checked;
    const spotlightTitle = document.getElementById('spotlight-title').value;
    const spotlightSubtitle = document.getElementById('spotlight-subtitle').value;
    const spotlightCatId = document.getElementById('spotlight-cat-id').value;
    const spotlightLimit = parseInt(document.getElementById('spotlight-limit').value) || 8;
    const spotlightProducts = window.spotlightSelectedProducts || [];

    const btn = document.getElementById('homepage-save-btn');
    if (btn) {
        btn.innerText = "Saving Configuration...";
        btn.disabled = true;
    }

    try {
        const data = { spotlightEnabled, spotlightTitle, spotlightSubtitle, spotlightCatId, spotlightLimit, spotlightProducts };

        const homeRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_home_settings_');
        await setDoc(homeRef, data);

        showToast("Home Page Settings Saved", "success");
        DATA.homeSettings = data;

        // Refresh home render to show changes
        renderHome();

    } catch (err) {
        console.error(err);
        showToast("Error Saving Settings", "error");
    } finally {
        if (btn) {
            btn.innerText = "Save Configuration";
            btn.disabled = false;
        }
    }
};

window.renderSpotlightSection = () => {
    const appMain = document.getElementById('app');
    const container = appMain ? appMain.querySelector('#spotlight-section') : null;
    if (!container) return;

    // Only show if we are on the main collections page (no filter, no search, no product detail open)
    const isProductDetail = new URLSearchParams(window.location.search).has('p');
    if (!DATA.homeSettings || !DATA.homeSettings.spotlightEnabled || state.filter !== 'all' || state.search || state.selectionId || isProductDetail) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    const { spotlightTitle, spotlightSubtitle, spotlightCatId, spotlightLimit, spotlightProducts: selectedIds } = DATA.homeSettings;

    // Only show if we have either a category or specific products
    if (!spotlightCatId && (!selectedIds || selectedIds.length === 0)) {
        container.classList.add('hidden');
        return;
    }

    // Get products
    const stockFilter = (items) => items.filter(p => p.inStock !== false);
    let spotlightProducts = [];

    // PRIORitize selected products
    if (selectedIds && selectedIds.length > 0) {
        spotlightProducts = selectedIds.map(id => DATA.p.find(p => p.id === id)).filter(Boolean);
    } else if (spotlightCatId) {
        spotlightProducts = stockFilter(DATA.p.filter(p => p.catId === spotlightCatId));
        // Limit to configured amount only if we are using the category auto-feed
        spotlightProducts = spotlightProducts.slice(0, spotlightLimit || 8);
    }

    const titleText = spotlightTitle || "Featured Spotlight";
    const subText = spotlightSubtitle || "";

    const html = `
        <div class="mt-8 pt-8 md:mt-20 md:pt-12 border-t border-gray-50">
            <!-- MODERN CATEGORY HEADER (Centered) -->
            <div class="relative w-full flex items-center justify-center mb-6 md:mb-12 mt-0 fade-in min-h-0 md:min-h-[90px]">
                <div class="text-center px-4 w-full md:px-48">
                    <h3 class="font-black capitalize tracking-wide text-gray-900"
                        style="font-family: 'Poppins', sans-serif; font-size: clamp(26px, 4vw, 38px); margin-top: 0; margin-bottom: 0; line-height: 1.1;">
                        ${titleText}
                    </h3>
                    ${subText ? `
                    <p class="font-normal capitalize text-gray-400"
                        style="font-family: 'Poppins', sans-serif; font-size: clamp(12px, 2vw, 16px); margin-top: 0.4rem; letter-spacing: 1px;">
                        ${subText}
                    </p>` : ''}
                </div>
                <!-- Interactive Swipe Indicator (Mobile Only) -->
                <div class="md:hidden absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-300 pointer-events-none" style="animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
                    <span class="text-[8px] font-black uppercase tracking-[0.2em]">Swipe</span>
                    <i class="fa-solid fa-chevron-right text-[9px] translate-y-[0.5px]"></i>
                </div>
            </div>
            
            <style>
                /* Prevent horizontal scrollbar purely on mobile */
                .spotlight-mobile-scroll::-webkit-scrollbar { display: none; }
                .spotlight-mobile-scroll { -ms-overflow-style: none; scrollbar-width: none; }
                
                /* Explicit responsive toggles */
                @media (max-width: 767px) {
                    .spotlight-desktop-grid { display: none !important; }
                    .spotlight-mobile-flex { display: flex !important; }
                }
                @media (min-width: 768px) {
                    .spotlight-desktop-grid { display: grid !important; }
                    .spotlight-mobile-flex { display: none !important; }
                }
            </style>
            
            <!-- MOBILE SWIPE VIEW -->
            <div class="spotlight-mobile-flex related-scroll-wrapper snap-x pb-4 spotlight-mobile-scroll">
                ${spotlightProducts.map(p => {
        const pImg = [p.img, ...(p.images || []), p.img2, p.img3].find(u => u && u !== 'img/') || 'img/';
        const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
        return `
                    <div class="product-card group flex-shrink-0 w-[160px] sm:w-[200px] snap-start" data-id="${p.id}" style="margin-right: 12px;"
                         onmouseenter="window.preloadProductImage('${p.id}')" onclick="viewDetail('${p.id}')">
                        <div class="img-container mb-4 shadow-sm relative">
                            ${badgeHtml}
                            <img src="${getOptimizedUrl(pImg, 600)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="window.handleImgError(this)" alt="${p.name}">
                        </div>
                        <div class="px-1 text-left flex justify-between items-start mt-4">
                            <div class="flex-1 min-w-0">
                                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                                ${(() => {
                const origPrice = parseFloat(p.originalPrice); const salePrice = parseFloat(p.price);
                if (p.originalPrice && origPrice > salePrice) {
                    const disc = Math.round((1 - salePrice / origPrice) * 100);
                    return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                        '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + p.originalPrice + ' AED</span>' +
                        '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + p.price + ' AED</span>' +
                        '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span></div>';
                }
                return '<p class="price-tag mt-2 font-bold">' + p.price + ' AED</p>';
            })()}
                            </div>
                        </div>
                    </div>`;
    }).join('')}
            </div>

            <!-- DESKTOP GRID VIEW -->
            <div class="spotlight-desktop-grid md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 mt-4 px-0" style="column-gap: 23px; row-gap: 32px;">
                ${spotlightProducts.map(p => {
        const pImg = [p.img, ...(p.images || []), p.img2, p.img3].find(u => u && u !== 'img/') || 'img/';
        const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
        return `
                    <div class="product-card group" data-id="${p.id}" 
                         onmouseenter="window.preloadProductImage('${p.id}')" onclick="viewDetail('${p.id}')">
                        <div class="img-container mb-4 shadow-sm relative">
                            ${badgeHtml}
                            <img src="${getOptimizedUrl(pImg, 600)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="window.handleImgError(this)" alt="${p.name}">
                        </div>
                        <div class="px-1 text-left flex justify-between items-start mt-4">
                            <div class="flex-1 min-w-0">
                                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                                ${(() => {
                const origPrice = parseFloat(p.originalPrice); const salePrice = parseFloat(p.price);
                if (p.originalPrice && origPrice > salePrice) {
                    const disc = Math.round((1 - salePrice / origPrice) * 100);
                    return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                        '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + p.originalPrice + ' AED</span>' +
                        '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + p.price + ' AED</span>' +
                        '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span></div>';
                }
                return '<p class="price-tag mt-2 font-bold">' + p.price + ' AED</p>';
            })()}
                            </div>
                        </div>
                    </div>`;
    }).join('')}
            </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    container.classList.remove('hidden');
};

window.renderAdminLeads = async () => {
    const container = document.getElementById('admin-leads-list');
    if (!container) return;

    // Check if Auth has initialized. If not, wait.
    if (!state.authUser && getAuth().currentUser === null) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-gray-300 animate-pulse"><i class="fa-solid fa-cloud-arrow-down text-3xl mb-4"></i><p class="text-[10px] font-bold uppercase tracking-widest">Verifying Admin Access...</p></div>';
        setTimeout(() => renderAdminLeads(), 1000); // Retry automatically after 1s
        return;
    }

    container.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-gray-300 animate-pulse"><i class="fa-solid fa-cloud-arrow-down text-3xl mb-4"></i><p class="text-[10px] font-bold uppercase tracking-widest">Fetching live leads...</p></div>';

    try {
        console.log("[Admin] Fetching leads from:", leadsCol.path);
        const snap = await getDocs(leadsCol);
        DATA.leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        DATA.leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        console.log(`[Admin] Successfully fetched ${DATA.leads.length} leads.`);

        if (DATA.leads.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-40 bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-100">
                    <i class="fa-solid fa-users-slash text-gray-200 text-3xl mb-6"></i>
                    <h3 class="text-gray-900 font-bold text-[12px] uppercase tracking-widest mb-2">No Leads Collected</h3>
                    <p class="text-gray-400 text-[10px] max-w-xs mx-auto">New gift claim entries will appear here automatically as customers fill out the popup.</p>
                </div>`;
            return;
        }

        container.innerHTML = DATA.leads.map(lead => {
            const dateObj = new Date(lead.createdAt);
            const displayDate = isNaN(dateObj) ? 'Recently' : dateObj.toLocaleString('en-AE', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
            });

            const leadWhatsApp = lead.whatsapp || 'No Number';

            return `
            <div class="lead-row fade-in">
                <div class="lead-info">
                    <h4>${lead.name || 'Anonymous User'}</h4>
                    <p class="flex items-center gap-2">
                        <span class="text-black font-bold">${leadWhatsApp}</span>
                        <span class="w-1 h-1 bg-gray-200 rounded-full"></span>
                        <span>${lead.age || 0} Years</span>
                    </p>
                    <span class="lead-date">${displayDate}</span>
                </div>
                <div class="flex gap-2">
                    <a href="https://wa.me/${lead.whatsapp.replace(/\D/g, '')}" target="_blank" 
                       class="w-12 h-12 rounded-2xl bg-green-50 text-green-500 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all shadow-sm">
                        <i class="fa-brands fa-whatsapp text-lg"></i>
                    </a>
                    <button onclick="deleteLead('${lead.id}')" 
                            class="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm">
                        <i class="fa-solid fa-trash-can text-sm"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');
    } catch (err) {
        console.error("[Admin] Lead Load Error:", err);
        container.innerHTML = `
            <div class="p-10 text-center bg-red-50 rounded-[2rem] border border-red-100">
                <i class="fa-solid fa-triangle-exclamation text-red-400 text-2xl mb-4"></i>
                <p class="text-red-500 font-bold text-[11px] uppercase tracking-widest">Connection Error</p>
                <p class="text-red-300 text-[9px] mt-2">Could not sync with leads collection. Please check your internet or Firebase permissions.</p>
                <button onclick="renderAdminLeads()" class="mt-4 px-6 py-2 bg-red-500 text-white rounded-full text-[9px] font-bold uppercase tracking-widest">Retry Sync</button>
            </div>`;
    }
};

window.deleteLead = async (id) => {
    if (!confirm("Delete this lead?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leads', id));
        showToast("Lead Deleted");
        renderAdminLeads();
    } catch (err) { showToast("Delete Error"); }
};

window.exportLeadsExcel = () => {
    if (DATA.leads.length === 0) return showToast("No leads to export");

    let csv = "Name,WhatsApp,Age,Created At\n";
    DATA.leads.forEach(l => {
        csv += `"${l.name}","${l.whatsapp}",${l.age},"${l.createdAt}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

window.resetInsightsData = async () => {
    if (!confirm("Are you sure you want to reset all Insights data? This will clear all visit counts, product views, and leads forever.")) return;

    if (typeof showToast === 'function') showToast("Resetting insights...", "info");
    const topBtn = document.getElementById('update-range-btn');
    if (topBtn) { topBtn.disabled = true; topBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Resetting...'; }
    try {
        const batch1 = writeBatch(db);
        const globalStatsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        batch1.set(globalStatsRef, {
            adVisits: 0, normalVisits: 0, adProductClicks: 0, normalProductClicks: 0,
            adInquiries: 0, imageLoadFail: 0, totalSessionSeconds: 0, brokenImages: []
        }, { merge: true });
        await batch1.commit();

        let batch = writeBatch(db);
        let batchCount = 0;

        const commitBatch = async () => {
            if (batchCount > 0) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        };

        // Fetch and Delete ALL daily_stats
        const dsRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_stats');
        const dsSnap = await getDocs(dsRef);
        for (const docSnap of dsSnap.docs) {
            batch.delete(docSnap.ref);
            batchCount++;
            if (batchCount === 400) await commitBatch();
        }

        // Fetch and Delete ALL daily_product_stats
        const dpsRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats');
        const dpsSnap = await getDocs(dpsRef);
        for (const docSnap of dpsSnap.docs) {
            batch.delete(docSnap.ref);
            batchCount++;
            if (batchCount === 400) await commitBatch();
        }

        // Reset All-Time Per-Product Stats
        const products = DATA.p || [];
        for (const p of products) {
            const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
            batch.set(pRef, { views: 0, adViews: 0, adInquiries: 0, adImpressions: 0 }, { merge: true });
            batchCount++;
            if (batchCount === 400) await commitBatch();
        }

        await commitBatch();

        if (typeof showToast === 'function') showToast("Insights reset successfully!", "success");

        // Local Sync & Refresh
        await refreshData();
        // Recover Insights
        const iList = document.getElementById('admin-insights-list');
        if (iList) renderInsights(iList);

    } catch (e) {
        console.error("Reset Error Details:", e.code, e.message);
        if (typeof showToast === 'function') showToast(`Reset failed: ${e.code || 'See console'}`, "error");
    } finally {
        if (topBtn) { topBtn.disabled = false; topBtn.innerText = 'Update View'; }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// FAST-PATH: Search-only render (skips category row, mega menu, slider, SEO)
// Called by applyCustomerSearch to avoid full renderHome on every keystroke.
// ─────────────────────────────────────────────────────────────────────────────
function renderSearchResults() {
    try {
        const appMain = document.getElementById('app');
        if (!appMain) return;

        const grid = appMain.querySelector('#product-grid');
        if (!grid) {
            // Grid not present yet — fall back to full render
            renderHome();
            return;
        }

        // Enter search mode — hides badges, slider, category row (instant, CSS-driven)
        enterSearchMode();

        // Hide category + sort elements inside #app
        const catContainer = appMain.querySelector('#category-selector-container');
        if (catContainer) catContainer.classList.add('hidden');
        const catScroll = appMain.querySelector('.category-scroll-container');
        if (catScroll) catScroll.classList.add('hidden');
        const mobSortBar = appMain.querySelector('.md\\:hidden.mb-6.px-1');
        if (mobSortBar) mobSortBar.classList.add('hidden');

        // Filter products by current search query
        const q = (state.search || '').toLowerCase().trim();
        const words = q.split(' ').filter(w => w.length > 0);
        const stockFilter = (items) => items.filter(p => p.inStock !== false);
        let filtered = stockFilter(DATA.p);

        if (words.length > 0) {
            filtered = filtered.filter(p => {
                const name = (p.name || '').toLowerCase();
                const keywords = (p.keywords || '').toLowerCase();
                const catObj = DATA.c.find(c => c.id === p.catId);
                const catName = catObj ? catObj.name.toLowerCase() : '';
                return words.every(word => name.includes(word) || catName.includes(word) || keywords.includes(word));
            });
        }

        // Sort: pinned first, then newest
        filtered.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            if (state.sort !== 'all') {
                const priceA = parseFloat(a.price) || 0;
                const priceB = parseFloat(b.price) || 0;
                return state.sort === 'low' ? priceA - priceB : priceB - priceA;
            }
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        const cols = getColumnsCount();
        const limit = state.visibleChunks * (cols * 2);
        const visibleProducts = filtered.slice(0, limit);
        const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

        let gridContent = '';
        if (filtered.length === 0) {
            gridContent = `
            <div class="col-span-full text-center py-40 px-6">
                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fa-solid fa-magnifying-glass text-gray-200 text-xl"></i>
                </div>
                <h3 class="text-gray-900 font-bold text-[14px] mb-2 uppercase tracking-widest">No Results Found</h3>
                <p class="text-gray-400 text-[11px] mb-8 max-w-xs mx-auto">Try a different keyword or browse our categories.</p>
                <button onclick="window.clearCustomerSearch()" class="bg-black text-white px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-105 active:scale-95 transition-all">
                    Clear Search
                </button>
            </div>`;
        } else {
            gridContent = visibleProducts.map((p, idx) => {
                const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
                return `
                <div class="product-card group ${idx < 4 ? '' : 'fade-in'} ${state.selected.includes(p.id) ? 'selected' : ''} ${isInWishlist(p.id) ? 'wish-active' : ''}" data-id="${p.id}"
                     onmouseenter="window.preloadProductImage('${p.id}')"
                     onclick="viewDetail('${p.id}', false, null)">
                    <div class="img-container mb-4 shadow-sm relative">
                        ${badgeHtml}
                        <div class="wish-btn shadow-sm hidden-desktop" onclick="toggleWishlist(event, '${p.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
                        <div class="select-btn shadow-sm" onclick="toggleSelect(event, '${p.id}')"><i class="fa-solid fa-check text-[10px]"></i></div>
                        <img src="${getOptimizedUrl(p.img, 600)}"
                             class="${idx < 4 ? 'no-animation' : ''}"
                             ${idx < 8 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                             decoding="async"
                             onload="this.classList.add('loaded')"
                             alt="${p.name}">
                    </div>
                    <div class="px-1 text-left flex justify-between items-start mt-4">
                        <div class="flex-1 min-w-0">
                            <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                            <p class="price-tag mt-2 font-bold">${p.price} AED</p>
                        </div>
                        <div class="wish-btn desktop-wish-fix hidden-mobile" onclick="toggleWishlist(event, '${p.id}')">
                            <i class="fa-solid fa-heart"></i>
                        </div>
                    </div>
                </div>`;
            }).join('');

            // Ghost cards to fill last row
            const remainder = visibleProducts.length % cols;
            if (remainder > 0 && filtered.length <= limit) {
                const ghosts = cols - remainder;
                for (let g = 0; g < ghosts; g++) {
                    gridContent += `<div style="visibility:hidden;pointer-events:none;" aria-hidden="true"><div style="aspect-ratio:4/5;width:100%;"></div></div>`;
                }
            }
        }

        // Prevent layout jump by locking current height
        const currentHeight = grid.offsetHeight;
        if (currentHeight > 0) grid.style.minHeight = `${currentHeight}px`;

        // Update load-more button (calculate before rAF so values are captured)
        const hasMore = filtered.length > limit;

        // Use requestAnimationFrame to not block the keyboard
        // IMPORTANT: load-more button update is INSIDE rAF so it stays in sync with grid render
        requestAnimationFrame(() => {
            grid.innerHTML = gridContent;
            setTimeout(() => { grid.style.minHeight = ''; }, 600);

            // Update load-more button AFTER grid is rendered
            const loadMoreContainer = document.getElementById('load-more-container');
            if (loadMoreContainer) {
                if (hasMore) {
                    loadMoreContainer.innerHTML = `<button onclick="window.loadMoreProducts()" class="bg-black text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group view-more-btn-custom">View More <i class="fa-solid fa-arrow-down transform group-hover:translate-y-1 transition-transform"></i></button>`;
                    loadMoreContainer.style.display = 'flex';
                } else if (state.visibleChunks > 1) {
                    loadMoreContainer.innerHTML = `<button onclick="window.showLessProducts()" class="bg-black text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group view-more-btn-custom">Show Less <i class="fa-solid fa-arrow-up transform group-hover:-translate-y-1 transition-transform"></i></button>`;
                    loadMoreContainer.style.display = 'flex';
                } else {
                    loadMoreContainer.style.display = 'none';
                }
            }
        });

        // Update slider visibility for search state
        renderSlider();

    } catch (e) {
        console.error('[renderSearchResults] Error:', e);
        // Safe fallback
        renderHome();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MODE — Enter/Exit helpers (professional e-commerce UX)
// ─────────────────────────────────────────────────────────────────────────────
function enterSearchMode() {
    // Always add the class — hides trust badges + slider on ALL screen sizes via CSS
    document.body.classList.add('search-mode');

    // Mobile-only: also hide category row + sort bar from DOM
    if (window.innerWidth < 768) {
        const catContainer = document.getElementById('category-selector-container');
        if (catContainer) catContainer.classList.add('hidden');
        const catScroll = document.querySelector('.category-scroll-container');
        if (catScroll) catScroll.classList.add('hidden');
        const sortBar = document.querySelector('.desktop-select-actions');
        if (sortBar) sortBar.classList.add('hidden');
    }
}

function exitSearchMode() {
    document.body.classList.remove('search-mode');
    // Restore elements hidden by enterSearchMode — renderHome() will fully rebuild them
    // but we proactively un-hide for instant visual feedback
    const catContainer = document.getElementById('category-selector-container');
    if (catContainer) catContainer.classList.remove('hidden');
    const catScroll = document.querySelector('.category-scroll-container');
    if (catScroll) catScroll.classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT: Attach search input listeners exactly ONCE (not on every renderHome)
// ─────────────────────────────────────────────────────────────────────────────
let _searchListenersInit = false;
function initSearchListeners() {
    if (_searchListenersInit) return;
    _searchListenersInit = true;

    // Mobile main search
    const mobileSearch = document.getElementById('customer-search');
    if (mobileSearch) {
        mobileSearch.addEventListener('input', (e) => {
            window.applyCustomerSearch(e.target.value);
        });
        mobileSearch.addEventListener('focus', () => {
            enterSearchMode();
        });
        mobileSearch.addEventListener('blur', () => {
            // Small delay so tapping a product card still works
            setTimeout(() => {
                if (!state.search) exitSearchMode();
            }, 200);
        });
    }

    // Desktop nav search
    const desktopSearch = document.getElementById('desk-search');
    if (desktopSearch) {
        desktopSearch.addEventListener('input', (e) => {
            window.applyCustomerSearch(e.target.value);
        });
        desktopSearch.addEventListener('focus', () => {
            enterSearchMode();
        });
        desktopSearch.addEventListener('blur', () => {
            setTimeout(() => {
                if (!state.search) exitSearchMode();
            }, 200);
        });
    }
}

initPopup();
// Removed redundant startSync call to prevent session override bugs.
// Attach search listeners once the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchListeners);
} else {
    initSearchListeners();
}

// ============================================================================
// CUSTOMER AUTHENTICATION & PROFILE
// ============================================================================

window.openAuthModal = () => {
    if (state.authUser) {
        document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
        document.getElementById('auth-account-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    } else {
        document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
        document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        state.authMode = 'login';
        window.updateAuthUI();
    }
    document.body.style.overflow = 'hidden';
};

window.closeAuthModals = () => {
    document.getElementById('auth-modal-overlay')?.classList.remove('opacity-100', 'pointer-events-auto');
    document.getElementById('auth-login-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.getElementById('auth-account-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    document.body.style.overflow = 'auto';
};

window.handleUserAuthClick = () => {
    window.openAuthModal();
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
        nameGroup.classList.add('hidden');
        forgotWrap.classList.remove('hidden');
        submitBtn.innerHTML = `Sign In <i class="fa-solid fa-arrow-right text-[10px]"></i>`;
        toggleText.innerText = "Don't have an account?";
        toggleBtn.innerText = "Sign Up";
    } else {
        title.innerText = 'Create Account';
        subtitle.innerText = 'Join us today';
        nameGroup.classList.remove('hidden');
        forgotWrap.classList.add('hidden');
        submitBtn.innerHTML = `Sign Up <i class="fa-solid fa-user-plus text-[10px]"></i>`;
        toggleText.innerText = "Already have an account?";
        toggleBtn.innerText = "Sign In";
    }
};

window.handleAuthSubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-submit-btn');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();

    if (!email || !password) return showToast("Please fill all fields");

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

    try {
        if (state.authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Welcome Back!");
        } else {
            if (!name) throw new Error("Please enter your name");
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: name });
            showToast("Account Created!");
        }
        window.closeAuthModals();
        document.getElementById('auth-form').reset();
    } catch (err) {
        console.error("Auth Error:", err);
        showToast(err.message.replace("Firebase:", "").trim() || "Authentication Failed");
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
        showToast("Logged in with Google!");
    } catch (err) {
        console.error("Google Auth Error:", err);
        showToast("Sign-In Failed or Cancelled");
    }
};

window.handleForgotPassword = async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) {
        return showToast("Enter your email address in the field to reset password");
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset email sent! Check your inbox.");
    } catch (err) {
        showToast("Error: " + err.message.replace("Firebase:", "").trim());
    }
};

window.handleSignOut = async () => {
    try {
        await signOut(auth);
        window.closeAuthModals();
        // Since Firebase automatically signs out the real user, onAuthStateChanged 
        // will fire. We need to fall back to an anonymous session so they can still browse.
        // Removed redundant startSync inside auth submissions to maintain single session flow.        state.wishlist = []; // Clear for security
        updateWishlistBadge();
        showToast("Signed Out Successfully");
    } catch (err) {
        showToast("Error signing out");
    }
};

// ============================================================================
// CUSTOMER PASSWORD RESET FLOW
// ============================================================================

window.handlePasswordResetFlow = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    if (mode === 'resetPassword' && oobCode) {
        try {
            // Verify link validity before showing modal to prevent confusing users with dead links
            await verifyPasswordResetCode(auth, oobCode);

            // Link is valid, show Reset Modal
            document.getElementById('auth-modal-overlay')?.classList.add('opacity-100', 'pointer-events-auto');
            const resetModal = document.getElementById('auth-reset-modal');
            if (resetModal) {
                resetModal.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
                document.getElementById('auth-reset-oobCode').value = oobCode;
            }
            document.body.style.overflow = 'hidden';

        } catch (err) {
            console.error("Reset Code Error:", err);
            showToast("Password reset link is invalid or expired.");
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

window.handlePasswordResetFormSubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-reset-submit-btn');
    const newPassword = document.getElementById('auth-reset-new-password').value;
    const oobCode = document.getElementById('auth-reset-oobCode').value;

    if (!newPassword || newPassword.length < 6) return showToast("Password must be at least 6 characters");

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

    try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        showToast("Password Reset Successfully! Please login.");

        // Clean up URL and UI
        window.history.replaceState({}, document.title, window.location.pathname);
        document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');

        // Open standard login window automatically
        state.authMode = 'login';
        window.updateAuthUI();
        document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        document.getElementById('auth-reset-form').reset();

    } catch (err) {
        showToast(err.message.replace("Firebase:", "").trim() || "Failed to reset password");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// Check for reset links on boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handlePasswordResetFlow);
} else {
    handlePasswordResetFlow();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handlePasswordResetFlow);
} else {
    handlePasswordResetFlow();
}
