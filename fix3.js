const fs = require('fs');
let content = fs.readFileSync('product-detail-renderer.js', 'utf8');

const reviewsStart = content.indexOf('${(() => {\n        // --- REVIEWS SECTION ---');
const reviewsStartFallback = content.indexOf('${(() => {\r\n        // --- REVIEWS SECTION ---');

const startIdx = reviewsStart !== -1 ? reviewsStart : reviewsStartFallback;

if (startIdx !== -1) {
    const endIdx = content.indexOf('})()}', startIdx) + 5;
    content = content.substring(0, startIdx) + '<div id="reviews-section"></div>' + content.substring(endIdx);
    console.log("Replaced reviews IIFE");
} else {
    console.log("Reviews IIFE not found");
}

const recsStart = content.indexOf('${(() => {\n            const currentCatId');
const recsStartFallback = content.indexOf('${(() => {\r\n            const currentCatId');
const recStartIdx = recsStart !== -1 ? recsStart : recsStartFallback;

if (recStartIdx !== -1) {
    const endIdx = content.indexOf('})()}', recStartIdx) + 5;
    content = content.substring(0, recStartIdx) + '<div id="recommendations-section"></div>' + content.substring(endIdx);
    console.log("Replaced recs IIFE");
} else {
    console.log("Recs IIFE not found");
}

fs.writeFileSync('product-detail-renderer.js', content);
