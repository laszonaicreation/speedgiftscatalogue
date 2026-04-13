export function renderProductDetailView({ product, DATA, state, getOptimizedUrl, getBadgeLabel }) {
    const appMain = document.getElementById('app');
    if (!appMain) return;

    const allImages = [...(product.images || [])];
    [product.img, product.img2, product.img3].forEach((img) => {
        if (img && img !== 'img/' && !allImages.includes(img)) allImages.push(img);
    });

    appMain.innerHTML = `
<div class="max-w-5xl mx-auto pt-0 pb-20 md:py-16 px-4 detail-view-container text-left">
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

                <div class="${(product.variations && product.variations.length > 0) || (product.colorVariations && product.colorVariations.length > 0) ? 'pt-6' : '-mt-2 pt-0'}">
                    <div class="detail-accordion">
                        <button type="button" class="detail-accordion-toggle" onclick="window.toggleDetailSection(this)">
                            <span class="detail-accordion-title">Product Discription</span>
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
                            <span class="detail-accordion-title">Product Details</span>
                            <i class="fa-solid fa-chevron-down detail-accordion-arrow"></i>
                        </button>
                        <div class="detail-accordion-content hidden">
                            <div class="detail-description-text text-[13px] md:text-[14px] leading-[1.8] text-gray-600">
                                ${(() => {
            const detailsRaw = product.details || '';
            if (!detailsRaw.trim()) return '<p>Details will be updated soon.</p>';
            const lines = detailsRaw.split('\n').filter(line => line.trim());
            return lines.map(line => `<p>${line}</p>`).join('');
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

            <div class="flex gap-3 mt-10 lg:mt-auto pt-6">
                <button id="main-add-to-cart-btn" onclick="window.addToCart('${product.id}')"
                    class="flex-[3] bg-black text-white py-4 rounded-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-95 transition-all">
                    <i class="fa-solid fa-cart-shopping text-2xl"></i>
                    <div class="flex flex-col items-start leading-tight">
                        <span class="text-[8px] font-bold opacity-60 uppercase tracking-[0.2em]">Add to</span>
                        <span class="text-[13px] font-black uppercase tracking-widest leading-none mt-0.5">Cart</span>
                    </div>
                </button>
                <button id="main-inquiry-btn" onclick="inquireOnWhatsApp('${product.id}'${product.variations && product.variations.length > 0 ? `, '${product.variations[0].size}', '${product.variations[0].price}'` : (product.colorVariations && product.colorVariations.length > 0 ? `, null, '${product.colorVariations[0].price}', '${product.colorVariations[0].color}'` : '')})"
                    class="flex-1 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:text-[#25D366] hover:bg-green-50 transition-all active:scale-90 border border-gray-100">
                    <i class="fa-brands fa-whatsapp text-xl"></i>
                </button>
                <button id="detail-share-btn" onclick="window.shareProduct('${product.id}', '${product.name.replace(/'/g, "\\'")}')"
                    class="flex-1 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:text-black hover:bg-gray-100 transition-all active:scale-90 border border-gray-100">
                    <i class="fa-solid fa-share-nodes text-xl"></i>
                </button>
                <button id="detail-wish-btn" data-id="${product.id}" onclick="window.toggleWishlist(event, '${product.id}')"
                    class="flex-1 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-90 border border-gray-100">
                    <i class="${state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === product.id) ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart'} text-xl"></i>
                </button>
            </div>
        </div>
    </div>

    ${(() => {
            const currentCatId = String(product.catId || "");
            const related = DATA.p.filter(item => String(item.catId) === currentCatId && item.id !== product.id && item.inStock !== false).slice(0, 6);
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
                const isWished = state.wishlist.some(x => (typeof x === 'string' ? x : x.id) === rp.id);
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
}
