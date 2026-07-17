const fs = require('fs');
let content = fs.readFileSync('product-detail-renderer.js', 'utf8');

// 1. Remove the old isUpdate logic at the top if it exists
content = content.replace(/let recommendationsHtml = '';\n    if \(DATA && DATA\.p\) \{[\s\S]*?if \(isUpdate\) \{[\s\S]*?return;\n    \}\n/, '');
content = content.replace(/const reviewsHtml = \`[\s\S]*?<!-- Write a Review Form -->[\s\S]*?<\/div>\n        \`;\n/, '');

// Now we need to extract the IIFEs and turn them into simple string evaluations that can be used for updating.
// And replace them in the main HTML with container DIVs.

// Find the start of the Reviews IIFE in the main HTML
const revIifeStart = content.indexOf('${(() => {\n        // --- REVIEWS SECTION ---');
const revIifeStartFallback = content.indexOf('${(() => {\r\n        // --- REVIEWS SECTION ---');
const rStart = revIifeStart !== -1 ? revIifeStart : revIifeStartFallback;

let reviewsLogic = '';
if (rStart !== -1) {
    const rEnd = content.indexOf('})()}', rStart) + 5;
    const iifeBody = content.substring(rStart, rEnd);
    // Extract the body of the IIFE
    const bodyStart = iifeBody.indexOf('const count = reviews ? reviews.length : 0;');
    const bodyEnd = iifeBody.lastIndexOf('return `');
    const returnStrStart = iifeBody.indexOf('`', bodyEnd) + 1;
    const returnStrEnd = iifeBody.lastIndexOf('`');
    
    const setupCode = iifeBody.substring(bodyStart, bodyEnd).trim();
    let templateStr = iifeBody.substring(returnStrStart, returnStrEnd);
    
    // Remove the wrapper div from templateStr
    templateStr = templateStr.replace(/<div id="reviews-section"[^>]*>/, '');
    templateStr = templateStr.substring(0, templateStr.lastIndexOf('</div>'));
    
    reviewsLogic = `
    const reviewCount = reviews ? reviews.length : 0;
    const avgRating = reviewCount > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1) : '0.0';
    const reviewsHtml = \`${templateStr}\`;
    `;

    // Replace in main HTML
    content = content.substring(0, rStart) + '<div id="reviews-section-container" style="margin-top: 5rem; padding-top: 4rem;" class="border-t border-gray-100 w-full max-w-3xl mx-auto"></div>' + content.substring(rEnd);
}

const recIifeStart = content.indexOf('${(() => {\n            const currentCatId');
const recIifeStartFallback = content.indexOf('${(() => {\r\n            const currentCatId');
const cStart = recIifeStart !== -1 ? recIifeStart : recIifeStartFallback;

let recLogic = '';
if (cStart !== -1) {
    const cEnd = content.indexOf('})()}', cStart) + 5;
    const iifeBody = content.substring(cStart, cEnd);
    
    const bodyStart = iifeBody.indexOf('const currentCatId');
    const returnStrStart = iifeBody.indexOf('return `') + 8;
    const returnStrEnd = iifeBody.lastIndexOf('`');
    
    const setupCode = iifeBody.substring(bodyStart, iifeBody.indexOf('return `')).trim();
    let templateStr = iifeBody.substring(returnStrStart, returnStrEnd);
    
    // Remove wrapper div
    templateStr = templateStr.replace(/<div class="mt-20 pt-12 border-t border-gray-50">/, '');
    templateStr = templateStr.substring(0, templateStr.lastIndexOf('</div>'));

    recLogic = `
    let recommendationsHtml = '';
    ${setupCode}
    if (related.length > 0) {
        recommendationsHtml = \`${templateStr}\`;
    }
    `;

    // Replace in main HTML
    content = content.substring(0, cStart) + '<div id="recommendations-section-container" class="mt-20 pt-12 border-t border-gray-50"></div>' + content.substring(cEnd);
}

// Now insert the update block before appMain.innerHTML
const insertIdx = content.indexOf('appMain.innerHTML = `');

const updateBlock = `
    ${reviewsLogic}
    ${recLogic}

    if (isUpdate) {
        const revEl = document.getElementById('reviews-section-container');
        if (revEl) revEl.innerHTML = reviewsHtml;
        const recEl = document.getElementById('recommendations-section-container');
        if (recEl) recEl.innerHTML = recommendationsHtml;
        return;
    }

`;

content = content.substring(0, insertIdx) + updateBlock + content.substring(insertIdx);

fs.writeFileSync('product-detail-renderer.js', content);
console.log('Successfully refactored product-detail-renderer.js');
