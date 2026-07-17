const https = require('https');

// First get the slider image URL from the function
https.get('https://renderhome-fwxy53lexq-uc.a.run.app/', res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        // Get the mobile preload URL
        const preloadMatch = d.match(/rel="preload" as="image" href="([^"]+)" media="\(max-width: 767px\)"/);
        const mobileUrl = preloadMatch ? preloadMatch[1] : null;
        
        // Get the desktop preload URL  
        const desktopMatch = d.match(/rel="preload" as="image" href="([^"]+)" media="\(min-width: 768px\)"/);
        const desktopUrl = desktopMatch ? desktopMatch[1] : null;
        
        // Also check for single preload (no media)
        const singleMatch = !preloadMatch && d.match(/rel="preload" as="image" href="([^"]+)" fetchpriority="high"/);
        const singleUrl = singleMatch ? singleMatch[1] : null;
        
        console.log('Mobile preload URL:', mobileUrl || 'not found');
        console.log('Desktop preload URL:', desktopUrl || 'not found');
        console.log('Single preload URL:', singleUrl || 'not found');
        
        const checkImageSize = (url, label) => {
            if (!url) return;
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'HEAD'
            };
            https.request(options, res2 => {
                const size = res2.headers['content-length'];
                const type = res2.headers['content-type'];
                console.log(`\n${label} image:`);
                console.log('  Size:', size ? (parseInt(size)/1024).toFixed(0) + ' KB' : 'unknown (no content-length)');
                console.log('  Type:', type || 'unknown');
                console.log('  Status:', res2.statusCode);
            }).on('error', e => console.log(`${label} error:`, e.message)).end();
        };
        
        checkImageSize(mobileUrl, 'Mobile slider');
        checkImageSize(desktopUrl, 'Desktop slider');
        checkImageSize(singleUrl, 'Single slider');
    });
});
