import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc, setDoc, increment, writeBatch } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = firebaseConfig.projectId;

const prodCol = collection(db, 'artifacts', appId, 'public', 'data', 'products');
const catCol = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
const shareCol = collection(db, 'artifacts', appId, 'public', 'data', 'selections');
const sliderCol = collection(db, 'artifacts', appId, 'public', 'data', 'sliders');

let DATA = { p: [], c: [], s: [], stats: { adVisits: 0 } };
let state = { filter: 'all', sort: 'all', search: '', user: null, selected: [], wishlist: [], selectionId: null, scrollPos: 0, currentVar: null };
let clicks = 0, lastClickTime = 0;

// AD TRACKING HELPERS
window.trackWhatsAppInquiry = async (id) => {
    console.log(`[Ad Tracking] WhatsApp Inquiry: ${id}`);
    if (window.gtag) {
        window.gtag('event', 'whatsapp_inquiry', { 'product_id': id });
    }

    // Record Ad Inquiry (Conversion)
    if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
        try {
            console.log(`[Ad Tracking] Recording Inquiry for ${id}...`);
            // Update Global Stats
            const globalStatsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
            await setDoc(globalStatsRef, { adInquiries: increment(1) }, { merge: true });

            // Update Product-Specific Inquiries if it's a single product
            if (id !== 'bulk_inquiry') {
                const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', id);
                await updateDoc(pRef, { adInquiries: increment(1) });
            }
            console.log("[Ad Tracking] Inquiry recorded successfully.");
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
    console.log("Global Doc in DB Fetch:", DATA.p.find(p => p.id === '_ad_stats_'));
    const testProd = DATA.p.find(p => p.adInquiries > 0);
    console.log("Example Product with Inquiries:", testProd ? `${testProd.name}: ${testProd.adInquiries}` : "None found yet");
    console.log("-------------------------");
};

// REFERRAL DETECTION
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('gclid') || urlParams.get('utm_source') === 'google') {
    sessionStorage.setItem('traffic_source', 'Google Ads');
} else if (urlParams.has('utm_source')) {
    sessionStorage.setItem('traffic_source', urlParams.get('utm_source'));
}

async function trackAdVisit() {
    const sessionKey = 'ad_visit_tracked_v3';
    if (sessionStorage.getItem(sessionKey)) return;
    try {
        console.log("[Ad Tracking] Attempting to record visit in products/_ad_stats_...");
        // Path: artifacts/speed-catalogue/public/data/products/_ad_stats_
        // Using 'products' collection because write permissions are confirmed there
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(statsRef, { adVisits: increment(1) }, { merge: true });
        sessionStorage.setItem(sessionKey, 'true');
        console.log("[Ad Tracking] SUCCESS: Visit recorded.");
    } catch (e) {
        console.error("[Ad Tracking] PERMISSION DENIED: Still blocked by Firebase Rules.", e);
    }
}

const startSync = async () => {
    try { await signInAnonymously(auth); }
    catch (err) { console.error(err); }
};

onAuthStateChanged(auth, async (u) => {
    state.user = u;
    if (u) {
        // Track Ad Visit once authenticated
        if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
            await trackAdVisit();
        }
        await loadWishlist();
        // Since we refreshData at start, this might be redundant but keeps state synced for logged in users
        await refreshData();
    }
});

const handleReentry = () => {
    if (DATA.p.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const pId = urlParams.get('p');
        if (pId) viewDetail(pId, true);
        else renderHome();
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
};


async function loadWishlist() {
    if (!state.user) return;
    try {
        const wishDoc = await getDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'));
        if (wishDoc.exists()) {
            state.wishlist = wishDoc.data().ids || [];
            updateWishlistBadge();
        }
    } catch (err) { console.error("Wishlist Load Error"); }
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

    if (state.filter === 'wishlist') renderHome();
    if (document.getElementById('favorites-sidebar')?.classList.contains('open')) renderFavoritesSidebar();

    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'data', 'wishlist'), { ids: state.wishlist });
    } catch (err) { showToast("Sync Error"); }
};

