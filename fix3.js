const fs = require('fs');
let content = fs.readFileSync('product-detail-page.js', 'utf8');

content = content.replace(
    'async function renderById(id) {',
    'async function renderById(id, isUpdate = false) {'
);

content = content.replace(
    'renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: approvedReviews });',
    'renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: approvedReviews, isUpdate });'
);

fs.writeFileSync('product-detail-page.js', content, 'utf8');
console.log('Updated renderById');
