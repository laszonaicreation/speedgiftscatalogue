const fs = require('fs');
let content = fs.readFileSync('product-detail-renderer.js', 'utf8');

// 1. Replace the IIFEs with safe empty containers.
const reviewsStart = content.indexOf('${(() => {\n        // --- REVIEWS SECTION ---');
const reviewsStartFallback = content.indexOf('${(() => {\r\n        // --- REVIEWS SECTION ---');

const startIdx = reviewsStart !== -1 ? reviewsStart : reviewsStartFallback;

if (startIdx !== -1) {
    const endIdx = content.indexOf('})()}', startIdx) + 5;
    content = content.substring(0, startIdx) + '<div id="reviews-section-container"></div>' + content.substring(endIdx);
    console.log("Replaced reviews IIFE");
} else {
    console.log("Reviews IIFE not found");
}

const recsStart = content.indexOf('${(() => {\n            const currentCatId');
const recsStartFallback = content.indexOf('${(() => {\r\n            const currentCatId');
const recStartIdx = recsStart !== -1 ? recsStart : recsStartFallback;

if (recStartIdx !== -1) {
    const endIdx = content.indexOf('})()}', recStartIdx) + 5;
    content = content.substring(0, recStartIdx) + '<div id="recommendations-section-container"></div>' + content.substring(endIdx);
    console.log("Replaced recs IIFE");
} else {
    console.log("Recs IIFE not found");
}

// 2. Insert the isUpdate block right before appMain.innerHTML
const isUpdateBlock = `
    if (isUpdate) {
        const revEl = document.getElementById('reviews-section-container');
        if (revEl) revEl.innerHTML = reviewsHtml || '';
        const recEl = document.getElementById('recommendations-section-container');
        if (recEl) recEl.innerHTML = recommendationsHtml || '';
        return;
    }
`;

content = content.replace(/appMain\.innerHTML = \`/, isUpdateBlock + '\n    appMain.innerHTML = `');

// 3. We must remove the outer wrappers from reviewsHtml and recommendationsHtml strings!
// We'll just replace the first line of the HTML templates.
content = content.replace(/<div id="reviews-section"[^>]*>/, '<!-- reviews inner -->');
content = content.replace(/<div id="recommendations-section"[^>]*>/, '<!-- recs inner -->');

// Also remove the closing </div> for each.
content = content.replace(/<\/div>\n        \`;\n\n    const currentCatId/, '`;\n\n    const currentCatId');
content = content.replace(/<\/div>\n            \`;\n    \}\n\n    if \(isUpdate\)/, '`;\n    }\n\n    if (isUpdate)');

fs.writeFileSync('product-detail-renderer.js', content);