async function refreshData(isNavigationOnly = false) {
    try {
        if (!isNavigationOnly || DATA.p.length === 0) {
            const [pSnap, cSnap, sSnap] = await Promise.all([
                getDocs(prodCol),
                getDocs(catCol),
                getDocs(sliderCol).catch(e => {
                    console.error("Slider fetch failed:", e);
                    return { docs: [] };
                })
            ]);
            DATA.p = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            DATA.c = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            DATA.s = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Extract stats from products collection
            const statsDoc = DATA.p.find(p => p.id === '_ad_stats_');
            DATA.stats = statsDoc || { adVisits: 0 };
            // Remove the stats document and any other internal stats docs from the products list
            DATA.p = DATA.p.filter(p => p.id !== '_ad_stats_' && p.id !== '--global-stats--');
            console.log("[Ad Tracking] UI Refreshed. Counter is now:", DATA.stats.adVisits);
        }
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('s');
        const prodId = urlParams.get('p');
        const catId = urlParams.get('c');
        const query = urlParams.get('q');
        const isAdminOpen = !document.getElementById('admin-panel').classList.contains('hidden');

        // Sync state from URL
        state.filter = catId || 'all';
        state.search = query || '';

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
        renderAdminUI();


        // Preload in background (non-blocking)
        const iconsToLoad = DATA.c.map(c => getOptimizedUrl(c.img)).filter(u => u && u !== 'img/').slice(0, 10);
        const stockFilter = (items) => items.filter(p => p.inStock !== false);
        let filteredForPreload = [];
        if (state.selectionId) filteredForPreload = DATA.p.filter(p => state.selected.includes(p.id));
        else if (state.filter === 'wishlist') filteredForPreload = DATA.p.filter(p => state.wishlist.includes(p.id));
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
    } catch (e) { console.warn("Nav Error"); }
};

window.handleLogoClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 5000) clicks = 0;
    clicks++; lastClickTime = now;
    if (clicks >= 5) {
        const btn = document.getElementById('admin-entry-btn');
        const hideBtn = document.getElementById('admin-hide-btn');
        if (btn) {
            btn.classList.remove('hidden');
            if (hideBtn) hideBtn.classList.remove('hidden');
            showToast("Dashboard Unlocked");
            renderHome(); // Re-render to show pin icons
        }
        clicks = 0;
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
    if (state.filter === 'wishlist') currentVisible = DATA.p.filter(p => state.wishlist.includes(p.id));
    else if (state.filter !== 'all') currentVisible = stockFilter(DATA.p.filter(p => p.catId === state.filter));
    else currentVisible = stockFilter(DATA.p);
    const visibleIds = currentVisible.map(p => p.id);
    const allVisibleSelected = visibleIds.every(id => state.selected.includes(id));
    if (allVisibleSelected) state.selected = state.selected.filter(id => !visibleIds.includes(id));
    else state.selected = Array.from(new Set([...state.selected, ...visibleIds]));
    renderHome();
};

