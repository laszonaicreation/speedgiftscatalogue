const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

const injectionStr = `
        let preloadTag = '';
        if (sliders && sliders.length > 0) {
            let mUrl = null;
            let dUrl = null;
            const mSliders = sliders.filter(s => s.mobileImg && s.mobileImg.length > 5).sort((a,b) => (a.order || 0) - (b.order || 0));
            const dSliders = sliders.filter(s => s.img && s.img.length > 5).sort((a,b) => (a.order || 0) - (b.order || 0));
            if (mSliders.length > 0) mUrl = mSliders[0].mobileImg;
            if (dSliders.length > 0) dUrl = dSliders[0].img;
            
            if (mUrl && dUrl && mUrl !== dUrl) {
                preloadTag = \`<link rel="preload" as="image" href="\${mUrl}" media="(max-width: 767px)" fetchpriority="high">\n<link rel="preload" as="image" href="\${dUrl}" media="(min-width: 768px)" fetchpriority="high">\n\`;
            } else if (mUrl || dUrl) {
                preloadTag = \`<link rel="preload" as="image" href="\${mUrl || dUrl}" fetchpriority="high">\n\`;
            }
        }
        const injectionScript = preloadTag + \`<script>window.__INJECTED_HOME_DATA__ = \${JSON.stringify(responseData)};</script>\`;
`;

code = code.replace(/const injectionScript = [^;]+;/, injectionStr.trim());
fs.writeFileSync('index.js', code);
console.log('Fixed LCP responsive preload');
