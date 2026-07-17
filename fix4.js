const fs = require('fs');
let code = fs.readFileSync('product-detail-renderer.js', 'utf8');

// 1. Change the isUpdate block
code = code.replace(/if \(isUpdate\) \{[\s\S]*?return;\n    \}/, `if (isUpdate) {
        const revEl = document.getElementById('reviews-section-container');
        if (revEl) revEl.innerHTML = reviewsHtml;
        const recEl = document.getElementById('recommendations-section-container');
        if (recEl) {
            recEl.innerHTML = recommendationsHtml;
        }
        return;
    }`);

// 2. Remove wrapper from reviewsHtml
code = code.replace(/const reviewsHtml = \`\s*<div id="reviews-section"[^>]*>/, 'const reviewsHtml = `\n            <!-- inner content -->');
// also remove the closing div for reviewsHtml
code = code.replace(/<\/div>\n        \`;\n\n    const currentCatId/, '        `;\n\n    const currentCatId');

// 3. Remove wrapper from recommendationsHtml
code = code.replace(/recommendationsHtml = \`\s*<div id="recommendations-section"[^>]*>/, 'recommendationsHtml = `\n            <!-- inner content -->');
// also remove the closing div for recommendationsHtml
code = code.replace(/<\/div>\n            \`;\n    \}\n\n    if \(isUpdate\)/, '            `;\n    }\n\n    if (isUpdate)');

// 4. Update the bottom placeholders
code = code.replace(/<div id="reviews-section"><\/div>/, '<div id="reviews-section-container" style="margin-top: 5rem; padding-top: 4rem;" class="border-t border-gray-100 w-full max-w-3xl mx-auto"></div>');
code = code.replace(/<div id="recommendations-section"><\/div>/, '<div id="recommendations-section-container" class="mt-20 pt-12 border-t border-gray-50"></div>');

fs.writeFileSync('product-detail-renderer.js', code);
console.log('Renderer updated with safe innerHTML');
