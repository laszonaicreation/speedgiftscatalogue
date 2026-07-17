const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

const renderHomeFn = `exports.renderHome = onRequest(async (req, res) => {
    try {
        const appId = req.query.appId || 'speed-catalogue';
        const today = new Date().toISOString().split('T')[0];
        const dataRef = db.collection('artifacts').doc(appId).collection('public').doc('data');

        const prodCol = dataRef.collection('products');
        const catCol = dataRef.collection('categories');
        const megaCol = dataRef.collection('mega_menus');
        const sliderCol = dataRef.collection('sliders');
        const popupCol = dataRef.collection('popup_settings');
        const dailyStatsRef = dataRef.collection('daily_stats').doc(today);

        const configDocIds = ['_announcements_', '_landing_settings_', '_home_settings_', '_ad_stats_', '--global-stats--', '_hero_config_'];

        const [configSnap, featuredSnap, fallbackSnap, catSnap, megaSnap, sliderSnap, popupSnap, todaySnap] = await Promise.all([
            prodCol.where(admin.firestore.FieldPath.documentId(), 'in', configDocIds).get(),
            prodCol.where('isFeatured', '==', true).get(),
            prodCol.limit(30).get(),
            catCol.get(),
            megaCol.get(),
            sliderCol.get(),
            popupCol.limit(1).get(),
            dailyStatsRef.get().catch(() => null)
        ]);

        const uniqueMap = new Map();
        [...configSnap.docs, ...featuredSnap.docs, ...fallbackSnap.docs].forEach(d => {
            if (!uniqueMap.has(d.id)) {
                uniqueMap.set(d.id, { id: d.id, ...d.data() });
            }
        });

        const rawProducts = Array.from(uniqueMap.values());
        const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const megaMenus = megaSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
        const sliders = sliderSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const announcementsDoc = rawProducts.find(p => p.id === '_announcements_');
        const announcements = announcementsDoc ? (announcementsDoc.messages || []) : [];

        const popupSettings = (!popupSnap.empty) ? popupSnap.docs[0].data() : null;

        const landingDoc = rawProducts.find(p => p.id === '_landing_settings_');
        const landingSettings = landingDoc ? { ...landingDoc } : null;

        const homeSettingsDoc = rawProducts.find(p => p.id === '_home_settings_');
        const homeSettings = homeSettingsDoc ? { ...homeSettingsDoc } : null;

        const products = rawProducts.filter(p => !p.id.startsWith('_') && !p.id.startsWith('--'));
        
        let stats = null;
        if (todaySnap && todaySnap.exists) {
            stats = todaySnap.data();
        }

        const responseData = {
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

        const indexPath = path.join(__dirname, 'index.html');
        let htmlString = fs.readFileSync(indexPath, 'utf8');

        // Inject data
        const injectionScript = \`<script>window.__INJECTED_HOME_DATA__ = \${JSON.stringify(responseData)};</script>\`;
        if (htmlString.includes('</head>')) {
            htmlString = htmlString.replace('</head>', injectionScript + '</head>');
        } else {
            htmlString = injectionScript + htmlString;
        }

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.status(200).send(htmlString);
    } catch (error) {
        console.error('Error rendering home page:', error);
        res.status(500).send('Internal Server Error');
    }
});

`;

if (!content.includes('exports.renderHome =')) {
    content = content.replace('exports.getHomeData =', renderHomeFn + 'exports.getHomeData =');
    fs.writeFileSync('index.js', content);
    console.log('Inserted renderHome successfully.');
} else {
    console.log('renderHome already exists.');
}
