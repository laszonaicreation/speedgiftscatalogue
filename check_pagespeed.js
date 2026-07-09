const https = require('https');

const url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://speedgifts.net/&strategy=mobile&category=performance&category=seo&category=best-practices&category=accessibility";

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const categories = json.lighthouseResult.categories;
            console.log("=== PageSpeed Insights (Mobile) ===");
            console.log("Performance: " + Math.round(categories.performance.score * 100));
            console.log("SEO: " + Math.round(categories.seo.score * 100));
            console.log("Best Practices: " + Math.round(categories['best-practices'].score * 100));
            console.log("Accessibility: " + Math.round(categories.accessibility.score * 100));
            
            console.log("\nTop Performance Opportunities:");
            const audits = json.lighthouseResult.audits;
            for (let key in audits) {
                const audit = audits[key];
                if (audit.details && audit.details.type === 'opportunity' && audit.score !== 1 && audit.score !== null) {
                    console.log("- " + audit.title + " (Saves ~" + Math.round(audit.details.overallSavingsMs) + "ms)");
                }
            }
        } catch (e) {
            console.error("Error parsing JSON:", e.message);
        }
    });
}).on('error', (e) => {
    console.error("HTTP Error:", e.message);
});
