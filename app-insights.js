/**
 * app-insights.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin Insights Dashboard — lazy-loaded only when the admin panel is opened.
 * This file is NEVER loaded for regular visitors, saving ~18 KB of parse cost
 * on the critical path.
 *
 * Dependencies read from window (set by app.js before this module loads):
 *   window._sgDb          — Firestore db instance
 *   window._sgAppId       — Firestore project/app ID
 *   window._sgDATA        — live DATA getter (products, categories, stats)
 *   window._sgGetTodayStr — getTodayStr() helper
 *   window._sgGetOptUrl   — getOptimizedUrl() helper
 *   window.showToast      — toast notification helper
 *   window.renderAdminUI  — admin panel re-render (from app-admin.js)
 *   window.refreshData    — data refresh (from app.js)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
    getDocs,
    query,
    where,
    doc,
    setDoc,
    collection,
    writeBatch,
    increment
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ─── Convenience accessors for shared state ────────────────────────────────
const getDb = () => window._sgDb;
const getAppId = () => window._sgAppId;
const getDATA = () => window._sgDATA;
const getTodayStr = () => window._sgGetTodayStr();
const getOptimizedUrl = (url, w) => window._sgGetOptUrl(url, w);
const showToast = (...args) => window.showToast?.(...args);
const renderAdminUI = () => window.renderAdminUI?.();

// ─────────────────────────────────────────────────────────────────────────────
// renderInsights — renders the Insights Dashboard HTML into a container element
// ─────────────────────────────────────────────────────────────────────────────
function renderInsights(container, rangeData = null) {
    const db = getDb();
    const appId = getAppId();
    const DATA = getDATA();
    const today = getTodayStr();

    // 1. Auto-fetch Today's detailed stats in background if first open
    if (!rangeData) {
        window.updateInsightsRange(today, today, true);
    }

    // 2. Data Aggregation
    const source = rangeData || {
        stats: DATA.stats || {},
        p: DATA.p || []
    };

    // Calculate total views for health rate
    const totalViews = source.p.reduce((acc, p) => acc + (p.views || 0) + (p.adViews || 0), 0);
    const adVisits = source.stats.adVisits || 0;
    const normalVisits = source.stats.normalVisits || 0;
    const adProductClicks = source.stats.adProductClicks || 0;
    const normalProductClicks = source.stats.normalProductClicks || 0;
    const adInquiries = source.stats.adInquiries || 0;
    const imageFail = source.stats.imageLoadFail || 0;

    // 3. Calculations
    const adJourneyPercent = adVisits ? Math.round((adProductClicks / adVisits) * 100) : 0;
    const normalJourneyPercent = normalVisits ? Math.round((normalProductClicks / normalVisits) * 100) : 0;
    const leadRate = adVisits ? ((adInquiries / adVisits) * 100).toFixed(1) : 0;
    const healthRate = totalViews ? Math.max(0, Math.min(100, 100 - (imageFail / totalViews * 100))).toFixed(1) : 100;

    const topProducts = [...source.p]
        .filter(p => (p.views || 0) > 0 || (p.adInquiries || 0) > 0 || (p.adViews || 0) > 0 || (p.adImpressions || 0) > 0)
        .sort((a, b) => ((b.views || 0) + (b.adViews || 0)) - ((a.views || 0) + (a.adViews || 0)))
        .slice(0, 50);

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

// ─────────────────────────────────────────────────────────────────────────────
// updateInsightsRange — fetches Firestore stats for a date range and re-renders
// ─────────────────────────────────────────────────────────────────────────────
async function updateInsightsRange(passedStart = null, passedEnd = null, isSilent = false) {
    const db = getDb();
    const appId = getAppId();
    const DATA = getDATA();

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
        // Fetch all daily_stats (1 doc/day) and filter locally
        const globalRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_stats');
        const globalSnap = await getDocs(globalRef);

        const aggregatedStats = {
            adVisits: 0, normalVisits: 0, adProductClicks: 0,
            normalProductClicks: 0, adInquiries: 0, imageLoadFail: 0,
            landingAdVisits: 0, brokenImages: []
        };

        globalSnap.forEach(d => {
            const docId = d.id;
            if (docId >= start && docId <= end) {
                const data = d.data();
                aggregatedStats.adVisits += (data.adVisits || 0);
                aggregatedStats.normalVisits += (data.normalVisits || 0);
                aggregatedStats.landingAdVisits += (data.landingAdVisits || 0);
                aggregatedStats.adProductClicks += (data.adProductClicks || 0);
                aggregatedStats.normalProductClicks += (data.normalProductClicks || 0);
                aggregatedStats.adInquiries += (data.adInquiries || 0);
                aggregatedStats.imageLoadFail += (data.imageLoadFail || data.imageFail || 0);
                if (Array.isArray(data.brokenImages)) {
                    data.brokenImages.forEach(u => {
                        if (!aggregatedStats.brokenImages.includes(u)) aggregatedStats.brokenImages.push(u);
                    });
                }
            }
        });

        // Combine landing page hits into AD traffic for a unified view
        aggregatedStats.adVisits = (aggregatedStats.adVisits || 0) + (aggregatedStats.landingAdVisits || 0);

        // Fetch Product Stats
        const prodRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats');
        const qProd = query(prodRef, where("date", ">=", start), where("date", "<=", end));
        const prodSnap = await getDocs(qProd);

        const prodMap = {};
        prodSnap.forEach(d => {
            const data = d.data();
            const pid = data.productId;
            if (!pid) return;
            if (!prodMap[pid]) {
                const specialNames = { 'floating_button': 'Main Floating WhatsApp', 'landing_floating': 'Landing Floating WhatsApp', 'bulk_inquiry': 'Cart Checkout Inquiry' };
                const original = DATA.p.find(p => p.id === pid) || { name: specialNames[pid] || 'Unknown', img: '', catId: '' };
                prodMap[pid] = { ...original, views: 0, adViews: 0, adInquiries: 0 };
            }
            prodMap[pid].views += (data.views || 0);
            prodMap[pid].adViews += (data.adViews || 0);
            prodMap[pid].adInquiries += (data.adInquiries || 0);
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

// ─────────────────────────────────────────────────────────────────────────────
// resetAdTraffic — resets ad traffic counters in Firestore
// ─────────────────────────────────────────────────────────────────────────────
async function resetAdTraffic() {
    const db = getDb();
    const appId = getAppId();
    const DATA = getDATA();

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
}

// ─────────────────────────────────────────────────────────────────────────────
// clearHealthErrors — clears today's image error count
// ─────────────────────────────────────────────────────────────────────────────
async function clearHealthErrors() {
    const db = getDb();
    const appId = getAppId();
    const DATA = getDATA();
    const today = getTodayStr();

    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        await setDoc(statsRef, { imageLoadFail: 0, brokenImages: [] }, { merge: true });

        // Also clear legacy/all-time counter
        const legacyRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        await setDoc(legacyRef, { imageLoadFail: 0, brokenImages: [] }, { merge: true });

        // Clear in-memory tracking so fresh errors are counted from now
        DATA.stats.imageLoadFail = 0;
        DATA.stats.brokenImages = [];
        // Signal app.js to clear its _errorTrackedUrls set
        window._sgClearErrorTrackedUrls?.();

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
}

// ─────────────────────────────────────────────────────────────────────────────
// resetAllAnalytics — master reset of ALL views, traffic, impressions, leads
// ─────────────────────────────────────────────────────────────────────────────
async function resetAllAnalytics() {
    const db = getDb();
    const appId = getAppId();
    const DATA = getDATA();

    if (!confirm("CRITICAL: This will reset ALL VIEWS, AD TRAFFIC, IMPRESSIONS, and LEADS. This cannot be undone. Proceed?")) return;

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        const batch = writeBatch(db);

        // 1. Reset Global Ad Stats
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_ad_stats_');
        batch.set(statsRef, { adVisits: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0, adHops: 0 }, { merge: true });

        // 2. Reset All Products (Views, AdViews, AdInquiries, AdImpressions)
        DATA.p.forEach(p => {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// resetInsightsData — deep reset: clears all daily_stats, daily_product_stats
//                     and per-product view counters
// ─────────────────────────────────────────────────────────────────────────────
async function resetInsightsData() {
    const db = getDb();
    const appId = getAppId();
    const DATA = getDATA();

    if (!confirm("Are you sure you want to reset all Insights data? This will clear all visit counts, product views, and leads forever.")) return;

    if (typeof window.showToast === 'function') window.showToast("Resetting insights...", "info");
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

        if (typeof window.showToast === 'function') window.showToast("Insights reset successfully!", "success");

        // Local Sync & Refresh
        await window.refreshData?.();
        // Re-render Insights panel
        const iList = document.getElementById('admin-insights-list');
        if (iList) renderInsights(iList);

    } catch (e) {
        console.error("Reset Error Details:", e.code, e.message);
        if (typeof window.showToast === 'function') window.showToast(`Reset failed: ${e.code || 'See console'}`, "error");
    } finally {
        if (topBtn) { topBtn.disabled = false; topBtn.innerText = 'Update View'; }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// initInsights — called once by app.js to register all window.* functions
// ─────────────────────────────────────────────────────────────────────────────
export function initInsights() {
    // Expose all needed functions globally so inline HTML onclick="" handlers work
    window.renderInsights = renderInsights;
    window.updateInsightsRange = updateInsightsRange;
    window.resetAdTraffic = resetAdTraffic;
    window.clearHealthErrors = clearHealthErrors;
    window.resetAllAnalytics = resetAllAnalytics;
    window.resetInsightsData = resetInsightsData;
    console.log('[Insights] Module loaded and ready.');
}
