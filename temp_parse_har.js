const fs = require('fs');

try {
    const rawData = fs.readFileSync('speedgifts.net.har', 'utf8');
    const har = JSON.parse(rawData);
    const entries = har.log.entries;
    
    let totalTransfer = 0;
    let totalSize = 0;
    let items = [];

    entries.forEach(entry => {
        let transferSize = entry.response.bodySize;
        if (entry.response.transferSize !== undefined) {
            transferSize = entry.response.transferSize;
        }
        if (transferSize <= 0) transferSize = 0;

        let resourceSize = Math.max(0, entry.response.content.size);

        totalTransfer += transferSize;
        totalSize += resourceSize;
        
        items.push({
            url: entry.request.url.split('?')[0].substring(0, 70), // Truncate URL
            size: resourceSize,
            type: entry.response.content.mimeType
        });
    });

    items.sort((a, b) => b.size - a.size);

    console.log(`\n=== NETWORK ANALYSIS ===`);
    console.log(`Total Requests: ${entries.length}`);
    console.log(`Total Resource Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\nTop 15 Largest Files in the Website:`);
    items.slice(0, 15).forEach((item, i) => {
        console.log(`${i+1}. [${item.type}] ${item.url} -> ${(item.size / 1024).toFixed(2)} KB`);
    });
    
} catch (e) {
    console.error("Error:", e.message);
}
