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
        
        // Product caching removed to save Firestore reads during deployment

        // Warm up categories
        console.log("Fetching categories from Firestore...");
        try {
            const catRes = await fetch("https://firestore.googleapis.com/v1/projects/speed-catalogue/databases/(default)/documents/artifacts/speed-catalogue/public/data/categories?pageSize=100");
            const catData = await catRes.json();
            if(catData.documents) {
                const categories = catData.documents.map(doc => doc.name.split('/').pop());
                console.log(`Fetched ${categories.length} categories to warm up.`);
                
                let catSuccessCount = 0;
                let catFailCount = 0;

                for (let i = 0; i < categories.length; i += BATCH_SIZE) {
                    const batch = categories.slice(i, i + BATCH_SIZE);
                    const promises = batch.map(async (id) => {
                        const url = `https://speedgifts.net/shop?c=${encodeURIComponent(id)}`;
                        try {
                            const res = await fetch(url);
                            if (res.ok) catSuccessCount++;
                            else catFailCount++;
                        } catch (e) {
                            catFailCount++;
                        }
                    });
                    await Promise.all(promises);
                    await new Promise(r => setTimeout(r, 500));
                    console.log(`Category Progress: ${Math.min(i + BATCH_SIZE, categories.length)} / ${categories.length}`);
                }
                console.log(`Category Cache warming complete. Success: ${catSuccessCount}, Failed: ${catFailCount}`);
            }
        } catch(e) {
            console.error("Failed to warm up categories:", e);
        }

        console.log(`Manual Cache warming complete. Success: ${successCount}, Failed: ${failCount}`);
    } catch(e) {
        console.error("Error:", e);
    }
}
run();
