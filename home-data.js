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

    const [pSnap, cSnap, mSnap, sSnap, popSnap, todaySnap] = await Promise.all([
        getDocs(prodCol),
        getDocs(catCol),
        getDocs(megaCol).catch(() => ({ docs: [] })),
        getDocs(sliderCol).catch(() => ({ docs: [] })),
        getDocs(popupSettingsCol).catch(() => ({ empty: true })),
        getDoc(todayRef).catch(() => null)
    ]);

    const rawProducts = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
