const fs = require('fs');
let content = fs.readFileSync('product-detail-renderer.js', 'utf8');

// 1. Change signature
content = content.replace(
    'export function renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews = [] }) {',
    'export function renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews = [], isUpdate = false }) {'
);

// 2. Extract Reviews
const reviewsStart = '${(() => {\n        // --- REVIEWS SECTION ---';
const reviewsEnd = '    })()}';

let p1 = content.indexOf(reviewsStart);
let p2 = content.indexOf(reviewsEnd, p1);

if (p1 !== -1 && p2 !== -1) {
    let reviewsCode = content.substring(p1 + 2, p2 + 9); // from (() => { ... to })()
    let replacement = `\${reviewsHtml}`;
    content = content.substring(0, p1) + replacement + content.substring(p2 + 9);
    
    // Inject reviewsHtml at top
    const injectPoint = content.indexOf("appMain.innerHTML = `");
    content = content.substring(0, injectPoint) + `const reviewsHtml = ${reviewsCode};\n\n    ` + content.substring(injectPoint);
}

// 3. Extract Recommendations
const recStart = '${(() => {\n            const currentCatId';
let p3 = content.indexOf(recStart);
let p4 = content.indexOf(reviewsEnd, p3);

if (p3 !== -1 && p4 !== -1) {
    let recCode = content.substring(p3 + 2, p4 + 9);
    let replacement = `\${recommendationsHtml}`;
    content = content.substring(0, p3) + replacement + content.substring(p4 + 9);
    
    // Inject recommendationsHtml at top
    const injectPoint = content.indexOf("appMain.innerHTML = `");
    content = content.substring(0, injectPoint) + `const recommendationsHtml = ${recCode};\n\n    ` + content.substring(injectPoint);
}

// 4. Inject isUpdate
const isUpdateCode = `
    if (isUpdate) {
        const revEl = document.getElementById('reviews-section');
        if (revEl) revEl.outerHTML = reviewsHtml;
        const recEl = document.getElementById('recommendations-section');
        if (recEl) recEl.outerHTML = recommendationsHtml;
        return;
    }
`;
const injectPoint = content.indexOf("appMain.innerHTML = `");
content = content.substring(0, injectPoint) + isUpdateCode + "\n    " + content.substring(injectPoint);

fs.writeFileSync('product-detail-renderer.js', content, 'utf8');
console.log('Done!');
