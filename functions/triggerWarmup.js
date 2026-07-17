const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function run() {
    const snapshot = await db.collection('artifacts').doc('speed-catalogue').collection('public').doc('data').collection('products').get();
    const productIds = [];
    snapshot.forEach(doc => {
        if (!['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_', '_hero_config_'].includes(doc.id)) {
            productIds.push(doc.id);
        }
    });

    console.log(`Warming up ${productIds.length} products...`);
    
    // Simple concurrency without external dependencies
    const concurrentLimit = 10;
    for (let i = 0; i < productIds.length; i += concurrentLimit) {
        const chunk = productIds.slice(i, i + concurrentLimit);
        const promises = chunk.map(async id => {
            try {
                await fetch(`https://speed-catalogue.web.app/p/${id}`);
                console.log(`Warmed: ${id}`);
            } catch (e) {
                console.error(`Failed: ${id}`);
            }
        });
        await Promise.all(promises);
    }
    
    console.log("Also warming up homepage and shop...");
    await fetch('https://speed-catalogue.web.app/');
    await fetch('https://speed-catalogue.web.app/shop.html');
    console.log("Warmup complete!");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