function renderHome() {
    try {
        const appMain = document.getElementById('app');
        const template = document.getElementById('home-view-template');
        if (!appMain || !template) return;

        // Simple check: If product grid is absent, load the template
        // This ensures we always have the UI structure.
        if (!appMain.querySelector('#product-grid')) {
            appMain.innerHTML = template.innerHTML;
        }

        // SELECT ALL ELEMENTS AFTER INJECTION
        const catRow = appMain.querySelector('#category-row');
        const grid = appMain.querySelector('#product-grid');
        const selectionHeader = appMain.querySelector('#selection-header');
        const viewTitle = appMain.querySelector('#view-title');
        const viewSubtitle = appMain.querySelector('#view-subtitle');
        const selectAllBtn = appMain.querySelector('#select-all-btn');
        const activeCatTitle = appMain.querySelector('#active-category-title');
        const activeCatTitleMob = appMain.querySelector('#active-category-title-mob');
        const categorySelector = appMain.querySelector('#category-selector-container');
        const discSearch = appMain.querySelector('#customer-search');
        const clearBtn = appMain.querySelector('#clear-search-btn');
        const mobileSort = appMain.querySelector('#price-sort-mob');

        // 1. Handle selection/wishlist headers
        if (state.selectionId) {
            if (selectionHeader) selectionHeader.classList.remove('hidden');
            if (catRow) catRow.classList.add('hidden');
            if (categorySelector) categorySelector.classList.add('hidden');
            if (viewTitle) viewTitle.innerText = "Shared Selection";
            if (viewSubtitle) viewSubtitle.innerText = "Specially picked items for you.";
        } else if (state.filter === 'wishlist') {
            if (selectionHeader) selectionHeader.classList.remove('hidden');
            if (catRow) catRow.classList.add('hidden');
            if (categorySelector) categorySelector.classList.add('hidden');
            if (viewTitle) viewTitle.innerText = "Your Favorites";
            if (viewSubtitle) viewSubtitle.innerText = "Items you've saved to your favorites.";
        } else {
            if (selectionHeader) selectionHeader.classList.add('hidden');
            if (catRow) catRow.classList.remove('hidden');
            if (categorySelector) categorySelector.classList.remove('hidden');

            let cHtml = `<div class="category-item ${state.filter === 'all' ? 'active' : ''}" onclick="applyFilter('all', event)"><div class="category-img-box flex items-center justify-center bg-gray-50 text-[10px] font-black text-gray-300">All</div><p class="category-label">Explore</p></div>`;
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
                        <img src="${getOptimizedUrl(c.img, 200)}" onerror="this.src='https://placehold.co/100x100?text=Gift'">
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
        else if (state.filter === 'wishlist') filtered = DATA.p.filter(p => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === p.id));
        else if (state.filter !== 'all') filtered = stockFilter(DATA.p.filter(p => p.catId === state.filter));
        else filtered = stockFilter(DATA.p);

        if (state.search) {
            const q = state.search.toLowerCase().trim();
            const words = q.split(' ').filter(w => w.length > 0);

            let source = (state.selectionId || state.filter === 'wishlist') ? filtered : stockFilter(DATA.p);

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
        let catNameDisplay = "All Collections";
        if (state.selectionId) catNameDisplay = "Shared Selection";
        else if (state.filter === 'wishlist') catNameDisplay = "Favorites List";
        else if (state.filter !== 'all') {
            const catObj = DATA.c.find(c => c.id === state.filter);
            if (catObj) catNameDisplay = catObj.name;
        }
        if (activeCatTitle) activeCatTitle.innerText = catNameDisplay;
        if (activeCatTitleMob) activeCatTitleMob.innerText = catNameDisplay;

        // Dynamic Page Title for Ads/SEO
        document.title = `${catNameDisplay} | Speed Gifts Website`;
        if (selectAllBtn) {
            const visibleIds = filtered.map(p => p.id);
            const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selected.includes(id));
            selectAllBtn.innerText = allVisibleSelected ? "Deselect Visible" : "Select Visible Items";
            if (state.selectionId) selectAllBtn.parentElement?.classList.add('hidden');
        }
        if (grid) {
            const isInWishlist = (pid) => state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === pid);

            grid.innerHTML = filtered.map((p, idx) => {
                let displayP = { ...p };
                let savedVar = null;
                if (state.filter === 'wishlist') {
                    const entry = state.wishlist.find(x => (typeof x === 'string' ? x : x.id) === p.id);
                    if (entry && typeof entry === 'object' && entry.var) {
                        displayP = { ...displayP, ...entry.var };
                        savedVar = entry.var;
                    }
                }

                const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';

                return `
                <div class="product-card group fade-in ${state.selected.includes(p.id) ? 'selected' : ''} ${isInWishlist(p.id) ? 'wish-active' : ''}" data-id="${p.id}" onclick="viewDetail('${p.id}', false, ${savedVar ? JSON.stringify(savedVar) : 'null'})">
                    <div class="img-container mb-4 shadow-sm relative">
                        ${badgeHtml}
                        <div class="wish-btn shadow-sm md:hidden" onclick="toggleWishlist(event, '${p.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
                        ${!state.selectionId && !state.filter.includes('wishlist') ? `<div class="select-btn shadow-sm" onclick="toggleSelect(event, '${p.id}')"><i class="fa-solid fa-check text-[10px]"></i></div>` : ''}
                        <img src="${getOptimizedUrl(displayP.img, 600)}" 
                             ${idx < 8 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                             decoding="async"
                             onload="this.classList.add('loaded')"
                             alt="${displayP.name}">
                    </div>
                    <div class="px-1 text-left flex justify-between items-start mt-4">
                        <div class="flex-1 min-w-0">
                            <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${displayP.name}</h3>
                            <p class="price-tag mt-2 font-bold">${displayP.price} AED</p>
                        </div>
                        <div class="wish-btn relative !top-0 !right-0 !left-auto hidden md:flex" onclick="toggleWishlist(event, '${p.id}')">
                            <i class="fa-solid fa-heart"></i>
                        </div>
                    </div>
                </div>`;
            }).join('') || `<p class="col-span-full text-center py-40 text-gray-300 italic text-[11px]">No items found.</p>`;
        }

        renderSlider();

        // 5. Update Search & Sort UI
        if (discSearch && discSearch !== document.activeElement) discSearch.value = state.search;
        if (clearBtn) {
            if (state.search) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }
        if (mobileSort) mobileSort.value = state.sort;

        updateSelectionBar();

        // Update Mobile Nav Active State
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
        if (state.search) {
            document.querySelector('.mobile-nav-btn:nth-child(2)')?.classList.add('active');
        } else if (state.filter === 'wishlist') {
            document.querySelector('.mobile-nav-btn:nth-child(3)')?.classList.add('active');
        } else if (state.filter === 'all' && !state.selectionId && !new URLSearchParams(window.location.search).has('p')) {
            document.querySelector('.mobile-nav-btn:nth-child(1)')?.classList.add('active');
        }

        if (!state.selectionId && state.filter !== 'wishlist' && !state.search) window.scrollTo({ top: state.scrollPos });
        else if (!state.search) window.scrollTo({ top: 0 });
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
    if (state.selected.length > 0 && !state.selectionId && state.filter !== 'wishlist') {
        bar.style.display = 'flex';
        bar.classList.add('animate-selection');
        if (count) count.innerText = `${state.selected.length} items`;
    } else {
        bar.style.display = 'none';
        bar.classList.remove('animate-selection');
    }
};

