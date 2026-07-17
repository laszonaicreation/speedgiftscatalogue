const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

const injectionStr = `
        const isMobile = req.headers['user-agent'] && /Mobi|Android/i.test(req.headers['user-agent']);
        let lcpImageUrl = null;
        if (sliders && sliders.length > 0) {
            const firstSlider = sliders.sort((a,b) => (a.order || 0) - (b.order || 0))[0];
            if (isMobile) {
                lcpImageUrl = (firstSlider.mobileImg && firstSlider.mobileImg.length > 10) ? firstSlider.mobileImg : firstSlider.img;
            } else {
                lcpImageUrl = (firstSlider.img && firstSlider.img.length > 10) ? firstSlider.img : firstSlider.mobileImg;
            }
        }
        const preloadTag = lcpImageUrl ? \`<link rel="preload" as="image" href="\${lcpImageUrl}" fetchpriority="high">\n\` : '';
        const injectionScript = preloadTag + \`<script>window.__INJECTED_HOME_DATA__ = \${JSON.stringify(responseData)};</script>\`;
`;

code = code.replace("const injectionScript = `<script>window.__INJECTED_HOME_DATA__ = ${JSON.stringify(responseData)};</script>`;", injectionStr);
fs.writeFileSync('index.js', code);
console.log('Fixed LCP preload');
