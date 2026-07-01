export function renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel, reviews = [] }) {
    const appMain = document.getElementById('app');
    if (!appMain) return;

    const allImages = [...(product.images || [])];
    [product.img, product.img2, product.img3].forEach((img) => {
        if (img && img !== 'img/' && !allImages.includes(img)) allImages.push(img);
    });

    appMain.innerHTML = `
<div class="max-w-5xl mx-auto pt-4 pb-20 md:pt-10 md:pb-16 px-4 detail-view-container text-left">
    <!-- Breadcrumbs -->
    <nav class="flex items-center text-[10px] font-bold text-gray-400 mb-6 w-full overflow-x-auto no-scrollbar whitespace-nowrap uppercase tracking-widest" style="gap: 8px;">
        <a href="index.html" class="hover:text-black transition-colors flex items-center" style="gap: 6px;">
            <i class="fa-solid fa-house text-[10px]"></i> Home
        </a>
        <span class="text-gray-300">/</span>
        <a href="shop.html" class="hover:text-black transition-colors">Shop</a>
        <span class="text-gray-300">/</span>
        <span class="text-gray-800 font-black truncate max-w-[150px] sm:max-w-xs">${product.name}</span>
    </nav>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        <div class="detail-media-pane">
            <div class="zoom-img-container aspect-square rounded-2xl overflow-hidden shadow-sm" onmousemove="handleZoom(event, this)" onmouseleave="resetZoom(this)" onclick="openFullScreen('${allImages[0] || product.img}')">
                <img src="${getOptimizedUrl(allImages[0] || product.img, 600)}" 
                     id="main-detail-img" 
                     class="w-full h-full object-cover no-animation" 
                     fetchpriority="high" 
                     loading="eager"
                     data-high-res="${getOptimizedUrl(allImages[0] || product.img, 1000)}">
            </div>
            <div class="thumb-grid justify-center lg:justify-start mt-4" id="detail-thumb-grid">
                ${allImages.map((img, i) => `
                    <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                        <img src="${getOptimizedUrl(img, 300)}">
                    </div>
                `).join('')}
            </div>
            <div class="detail-image-dots" id="detail-image-dots">
                ${allImages.map((img, i) => `
                    <button type="button" class="detail-image-dot ${i === 0 ? 'active' : ''}" data-src="${img}" onclick="switchImg('${img}', this)" aria-label="View image ${i + 1}"></button>
                `).join('')}
            </div>
        </div>
        <div class="flex flex-col h-full justify-between detail-info-pane">
            <div class="space-y-6">
                <div>
                    ${(() => {
            const badgeKey = product.badge || 'best';
            const badgeText = product.badge ? getBadgeLabel(product.badge) : 'Top Selection';
            return `<span class="detail-badge badge-${badgeKey}" style="display:inline-flex;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:400;letter-spacing:0.04em;margin-bottom:8px;color:#111111;">${badgeText}</span>`;
        })()}
                    <div class="flex items-center gap-3 mb-2 md:mb-3">
                        <h2 class="detail-product-name capitalize !mb-0">${product.name}</h2>
                        ${product.inStock === false ? '<span class="bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase shadow-sm">Out of Stock</span>' : ''}
                    </div>
                    ${(() => {
            const origP = parseFloat(product.originalPrice);
            const saleP = parseFloat(product.price);
            if (product.originalPrice && origP > saleP) {
                const disc = Math.round((1 - saleP / origP) * 100);
                return `<div class="flex items-baseline gap-3 flex-wrap mt-1">
                                <span class="detail-price-text text-xl md:text-2xl">${product.price} AED</span>
                                <span class="text-base line-through text-gray-400 font-normal">${product.originalPrice} AED</span>
                                <span class="text-[11px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-full">${disc}% OFF</span>
                            </div>`;
            }
            return `<p class="detail-price-text text-xl md:text-2xl">${product.price} AED</p>`;
        })()}
                    ${(() => {
                        const count = reviews ? reviews.length : 0;
                        const avgRating = count > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1) : '0.0';
                        return `
                        <div class="flex flex-col gap-3 mt-3">
                            <div class="flex items-center gap-2 cursor-pointer w-fit" onclick="document.getElementById('reviews-section').scrollIntoView({behavior: 'smooth'})">
                                <div class="flex text-[15px]" style="color: #FBBC04;">
                                    ${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(parseFloat(avgRating)) ? 'fa-solid' : 'fa-regular'} fa-star"></i>`).join('')}
                                </div>
                                <span class="text-[14px] font-bold text-gray-900">${avgRating}</span>
                                <span class="text-[13px] text-gray-500 underline decoration-gray-200 underline-offset-2">(${count} reviews)</span>
                            </div>
                            
                            <div class="flex items-center gap-2 mt-2">
                                <a href="https://share.google/H0bZvXJaDp5tyfEBC" target="_blank" class="flex items-center bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200 shadow-sm rounded-lg px-3 py-2 w-fit cursor-pointer no-underline" style="gap: 10px;">
                                    <div class="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <i class="fa-solid fa-store text-[10px]"></i>
                                    </div>
                                    <div class="flex flex-col" style="gap: 1px;">
                                        <div class="flex items-center" style="gap: 5px;">
                                            <span class="text-[9px] font-bold text-gray-800 uppercase" style="letter-spacing: 1px;">Store Rating</span>
                                            <div class="flex text-[9px]" style="color: #FBBC04; gap: 1px;">
                                                <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                                            </div>
                                            <span class="text-[9px] font-black text-gray-900">4.9/5</span>
                                        </div>
                                        <div class="flex items-center" style="gap: 4px;">
                                            <i class="fa-solid fa-location-dot text-gray-400 text-[8px]"></i>
                                            <span class="text-[8px] text-gray-500 font-medium" style="letter-spacing: 0.5px;">WTC Mall, Abu Dhabi</span>
                                        </div>
                                    </div>
                                </a>
                            </div>
                        </div>
                        `;
                    })()}
                </div>

                <div class="mt-4 mb-6">
                    <h3 class="text-[13px] font-bold text-gray-900 mb-2 uppercase tracking-wider">Item Details</h3>
                    <div class="detail-description-text text-[13px] leading-[1.6] text-gray-600">
                        ${(() => {
                            const detailsRaw = product.details || '';
                            if (!detailsRaw.trim()) return '<p class="text-gray-400 italic">Item details will be updated soon.</p>';
                            const lines = detailsRaw.split('\n').filter(line => line.trim());
                            
                            let html = '<ul class="space-y-3 mt-3">';
                            lines.forEach(line => {
                                let key = line;
                                let value = '';
                                if (line.includes(':')) {
                                    const parts = line.split(':');
                                    key = parts[0].trim();
                                    value = parts.slice(1).join(':').trim();
                                }
                                
                                html += `<li class="flex items-start gap-3">
                                    <i class="fa-regular fa-circle text-gray-400" style="font-size: 7px; margin-top: 6px;"></i>
                                    <div class="text-[13px] leading-[1.5] text-gray-700 flex-1">`;
                                    
                                if (value) {
                                    html += `<span class="font-bold text-gray-900">${key}:</span> <span class="opacity-90">${value}</span>`;
                                } else {
                                    html += `<span>${line.trim()}</span>`;
                                }
                                
                                html += `</div></li>`;
                            });
                            html += '</ul>';
                            return html;
                        })()}
                    </div>
                </div>

                ${((product.variations && product.variations.length > 0) || (product.colorVariations && product.colorVariations.length > 0)) ? `
                <div class="space-y-6 pt-4 border-t border-gray-50">
                    ${product.colorVariations && product.colorVariations.length > 0 ? `
                    <div class="variation-section">
                        <span class="detail-label mb-2">Available Colors</span>
                        <div class="flex flex-wrap gap-4">
                            ${product.colorVariations.map((v, i) => `
                                <div class="flex flex-col items-center gap-2 group cursor-pointer" onclick='window.selectColor("${v.price}", "${v.color}", ${JSON.stringify(v.images || v.img)}, this)'>
                                    <div class="color-swatch w-9 h-9 rounded-full border-2 ${i === 0 && (!product.variations || product.variations.length === 0) ? 'border-black scale-110' : 'border-white'} transition-all hover:scale-110" style="background-color: ${v.hex || '#000'}"></div>
                                    <span class="text-[7.5px] font-black uppercase tracking-tighter text-gray-400 group-hover:text-black transition-colors">${v.color}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${product.variations && product.variations.length > 0 ? `
                    <div class="variation-section">
                        <span class="detail-label mb-2">Available Sizes</span>
                        <div class="flex flex-wrap gap-2">
                            ${product.variations.map((v, i) => `
                                <button onclick='window.selectSize("${v.price}", "${v.size}", ${JSON.stringify(v.images || v.img)}, this)'
                                    class="size-badge px-4 py-3 rounded-xl border ${i === 0 ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-100'} font-bold text-[9px] uppercase tracking-widest transition-all">
                                    ${v.size}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                </div>
                ` : ''}

            </div>

            <div class="flex flex-col gap-2 pt-6">
                <span class="detail-label !mb-0 font-bold" style="color: #111;">Quantity</span>
                <div class="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm" style="width: 120px; height: 44px;">
                    <button type="button" class="flex-1 h-full text-gray-500 hover:text-black hover:bg-gray-50 transition-colors" onclick="window.updateDetailQty(-1)">
                        <i class="fa-solid fa-minus text-xs"></i>
                    </button>
                    <input type="number" class="w-10 h-full text-center font-bold text-gray-900 text-sm outline-none bg-transparent border-none p-0 no-spinners" id="detail-qty-val" value="1" min="1" max="${product.stockCount !== undefined ? product.stockCount : (product.inStock !== false ? 100 : 0)}" onchange="window.validateDetailQty(this)">
                    <button type="button" class="flex-1 h-full text-gray-500 hover:text-black hover:bg-gray-50 transition-colors" onclick="window.updateDetailQty(1)">
                        <i class="fa-solid fa-plus text-xs"></i>
                    </button>
                </div>
            </div>

            <div class="flex gap-2 sm:gap-3 md:gap-4 mt-4 mb-8 items-center w-full">
                <button id="main-add-to-cart-btn" ${product.inStock === false ? 'disabled' : `onclick="window.addToCart('${product.id}')"`}
                    class="flex-1 max-w-[150px] sm:max-w-[170px] bg-black text-white py-3 md:py-4 px-3 sm:px-4 shadow-xl flex items-center justify-center gap-2 md:gap-3 hover:opacity-90 active:scale-95 transition-all min-w-0 ${product.inStock === false ? 'opacity-50 cursor-not-allowed' : ''}" style="border-radius: 14px;">
                    <i class="fa-solid fa-cart-shopping text-base sm:text-lg md:text-xl flex-shrink-0"></i>
                    <div class="flex flex-col items-start leading-tight truncate">
                        <span class="text-[7px] md:text-[8px] font-bold opacity-60 uppercase tracking-widest truncate">${product.inStock === false ? 'Out of' : 'Add to'}</span>
                        <span class="text-[10px] md:text-[13px] font-black uppercase tracking-widest leading-none mt-0.5 truncate">${product.inStock === false ? 'Stock' : 'Cart'}</span>
                    </div>
                </button>
                
                <button id="main-inquiry-btn" ${product.inStock === false ? 'disabled' : `onclick="inquireOnWhatsApp('${product.id}'${product.variations && product.variations.length > 0 ? `, '${product.variations[0].size}', '${product.variations[0].price}'` : (product.colorVariations && product.colorVariations.length > 0 ? `, null, '${product.colorVariations[0].price}', '${product.colorVariations[0].color}'` : '')})"`}
                    class="flex-1 max-w-[150px] sm:max-w-[170px] text-white py-3 md:py-4 px-3 sm:px-4 shadow-xl flex items-center justify-center gap-2 md:gap-3 hover:opacity-90 active:scale-95 transition-all min-w-0 ${product.inStock === false ? 'opacity-50 cursor-not-allowed' : ''}" style="background-color: #25D366; border-radius: 14px;">
                    <i class="fa-brands fa-whatsapp text-base sm:text-lg md:text-xl flex-shrink-0"></i>
                    <div class="flex flex-col items-start leading-tight truncate">
                        <span class="text-[7px] md:text-[8px] font-bold opacity-90 uppercase tracking-widest truncate">Order via</span>
                        <span class="text-[10px] md:text-[13px] font-black uppercase tracking-widest leading-none mt-0.5 truncate">WhatsApp</span>
                    </div>
                </button>
                
                <button id="detail-share-btn" onclick="window.shareProduct('${product.id}', '${product.name.replace(/'/g, "\\'")}')"
                    class="flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 hover:text-black hover:bg-gray-200 transition-all active:scale-90 border border-gray-200 shadow-sm" style="width: 50px; height: 50px; border-radius: 14px;">
                    <i class="fa-solid fa-share-nodes text-lg"></i>
                </button>
                
                <button id="detail-wish-btn" data-id="${product.id}" onclick="window.toggleWishlist(event, '${product.id}')"
                    class="flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 hover:text-red-500 hover:bg-red-100 transition-all active:scale-90 border border-gray-200 shadow-sm" style="width: 50px; height: 50px; border-radius: 14px;">
                    <i class="${(typeof window.getWishlistItems === 'function' ? window.getWishlistItems() : (state?.wishlist || [])).some(x => (typeof x === 'string' ? x : x.id) === product.id) ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'} text-lg"></i>
                </button>
            </div>

            <div class="flex items-start justify-between py-6 w-full mt-2">
                <div class="flex flex-col items-center text-center flex-1">
                    <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100 shadow-sm">
                        <i class="fa-solid fa-truck-fast text-sm"></i>
                    </div>
                    <span class="text-[8px] font-bold text-gray-500 uppercase tracking-[0.15em] leading-[1.6] mt-2">Fast<br>Delivery</span>
                </div>
                <div class="flex flex-col items-center text-center flex-1">
                    <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100 shadow-sm">
                        <i class="fa-solid fa-shield-halved text-sm"></i>
                    </div>
                    <span class="text-[8px] font-bold text-gray-500 uppercase tracking-[0.15em] leading-[1.6] mt-2">Secure<br>Checkout</span>
                </div>
                <div class="flex flex-col items-center text-center flex-1">
                    <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100 shadow-sm">
                        <i class="fa-solid fa-award text-sm"></i>
                    </div>
                    <span class="text-[8px] font-bold text-gray-500 uppercase tracking-[0.15em] leading-[1.6] mt-2">Top<br>Quality</span>
                </div>
                <div class="flex flex-col items-center text-center flex-1">
                    <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100 shadow-sm">
                        <i class="fa-solid fa-headset text-sm"></i>
                    </div>
                    <span class="text-[8px] font-bold text-gray-500 uppercase tracking-[0.15em] leading-[1.6] mt-2">24/7<br>Support</span>
                </div>
            </div>

            <div class="pt-6">
                <div class="detail-accordion">
                    <button type="button" class="detail-accordion-toggle" onclick="window.toggleDetailSection(this)">
                        <span class="detail-accordion-title">Product Description</span>
                        <i class="fa-solid fa-chevron-down detail-accordion-arrow"></i>
                    </button>
                    <div class="detail-accordion-content hidden">
                        <div class="detail-description-text text-[13px] md:text-[14px] leading-[1.8] text-gray-600 space-y-4 overflow-hidden relative" id="desc-container">
                            ${(() => {
            const desc = product.desc || 'Premium handcrafted selection curated specifically for our collection.';
            const paragraphs = desc.split('\n').filter(line => line.trim());
            return paragraphs.map(p => `<p>${p}</p>`).join('') || `<p>${desc}</p>`;
        })()}
                        </div>
                    </div>
                </div>
                <div class="detail-accordion">
                    <button type="button" class="detail-accordion-toggle" onclick="window.toggleDetailSection(this)">
                        <span class="detail-accordion-title">Shipping Details</span>
                        <i class="fa-solid fa-chevron-down detail-accordion-arrow"></i>
                    </button>
                    <div class="detail-accordion-content hidden">
                        <div class="detail-description-text text-[13px] md:text-[14px] leading-[1.8] text-gray-600">
                            <p>Standard delivery across UAE within 1-3 business days. Custom or bulk orders may take additional processing time.</p>
                            <p>For urgent requirements, please contact us on WhatsApp and our team will assist with the fastest available delivery option.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    ${(() => {
        // --- REVIEWS SECTION ---
        const count = reviews ? reviews.length : 0;
        const avgRating = count > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1) : '0.0';
        
        return `
        <div id="reviews-section" style="margin-top: 5rem; padding-top: 4rem;" class="border-t border-gray-100 w-full max-w-3xl mx-auto">
            <!-- Header -->
            <div class="flex flex-col items-center text-center" style="margin-bottom: 45px;">
                <h3 class="text-[24px] font-bold text-gray-900 mb-3">Customer Reviews</h3>
                <div class="flex items-center justify-center gap-3">
                    <div class="flex text-[18px]" style="color: #FBBC04;">
                        ${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(parseFloat(avgRating)) ? 'fa-solid' : 'fa-regular'} fa-star"></i>`).join('')}
                    </div>
                    <span class="text-[18px] font-black text-gray-900">${avgRating}</span>
                </div>
                <p class="text-[13px] text-gray-500 mt-2">Based on ${count} reviews</p>
            </div>

            <!-- Write a Review Form -->
            <div class="bg-gray-50 rounded-[2rem] p-6 md:p-10 mb-12 border border-gray-100">
                <h4 class="text-[16px] font-bold text-gray-900 mb-6 text-center">Share Your Thoughts</h4>
                <form onsubmit="event.preventDefault(); window.submitProductReview('${product.id}', this.name.value, this.rating.value, this.review.value, this.reviewImage.files[0], this.querySelector('button[type=submit]'));" class="max-w-lg mx-auto flex flex-col gap-6">
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
                ${reviews.length === 0 ? '<div class="w-full text-center py-10"><p class="text-[14px] text-gray-400 italic">No reviews yet. Be the first to share your experience!</p></div>' : 
                    reviews.map(r => `
                        <div class="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex-shrink-0 w-[280px] md:w-[320px] snap-center flex flex-col">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex flex-col">
                                    <span class="font-bold text-gray-900 text-[15px] truncate">${r.reviewerName}</span>
                                    <span class="text-[11px] text-gray-400 font-medium">${new Date(r.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div class="flex text-[10px] bg-gray-50 px-2 py-1 rounded-full" style="color: #FBBC04;">
                                    ${[1, 2, 3, 4, 5].map(i => `<i class="${i <= r.rating ? 'fa-solid' : 'fa-regular'} fa-star mr-[1px]"></i>`).join('')}
                                </div>
                            </div>
                            <p class="text-[13px] text-gray-600 leading-relaxed overflow-y-auto no-scrollbar flex-1">${r.reviewText}</p>
                            ${r.imageUrl ? `<div class="mt-4 rounded-xl overflow-hidden bg-gray-50 w-24 h-32 flex-shrink-0 cursor-pointer border border-gray-200 shadow-sm" onclick="openFullScreen('${r.imageUrl}')"><img src="${getOptimizedUrl ? getOptimizedUrl(r.imageUrl, 300) : r.imageUrl}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"></div>` : ''}
                        </div>
                    `).join('')}
            </div>
        </div>
        `;
    })()}

    ${(() => {
            const currentCatId = String(product.catId || "");
            const related = DATA.p.filter(item => String(item.catId) === currentCatId && item.id !== product.id).slice(0, 6);
            if (related.length === 0) return '';
            return `
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
                        ${related.map(rp => {
                const rpImg = [rp.img, ...(rp.images || []), rp.img2, rp.img3].find(u => u && u !== 'img/') || 'https://placehold.co/400x500?text=Gift';
                const badgeHtml = rp.badge && window.getBadgeLabel ? `<div class="p-badge-card badge-${rp.badge}">${window.getBadgeLabel(rp.badge)}</div>` : '';
                const wl = typeof window.getWishlistItems === 'function' ? window.getWishlistItems() : (state?.wishlist || []);
                const isWished = wl.some(x => (typeof x === 'string' ? x : x.id) === rp.id);
                return `
                            <div class="product-card group flex-shrink-0 w-[160px] md:w-[220px] ${isWished ? 'wish-active' : ''}" data-id="${rp.id}" onclick="viewDetail('${rp.id}')">
                                <div class="img-container mb-4 relative">
                                    ${badgeHtml}
                                    <div class="wish-btn shadow-sm hidden-desktop" onclick="window.toggleWishlist(event, '${rp.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
                                    <img src="${getOptimizedUrl(rpImg, 600)}" alt="${rp.name}" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='https://placehold.co/400x500?text=Image+Error'">
                                </div>
                                <div class="px-1 text-left flex justify-between items-start mt-4">
                                    <div class="flex-1 min-w-0">
                                        <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${rp.name}</h3>
                                        ${(() => {
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
                                    <div class="wish-btn desktop-wish-fix hidden-mobile" onclick="window.toggleWishlist(event, '${rp.id}')">
                                        <i class="fa-solid fa-heart"></i>
                                    </div>
                                </div>
                            </div>`;
            }).join('')}
                    </div>
                </div>
            </div>`;
        })()}
</div>`;

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (state.currentVar) {
        const { color, size } = state.currentVar;
        setTimeout(() => {
            if (color) {
                const swatches = document.querySelectorAll('.color-swatch');
                swatches.forEach(s => {
                    const container = s.closest('.cursor-pointer');
                    const label = container?.querySelector('span')?.innerText;
                    if (label && label.trim() === color.trim()) container.click();
                });
            }
            if (size) {
                const badges = document.querySelectorAll('.size-badge');
                badges.forEach(b => {
                    if (b.innerText.trim() === size.trim()) b.click();
                });
            }
        }, 100);
    }

    if (typeof window.initDetailMobileSwipe === 'function') {
        window.initDetailMobileSwipe();
    }
    if (typeof window.preloadDetailImages === 'function') {
        window.preloadDetailImages(allImages);
    }

    // --- Progressive Image Upgrade Logic ---
    const mainImg = document.getElementById('main-detail-img');
    if (mainImg && mainImg.dataset.highRes) {
        const highResUrl = mainImg.dataset.highRes;
        const tempImg = new Image();
        tempImg.onload = () => {
            // Only swap if the user hasn't already switched to a different thumbnail
            if (mainImg.dataset.highRes === highResUrl) {
                mainImg.src = highResUrl;
                mainImg.style.filter = 'none'; // Ensure no blur if added
            }
        };
        // Small delay to prioritize initial page rendering
        setTimeout(() => { tempImg.src = highResUrl; }, 400);
    }

    // --- Add JSON-LD Structured Data for Googlebot ---
    let existingScript = document.getElementById('product-schema');
    if (existingScript) existingScript.remove();
    
    const schemaScript = document.createElement('script');
    schemaScript.id = 'product-schema';
    schemaScript.type = 'application/ld+json';
    
    const productSchema = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.name,
        "image": [allImages[0] || product.img],
        "description": product.desc || product.name,
        "sku": product.id,
        "offers": {
            "@type": "Offer",
            "url": window.location.href,
            "priceCurrency": "AED",
            "price": product.price,
            "availability": product.inStock !== false ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition"
        }
    };
    
    if (reviews && reviews.length > 0) {
        const ratingSum = reviews.reduce((acc, r) => acc + r.rating, 0);
        productSchema.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": (ratingSum / reviews.length).toFixed(1),
            "reviewCount": reviews.length
        };
    }
    
    schemaScript.textContent = JSON.stringify(productSchema);
    document.head.appendChild(schemaScript);
}