window.viewDetail = (id, skipHistory = false, preSelect = null) => {
    const p = DATA.p.find(x => x.id === id);
    if (!p) return;
    state.currentVar = preSelect; // Initialize with saved variation if any
    if (!skipHistory) {
        const isAlreadyInDetail = new URLSearchParams(window.location.search).has('p');
        state.scrollPos = isAlreadyInDetail ? state.scrollPos : window.scrollY;
        safePushState({ p: id }, isAlreadyInDetail);

        // Track View (Only if not just going back in history)
        trackProductView(id);

        // Dynamic Page Title for Detail View
        document.title = `${p.name} | Speed Gifts Website`;
    }
    const appMain = document.getElementById('app');
    if (!appMain) return;
    const allImages = [...(p.images || [])];
    [p.img, p.img2, p.img3].forEach(img => {
        if (img && img !== 'img/' && !allImages.includes(img)) allImages.push(img);
    });

    appMain.innerHTML = `
<div class="max-w-5xl mx-auto py-8 md:py-16 fade-in px-4 pb-20 detail-view-container text-left">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        <div>
            <div class="zoom-img-container aspect-square rounded-2xl overflow-hidden shadow-sm" onmousemove="handleZoom(event, this)" onmouseleave="resetZoom(this)" onclick="openFullScreen('${allImages[0] || p.img}')">
                <img src="${getOptimizedUrl(allImages[0] || p.img, 1200)}" id="main-detail-img" class="w-full h-full object-cover" fetchpriority="high" loading="eager">
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
                    <p class="detail-price-text text-xl md:text-2xl">${p.price} AED</p>
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
        name: document.getElementById('p-name')?.value,
        price: document.getElementById('p-price')?.value,
        size: document.getElementById('p-size')?.value,
        material: document.getElementById('p-material')?.value,
        inStock: document.getElementById('p-stock')?.checked,
        img: primaryImg,
        images: images,
        catId: document.getElementById('p-cat-id')?.value,
        badge: document.getElementById('p-badge')?.value, // Collect badge
        desc: document.getElementById('p-desc')?.value,
        keywords: document.getElementById('p-keywords')?.value,
        isPinned: document.getElementById('p-pinned')?.checked || false,
        variations: variations,
        colorVariations: colorVariations,
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

window.clearSelection = () => { state.selected = []; state.selectionId = null; renderHome(); };

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
    const sourceIds = isSidebarOpen ? state.wishlist : state.selected;

    if (sourceIds.length === 0) return showToast("No items to inquire");

    const items = sourceIds.map(id => DATA.p.find(p => p.id === id)).filter(x => x);
    let msg = `*Hello Speed Gifts!*\nI am interested in these items from my ${isSidebarOpen ? 'Favorites' : 'Selection'}:\n\n`;

    items.forEach((item, i) => {
        const pUrl = `${window.location.origin}${window.location.pathname}?p=${item.id}`;
        msg += `${i + 1}. *${item.name}* - ${item.price} AED\nLink: ${pUrl}\n\n`;
    });

    const source = sessionStorage.getItem('traffic_source');
    if (source) msg += `\n\n[Source: ${source}]`;

    window.trackWhatsAppInquiry('bulk_inquiry');
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
    if (source) msg += `\n\n[Source: ${source}]`;

    window.trackWhatsAppInquiry(p.id);
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
            const viewCount = p.views || 0;

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
                                <img src="${getOptimizedUrl(c.img, 100)}" class="w-14 h-14 rounded-full object-cover border-4 border-white shadow-sm" onerror="this.src='https://placehold.co/100x100?text=Icon'">
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
    const appMain = document.getElementById('app');
    const tags = appMain ? appMain.querySelector('#search-tags') : null;
    if (tags) {
        if (show) tags.classList.remove('hidden');
        else setTimeout(() => {
            const currentTags = document.getElementById('app')?.querySelector('#search-tags');
            if (currentTags) currentTags.classList.add('hidden');
        }, 200);
    }
};
let searchTimeout;
window.applyCustomerSearch = (val) => {
    state.search = val;
    if (val && state.filter !== 'wishlist' && !state.selectionId) {
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
        renderHome();
    }, 400); // Slightly longer for search history comfort

    // Update Clear Button UI immediately with safety
    const clearBtn = document.getElementById('app')?.querySelector('#clear-search-btn');
    if (clearBtn) {
        if (val) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
};
window.clearCustomerSearch = () => {
    state.search = '';
    renderHome();
    const input = document.getElementById('customer-search');
    if (input) input.focus();
};
window.applyPriceSort = (sort) => { state.sort = sort; renderHome(); };
window.showAdminPanel = () => { document.getElementById('admin-panel').classList.remove('hidden'); document.body.style.overflow = 'hidden'; renderAdminUI(); };
window.hideAdminPanel = () => { document.getElementById('admin-panel').classList.add('hidden'); document.body.style.overflow = 'auto'; };

window.switchAdminTab = (tab) => {
    state.adminTab = tab;
    const isProd = tab === 'products';
    const isCat = tab === 'categories';
    const isSlider = tab === 'sliders';
    const isInsight = tab === 'insights';

    document.getElementById('admin-product-section').classList.toggle('hidden', !isProd);
    document.getElementById('admin-category-section').classList.toggle('hidden', !isCat);
    document.getElementById('admin-slider-section').classList.toggle('hidden', !isSlider);
    document.getElementById('admin-insights-section').classList.toggle('hidden', !isInsight);

    document.getElementById('admin-product-list-container').classList.toggle('hidden', !isProd);
    document.getElementById('admin-category-list').classList.toggle('hidden', !isCat);
    document.getElementById('admin-slider-list').classList.toggle('hidden', !isSlider);
    document.getElementById('admin-insights-list').classList.toggle('hidden', !isInsight);

    document.getElementById('product-admin-filters').classList.toggle('hidden', !isProd);

    document.getElementById('tab-p').className = isProd ? "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase bg-white shadow-xl" : "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase text-gray-400";
    document.getElementById('tab-c').className = isCat ? "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase bg-white shadow-xl" : "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase text-gray-400";
    document.getElementById('tab-s').className = isSlider ? "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase bg-white shadow-xl" : "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase text-gray-400";
    document.getElementById('tab-i').className = isInsight ? "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase bg-white shadow-xl" : "flex-1 py-4 rounded-xl text-[10px] font-bold uppercase text-gray-400";

    document.getElementById('list-title').innerText = isProd ? "Live Inventory" : (isCat ? "Existing Categories" : (isSlider ? "Management Sliders" : "Popularity Insights"));
    renderAdminUI();
};

/* CATEGORY PICKER LOGIC */

function populateCatSelect() {
    const select = document.getElementById('p-cat-id');
    if (select) select.innerHTML = `<option value="">Select Category</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function populateAdminCatFilter() {
    const select = document.getElementById('admin-cat-filter');
    if (select) select.innerHTML = `<option value="all">All Categories</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

window.resetForm = () => {
    // Basic fields
    const fields = ['edit-id', 'p-name', 'p-price', 'p-size', 'p-material', 'p-desc', 'p-keywords', 'c-name', 'p-badge', 'edit-slider-id', 's-img', 's-mobileImg', 's-title', 's-link', 's-order']; // Added 'p-badge'
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
    if (window.innerWidth < 768) {
        window.openFavoritesSidebar();
    } else {
        applyFilter('wishlist');
    }
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

function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return url;

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

async function trackProductView(id) {
    if (!id || typeof id !== 'string') return;
    try {
        const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', id);
        const updateData = {
            views: increment(1)
        };

        // Check if visitor is from Google Ads
        if (sessionStorage.getItem('traffic_source') === 'Google Ads') {
            updateData.adViews = increment(1);
        }

        await updateDoc(pRef, updateData);
    } catch (e) {
        console.error("View tracking error:", e);
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

function renderInsights(container) {
    const topProducts = [...DATA.p]
        .filter(p => (p.views || 0) > 0)
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 15);

    let html = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div class="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 flex items-center justify-between group">
                <div>
                    <h5 class="text-[10px] font-black uppercase tracking-widest text-blue-400">Total Catalog Usage</h5>
                    <div class="flex items-baseline gap-3">
                        <p class="text-[20px] font-black text-blue-900">${DATA.p.reduce((acc, p) => acc + (p.views || 0), 0)} Total Views</p>
                        <button onclick="resetAllAnalytics()" class="text-[9px] font-black uppercase text-blue-300 hover:text-red-500 transition-all ml-2 underline underline-offset-4 decoration-blue-200 hover:decoration-red-200">
                            Master Reset
                        </button>
                    </div>
                </div>
                <i class="fa-solid fa-chart-line text-blue-200 text-3xl"></i>
            </div>
            <div class="bg-purple-50 p-6 rounded-[2rem] border border-purple-100 flex items-center justify-between group">
                <div>
                    <h5 class="text-[10px] font-black uppercase tracking-widest text-purple-400">Google Ads Performance</h5>
                    <div class="space-y-1">
                        <div class="flex items-baseline gap-3">
                            <p class="text-[20px] font-black text-purple-900">${DATA.stats.adVisits || 0} Ad Visitors</p>
                            <button onclick="resetAdTraffic()" class="text-[9px] font-black uppercase text-purple-300 hover:text-red-500 transition-all ml-2 underline underline-offset-4 decoration-purple-200 hover:decoration-red-200">
                                Reset
                            </button>
                        </div>
                        <p class="text-[12px] font-black text-purple-600 flex items-center gap-2">
                            <i class="fa-brands fa-whatsapp"></i> ${DATA.stats.adInquiries || 0} Leads (Inquiries)
                        </p>
                    </div>
                </div>
                <i class="fa-brands fa-google text-purple-200 text-3xl"></i>
            </div>
        </div>
    `;

    if (topProducts.length === 0) {
        html += `<div class="py-20 text-center"><p class="text-[11px] text-gray-300 font-bold uppercase tracking-widest italic">No product views recorded yet.</p></div>`;
    } else {
        html += `<div class="space-y-3">`;
        html += topProducts.map((p, i) => `
            <div class="flex items-center gap-5 p-4 bg-white rounded-[2rem] border border-gray-100 hover:border-black transition-all group">
                <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center font-black text-[12px] text-gray-400 group-hover:bg-black group-hover:text-white transition-all shadow-inner">${i + 1}</div>
                <img src="${getOptimizedUrl(p.img, 200)}" class="w-14 h-14 rounded-2xl object-cover shadow-sm">
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-[13px] capitalize truncate text-gray-800">${p.name}</h4>
                    <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">${DATA.c.find(c => c.id === p.catId)?.name || 'Uncategorized'}</p>
                </div>
                <div class="flex items-center gap-4 px-4 border-l border-gray-50">
                    <div class="text-right">
                        <p class="text-[12px] font-black tracking-tighter text-black leading-none">${p.views || 0}</p>
                        <p class="text-[6px] font-black uppercase text-gray-300 tracking-[0.1em] mt-1">Views</p>
                    </div>
                    <div class="text-right pl-4 border-l border-gray-50">
                        <p class="text-[12px] font-black tracking-tighter text-purple-600 leading-none">${p.adViews || 0}</p>
                        <p class="text-[6px] font-black uppercase text-purple-300 tracking-[0.1em] mt-1">Ad Cnt</p>
                    </div>
                    <div class="text-right pl-4 border-l border-gray-50">
                        <p class="text-[12px] font-black tracking-tighter text-green-600 leading-none">${p.adInquiries || 0}</p>
                        <p class="text-[6px] font-black uppercase text-green-300 tracking-[0.1em] mt-1">Leads</p>
                    </div>
                </div>
            </div>
        `).join('');
        html += `</div>`;
    }

    container.innerHTML = html;
}

window.resetAdTraffic = async () => {
    if (!confirm("Are you sure you want to reset all Ad Traffic and Inquiry data to zero?")) return;
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(statsRef, { adVisits: 0, adInquiries: 0 }, { merge: true });
        DATA.stats.adVisits = 0;
        DATA.stats.adInquiries = 0;
        renderAdminUI();
        showToast("Ad Data Reset Successfully");
    } catch (e) {
        console.error("Reset Error:", e);
        showToast("Error resetting counter");
    }
};

