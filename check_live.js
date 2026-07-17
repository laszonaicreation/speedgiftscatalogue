const https = require('https');
https.get({
    hostname: 'speedgifts.net',
    path: '/',
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
}, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        const idx = d.indexOf('slider-slide relative');
        console.log('slider-slide relative in HTML:', idx !== -1 ? 'YES at ' + idx : 'NO');
        
        const idx2 = d.indexOf('fetchpriority');
        console.log('fetchpriority found:', idx2 !== -1 ? 'YES at ' + idx2 : 'NO');
        if (idx2 !== -1) {
            console.log('fetchpriority context:', JSON.stringify(d.substring(idx2 - 100, idx2 + 200)));
        }

        // Check the exact home-slider div content
        const hsIdx = d.indexOf('id="home-slider"');
        if (hsIdx !== -1) {
            console.log('home-slider div content:', JSON.stringify(d.substring(hsIdx, hsIdx + 600)));
        }
        
        // Check if skeleton is hidden
        const styleIdx = d.indexOf('slider-skeleton, #slider-skeleton-dots');
        console.log('skeleton hide style found:', styleIdx !== -1 ? 'YES' : 'NO');
    });
});
