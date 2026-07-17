const fs = require('fs');

// --- 1. Fix Renderer ---
let renderer = fs.readFileSync('product-detail-renderer.js', 'utf8');

// Replace the fully evaluated HTML in the initial appMain.innerHTML with empty placeholders
renderer = renderer.replace(/\$\{reviewsHtml\}/g, '<div id="reviews-section"></div>');
renderer = renderer.replace(/<div id="recommendations-section">\$\{recommendationsHtml\}<\/div>/g, '<div id="recommendations-section"></div>');

fs.writeFileSync('product-detail-renderer.js', renderer);


// --- 2. Fix Page Logic ---
let page = fs.readFileSync('product-detail-page.js', 'utf8');

// Update renderById to handle isUpdate properly
const newRenderById = `async function renderById(id, isUpdate = false) {
    const product = DATA.p.find(x => x.id === id);
    if (!product) {
        document.getElementById('app').innerHTML = '<p class="text-center text-gray-500 mt-20">Product not found.</p>';
        return;
    }
    
    if (!isUpdate) {
        // 1. Initial Instant Render (No waiting for reviews)
        injectSEO(product, []);
        renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: [], isUpdate: false });
        trackProductView(id).catch(() => { /* no-op */ });
    }

    // 2. Background Fetch for Reviews and Lazy Render Below-the-fold
    setTimeout(async () => {
        try {
            const reviews = await fetchReviews(id);
            const approvedReviews = reviews.filter(r => r.status === 'approved');
            
            // Inject SEO again to include aggregateRating if there are reviews
            if (approvedReviews.length > 0) {
                injectSEO(product, approvedReviews);
            }
            
            // Re-render only the reviews and recommendations sections
            renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews: approvedReviews, isUpdate: true });
        } catch(e) {
            console.error("Failed to lazy load reviews:", e);
        }
    }, 100);
}`;

page = page.replace(/async function renderById\(id, isUpdate = false\) \{[\s\S]*?\}, 100\);\n\}/, newRenderById);

// Ensure bootstrap calls renderById(id, true) at the end
page = page.replace(/\/\/ Final render to populate recommendations and sidebars\n    await renderById\(id\);/, '// Final render to populate recommendations and sidebars\n    await renderById(id, true);');

fs.writeFileSync('product-detail-page.js', page);
console.log("Fixes applied successfully!");