window.resetAllAnalytics = async () => {
    if (!confirm("CRITICAL: This will reset ALL VIEWS, AD TRAFFIC, and LEADS for ALL products to zero. This cannot be undone. Proceed?")) return;

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        const batch = writeBatch(db);

        // 1. Reset Global Ad Stats
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        batch.set(statsRef, { adVisits: 0, adInquiries: 0 }, { merge: true });

        // 2. Reset All Products (Views, AdViews, AdInquiries)
        // Note: Firestore batch limit is 500. If more items exist, we do them in chunks.
        const products = DATA.p;
        products.forEach(p => {
            const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id);
            batch.update(pRef, { views: 0, adViews: 0, adInquiries: 0 });
        });

        await batch.commit();

        // Update Local memory
        DATA.stats.adVisits = 0;
        DATA.stats.adInquiries = 0;
        DATA.p.forEach(p => {
            p.views = 0;
            p.adViews = 0;
            p.adInquiries = 0;
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
    if (new URLSearchParams(window.location.search).has('p') || state.filter === 'wishlist' || state.selectionId) {
        window.goBackToHome(true);
    }

    setTimeout(() => {
        const searchInput = document.getElementById('customer-search');
        if (searchInput) {
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInput.focus();
        }
    }, 300);
};

// SLIDER LOGIC
let sliderInterval;
let currentSlide = 0;

function renderSlider() {
    const container = document.getElementById('app')?.querySelector('#home-slider-container');
    const slider = document.getElementById('app')?.querySelector('#home-slider');
    const dots = document.getElementById('app')?.querySelector('#slider-dots');

    if (!slider || !DATA.s.length || state.filter !== 'all' || state.search || state.selectionId) {
        if (container) container.classList.add('hidden');
        return;
    }

    if (container) container.classList.remove('hidden');

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
        return `
            <div class="slider-slide" data-index="${i}">
                <img src="${getOptimizedUrl(displayImg, isMobile ? 800 : 1920)}" alt="${s.title || ''}" onclick="${s.link ? `window.open('${s.link}', '_blank')` : ''}" style="${s.link ? 'cursor:pointer' : ''}">
                ${s.title ? `<div class="absolute bottom-12 left-8 md:left-12 text-white z-20">
                    <h2 class="text-2xl md:text-5xl font-black uppercase tracking-tighter">${s.title}</h2>
                </div>` : ''}
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

// Update renderAdminUI to handle sliders
const originalRenderAdminUI = window.renderAdminUI;
window.renderAdminUI = () => {
    originalRenderAdminUI();
    const sList = document.getElementById('admin-slider-list');
    if (sList && state.adminTab === 'sliders') {
        renderAdminSliders(sList);
    }
};

startSync();
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
