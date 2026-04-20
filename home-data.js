import { query, where, documentId, limit } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

export async function fetchHomeDataBundle({
    db,
    appId,
    getTodayStr,
    doc,
    getDoc,
    getDocs,
    prodCol,
    catCol,
    megaCol,
    sliderCol,
    popupSettingsCol
}) {
    const today = getTodayStr();
    const todayRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);

    // Queries for massive payload reduction on initial load
    const configDocIds = ['_announcements_', '_landing_settings_', '_home_settings_', '_ad_stats_', '--global-stats--'];
    const qConfig = query(prodCol, where(documentId(), 'in', configDocIds));
    const qFeatured = query(prodCol, where('isFeatured', '==', true));
    const qFallback = query(prodCol, limit(30)); // Provides a fallback if no items are featured

    const [configSnap, featuredSnap, fallbackSnap, cSnap, mSnap, sSnap, popSnap, todaySnap] = await Promise.all([
        getDocs(qConfig).catch(() => ({ docs: [] })),
        getDocs(qFeatured).catch(() => ({ docs: [] })),
        getDocs(qFallback).catch(() => ({ docs: [] })),
        getDocs(catCol),
        getDocs(megaCol).catch(() => ({ docs: [] })),
        getDocs(sliderCol).catch(() => ({ docs: [] })),
        getDocs(popupSettingsCol).catch(() => ({ empty: true })),
        getDoc(todayRef).catch(() => null)
    ]);

    const uniqueMap = new Map();
    const allDocs = [...configSnap.docs, ...featuredSnap.docs, ...fallbackSnap.docs];
    allDocs.forEach(d => {
        if (!uniqueMap.has(d.id)) {
            uniqueMap.set(d.id, { id: d.id, ...d.data() });
        }
    });

    const rawProducts = Array.from(uniqueMap.values());
    const categories = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const megaMenus = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    const sliders = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const announcementsDoc = rawProducts.find(p => p.id === '_announcements_');
    const announcements = announcementsDoc ? (announcementsDoc.messages || []) : [];

    const popupSettings = (!popSnap.empty && popSnap.docs?.[0])
        ? popSnap.docs[0].data()
        : null;

    const landingDoc = rawProducts.find(p => p.id === '_landing_settings_');
    const landingSettings = landingDoc ? { ...landingDoc } : null;

    const homeDoc = rawProducts.find(p => p.id === '_home_settings_');
    const homeSettings = homeDoc ? { ...homeDoc } : null;

    const statsDoc = rawProducts.find(p => p.id === '_ad_stats_');
    const defaultStats = {
        adVisits: 0,
        adHops: 0,
        adInquiries: 0,
        adImpressions: 0,
        totalSessionSeconds: 0,
        normalVisits: 0,
        adProductClicks: 0,
        normalProductClicks: 0,
        imageLoadFail: 0
    };
    const stats = statsDoc ? { ...defaultStats, ...statsDoc } : { ...defaultStats };
    if (todaySnap?.exists()) {
        const td = todaySnap.data();
        stats.adVisits += (td.adVisits || 0) + (td.landingAdVisits || 0);
        stats.normalVisits += (td.normalVisits || 0);
        stats.adProductClicks = (stats.adProductClicks || 0) + (td.adProductClicks || 0);
        stats.normalProductClicks = (stats.normalProductClicks || 0) + (td.normalProductClicks || 0);
        stats.adInquiries += (td.adInquiries || 0);
        stats.imageLoadFail += (td.imageLoadFail || 0);
    }

    const products = rawProducts.filter(
        p => !['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_'].includes(p.id)
    );

    return {
        products,
        categories,
        megaMenus,
        sliders,
        announcements,
        popupSettings,
        landingSettings,
        homeSettings,
        stats
    };
}
