const fs = require('fs');

let config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));

// 1. Remove the "no-cache" header for index.html if it exists
if (config.hosting && config.hosting.headers) {
    config.hosting.headers = config.hosting.headers.filter(h => h.source !== 'index.html');
}

// 2. Add rewrite rule for "/" to renderHome
if (config.hosting && config.hosting.rewrites) {
    const hasRenderHome = config.hosting.rewrites.some(r => r.source === '/');
    if (!hasRenderHome) {
        // Insert it right before the "**" catch-all
        const catchAllIndex = config.hosting.rewrites.findIndex(r => r.source === '**');
        const renderHomeRewrite = {
            "source": "/",
            "function": "renderHome"
        };
        
        if (catchAllIndex !== -1) {
            config.hosting.rewrites.splice(catchAllIndex, 0, renderHomeRewrite);
        } else {
            config.hosting.rewrites.push(renderHomeRewrite);
        }
    }
}

fs.writeFileSync('firebase.json', JSON.stringify(config, null, 2));
console.log('firebase.json updated successfully.');
