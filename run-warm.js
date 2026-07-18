const fs = require('fs');

async function run() {
    console.log("Fetching products from Firestore...");
    try {
        const res = await fetch("https://firestore.googleapis.com/v1/projects/speed-catalogue/databases/(default)/documents/artifacts/speed-catalogue/public/data/products?pageSize=1000");
        const data = await res.json();
        
        if(!data.documents) {
            console.error("No products found");
            return;
        }

        console.log("Warming up main home page...");
        try {
            await fetch("https://speedgifts.net/");
            console.log("Main page warmed up successfully.");
        } catch(e) {
            console.error("Failed to warm up main page:", e);
        }

        console.log("Warming up shop page...");
        try {
            await fetch("https://speedgifts.net/shop");
            console.log("Shop page warmed up successfully.");
        } catch(e) {
            console.error("Failed to warm up shop page:", e);
        }
        
        const products = data.documents
            .map(doc => doc.name.split('/').pop())
            .filter(id => !['_ad_stats_', '--global-stats--', '_announcements_', '_landing_settings_', '_home_settings_', '_hero_config_'].includes(id));
        
        console.log(`Fetched ${products.length} products to warm up.`);
        
        let successCount = 0;
        let failCount = 0;

        const BATCH_SIZE = 10;
        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = products.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (id) => {
                const url = `https://speedgifts.net/p/${encodeURIComponent(id)}`;
                try {
                    const res = await fetch(url);
                    if (res.ok) successCount++;
                    else failCount++;
                } catch (e) {
                    failCount++;
                }
            });
            await Promise.all(promises);
            await new Promise(r => setTimeout(r, 500));
            console.log(`Progress: ${Math.min(i + BATCH_SIZE, products.length)} / ${products.length}`);
        }

        console.log(`Manual Cache warming complete. Success: ${successCount}, Failed: ${failCount}`);
    } catch(e) {
        console.error("Error:", e);
    }
}
run();
