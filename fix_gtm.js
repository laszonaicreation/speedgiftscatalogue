const fs = require('fs');
const files = ['index.dev.html', 'index.html', 'landing.html', '404.html'];
files.forEach(f => {
    if (!fs.existsSync(f)) return;
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/setTimeout\(loadGTM,\s*15000\);/g, '');
    c = c.replace(/<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-P6WMHVN6"[^>]*><\/iframe><\/noscript>/g, '');
    fs.writeFileSync(f, c);
    console.log('Updated ' + f);
});
