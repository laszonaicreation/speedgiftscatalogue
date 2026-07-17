const fs = require('fs');
let content = fs.readFileSync('product-detail-renderer.js', 'utf8');

const splitIndex = content.indexOf('    appMain.innerHTML = `');
let topPart = content.substring(0, splitIndex);
let bottomPart = content.substring(splitIndex);

// In bottomPart, replace the Reviews IIFE.
const revStart = bottomPart.indexOf('    ${(() => {\n        // --- REVIEWS SECTION ---');
const revStartFallback = bottomPart.indexOf('    ${(() => {\r\n        // --- REVIEWS SECTION ---');
const rStart = revStart !== -1 ? revStart : revStartFallback;

if (rStart !== -1) {
    // Find the end of the Reviews IIFE.
    // It ends with `        `;\n    })()}`
    const rEnd = bottomPart.indexOf('    })()}', rStart) + 9;
    bottomPart = bottomPart.substring(0, rStart) + '    <div id="reviews-section-container"></div>' + bottomPart.substring(rEnd);
}

// In bottomPart, replace the Recommendations IIFE.
const recStart = bottomPart.indexOf('    ${(() => {\n            const currentCatId');
const recStartFallback = bottomPart.indexOf('    ${(() => {\r\n            const currentCatId');
const cStart = recStart !== -1 ? recStart : recStartFallback;

if (cStart !== -1) {
    // It ends with `            </div>\`;\n        })()}`
    const cEndStr = '        })()}';
    const cEnd = bottomPart.indexOf(cEndStr, cStart) + cEndStr.length;
    bottomPart = bottomPart.substring(0, cStart) + '    <div id="recommendations-section-container"></div>' + bottomPart.substring(cEnd);
}

