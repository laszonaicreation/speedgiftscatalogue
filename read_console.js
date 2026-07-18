const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Set mobile viewport to match Lighthouse
    await page.setViewport({ width: 412, height: 915 });
    
    page.on('console', msg => {
        console.log('BROWSER LOG:', msg.text());
    });
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.toString());
    });
    page.on('requestfailed', req => {
        console.log('REQUEST FAILED:', req.url(), req.failure().errorText);
    });

    await page.goto('https://speedgifts.net/?v=lcpfix9', { waitUntil: 'networkidle0' });
    
    await browser.close();
})();