// Now insert logic into topPart.
const logic = `
    const reviewCount = reviews ? reviews.length : 0;
    const avgRating = reviewCount > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1) : '0.0';
    const reviewsHtml = \`
        <div style="margin-top: 5rem; padding-top: 4rem;" class="border-t border-gray-100 w-full max-w-3xl mx-auto">
            <!-- Header -->
            <div class="flex flex-col items-center text-center" style="margin-bottom: 45px;">
                <h3 class="text-[24px] font-bold text-gray-900 mb-3">Customer Reviews</h3>
                <div class="flex items-center justify-center gap-3">
                    <div class="flex text-[18px]" style="color: #FBBC04;">
                        \${[1, 2, 3, 4, 5].map(i => \`<i class="\${i <= Math.round(parseFloat(avgRating)) ? 'fa-solid' : 'fa-regular'} fa-star"></i>\`).join('')}
                    </div>
                    <span class="text-[18px] font-black text-gray-900">\${avgRating}</span>
                </div>
                <p class="text-[13px] text-gray-500 mt-2">Based on \${reviewCount} reviews</p>
            </div>

            <!-- Write a Review Form -->
            <div class="bg-gray-50 rounded-[2rem] p-6 md:p-10 mb-12 border border-gray-100">
                <h4 class="text-[16px] font-bold text-gray-900 mb-6 text-center">Share Your Thoughts</h4>
                <form onsubmit="event.preventDefault(); window.submitProductReview('\${product.id}', this.name.value, this.rating.value, this.review.value, this.reviewImage.files[0], this.querySelector('button[type=submit]'));" class="max-w-lg mx-auto flex flex-col gap-6">
                    <div class="flex flex-col items-center">
                        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Your Rating</label>
                        <div class="flex items-center gap-3 text-3xl cursor-pointer" id="star-rating-input" style="color: #FBBC04;">
                            <label><input type="radio" name="rating" value="1" class="hidden" required> <i class="fa-solid fa-star transition-transform hover:scale-110"></i></label>
                            <label><input type="radio" name="rating" value="2" class="hidden" required> <i class="fa-solid fa-star transition-transform hover:scale-110"></i></label>
                            <label><input type="radio" name="rating" value="3" class="hidden" required> <i class="fa-solid fa-star transition-transform hover:scale-110"></i></label>
                            <label><input type="radio" name="rating" value="4" class="hidden" required> <i class="fa-solid fa-star transition-transform hover:scale-110"></i></label>
                            <label><input type="radio" name="rating" value="5" class="hidden" required checked> <i class="fa-solid fa-star transition-transform hover:scale-110"></i></label>
                        </div>
                    </div>
                    
                    <div class="w-full">
                        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 pl-4">Your Name</label>
                        <input type="text" name="name" required class="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-[14px] outline-none focus:border-black focus:ring-1 focus:ring-black transition-all shadow-sm" placeholder="e.g. John Doe">
                    </div>
                    
                    <div class="w-full">
                        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 pl-4">Your Review</label>
                        <textarea name="review" required rows="4" class="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-[14px] outline-none focus:border-black focus:ring-1 focus:ring-black transition-all shadow-sm resize-none" placeholder="What did you love about this product?"></textarea>
                    </div>

                    <div class="w-full">
                        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 pl-4">Attach Photo (Optional)</label>
                        <input type="file" name="reviewImage" accept="image/*" class="w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl text-[14px] outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[11px] file:uppercase file:font-black file:tracking-widest file:bg-gray-100 file:text-black hover:file:bg-gray-200 transition-all shadow-sm">
                    </div>
                    
                    <button type="submit" class="w-full bg-black text-white text-[14px] font-bold uppercase tracking-widest py-4 rounded-2xl hover:bg-gray-800 hover:shadow-lg hover:-translate-y-0.5 transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        Post Review
                    </button>
                </form>
            </div>

            <!-- Reviews List -->
            <div class="flex gap-4 overflow-x-auto pb-6 snap-x px-2 modern-scrollbar">
                \${reviews.length === 0 ? '<div class="w-full text-center py-10"><p class="text-[14px] text-gray-400 italic">No reviews yet. Be the first to share your experience!</p></div>' : 
                    reviews.map(r => \`
                        <div class="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex-shrink-0 snap-center flex flex-col" style="width: 320px; max-width: 85vw; white-space: normal; word-break: break-word;">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex flex-col">
                                    <span class="font-bold text-gray-900 text-[15px] truncate">\${r.reviewerName}</span>
                                    <span class="text-[11px] text-gray-400 font-medium">\${new Date(r.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div class="flex text-[10px] bg-gray-50 px-2 py-1 rounded-full" style="color: #FBBC04;">
                                    \${[1, 2, 3, 4, 5].map(i => \`<i class="\${i <= r.rating ? 'fa-solid' : 'fa-regular'} fa-star mr-[1px]"></i>\`).join('')}
                                </div>
                            </div>
                            <p class="text-[13px] text-gray-600 leading-relaxed overflow-y-auto no-scrollbar flex-1">\${r.reviewText}</p>
                            \${r.imageUrl ? \`<div class="mt-4 rounded-xl overflow-hidden bg-gray-50 w-24 h-32 flex-shrink-0 cursor-pointer border border-gray-200 shadow-sm" onclick="openFullScreen('\${r.imageUrl}')"><img src="\${getOptimizedUrl ? getOptimizedUrl(r.imageUrl, 300) : r.imageUrl}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"></div>\` : ''}
                        </div>
                    \`).join('')}
            </div>
        </div>\`;

    const currentCatId = String(product.catId || "");
    const related = DATA.p ? DATA.p.filter(item => String(item.catId) === currentCatId && item.id !== product.id).slice(0, 6) : [];
    let recommendationsHtml = '';
    if (related.length > 0) {
        recommendationsHtml = \`
            <div class="mt-20 pt-12 border-t border-gray-50">
                <div class="flex items-center justify-between mb-8 pr-4">
                    <h3 class="recommendations-title mb-0-imp">Recommendations</h3>
                    <div class="lg:hidden flex items-center gap-2 text-gray-300 animate-pulse-slow">
                        <span class="text-[8px] font-black uppercase tracking-widest">Swipe</span>
                        <i class="fa-solid fa-arrow-right-long text-[10px]"></i>
                    </div>
                </div>
                <div class="related-scroll-wrapper no-scrollbar">
                    <div class="related-grid px-1">
                        \${related.map(rp => {
                const rpImg = [rp.img, ...(rp.images || []), rp.img2, rp.img3].find(u => u && u !== 'img/') || 'https://placehold.co/400x500?text=Gift';
                const badgeHtml = rp.badge && window.getBadgeLabel ? \`<div class="p-badge-card badge-\${rp.badge}">\${window.getBadgeLabel(rp.badge)}</div>\` : '';
                const wl = typeof window.getWishlistItems === 'function' ? window.getWishlistItems() : (state?.wishlist || []);
                const isWished = wl.some(x => (typeof x === 'string' ? x : x.id) === rp.id);
                return \`
                            <div class="product-card group flex-shrink-0 w-[160px] md:w-[220px] \${isWished ? 'wish-active' : ''}" data-id="\${rp.id}" onclick="viewDetail('\${rp.id}')">
                                <div class="img-container mb-4 relative">
                                    \${badgeHtml}
                                    <div class="wish-btn shadow-sm hidden-desktop" onclick="window.toggleWishlist(event, '\${rp.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
                                    <img src="\${getOptimizedUrl(rpImg, 600)}" alt="\${rp.name}" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='https://placehold.co/400x500?text=Image+Error'">
                                </div>
                                <div class="px-1 text-left flex justify-between items-start mt-4">
                                    <div class="flex-1 min-w-0">
                                        <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">\${rp.name}</h3>
                                        \${(() => {
                        const origPrice = parseFloat(rp.originalPrice); const salePrice = parseFloat(rp.price);
                        if (rp.originalPrice && origPrice > salePrice) {
                            const disc = Math.round((1 - salePrice / origPrice) * 100);
                            return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                                '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + rp.originalPrice + ' AED</span>' +
                                '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + rp.price + ' AED</span>' +
                                '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span></div>';
                        }
                        return '<p class="price-tag mt-2 font-bold">' + rp.price + ' AED</p>';
                    })()}
                                    </div>
                                    <div class="wish-btn desktop-wish-fix hidden-mobile" onclick="window.toggleWishlist(event, '\${rp.id}')">
                                        <i class="fa-solid fa-heart"></i>
                                    </div>
                                </div>
                            </div>\`;
            }).join('')}
                    </div>
                </div>
            </div>\`;
    }

    if (isUpdate) {
        const revEl = document.getElementById('reviews-section-container');
        if (revEl) revEl.innerHTML = reviewsHtml;
        const recEl = document.getElementById('recommendations-section-container');
        if (recEl) recEl.innerHTML = recommendationsHtml;
        return;
    }
`;

// Remove original definition of reviewCount from topPart
const startRemove = topPart.indexOf('    const reviewCount = reviews ? reviews.length : 0;');
topPart = topPart.substring(0, startRemove) + logic + '\n';

fs.writeFileSync('product-detail-renderer.js', topPart + bottomPart);
console.log('Fix 9 applied cleanly.');
