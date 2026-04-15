// ─────────────────────────────────────────────────────────────────────────────
// app-spotlight.js — Home Page Spotlight Section Renderer
// Lazy-loaded after first data fetch. Does NOT block initial page parse.
// Context received via initSpotlight({ getOptimizedUrl, getBadgeLabel, getProductDetailUrl }).
// Live data read via window._sgDATA / window._sgState.
// ─────────────────────────────────────────────────────────────────────────────

export function initSpotlight({ getOptimizedUrl, getBadgeLabel, getProductDetailUrl }) {

    window.renderSpotlightSection = () => {
        const DATA  = window._sgDATA;
        const state = window._sgState;

        const appMain   = document.getElementById('app');
        const container = appMain ? appMain.querySelector('#spotlight-section') : null;
        if (!container) return;

        // Only show on main collections page (no filter, no search, no product detail)
        const isProductDetail = new URLSearchParams(window.location.search).has('p');
        if (!DATA.homeSettings || !DATA.homeSettings.spotlightEnabled || state.filter !== 'all' || state.search || isProductDetail) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        const { spotlightTitle, spotlightSubtitle, spotlightCatId, spotlightLimit, spotlightProducts: selectedIds } = DATA.homeSettings;

        if (!spotlightCatId && (!selectedIds || selectedIds.length === 0)) {
            container.classList.add('hidden');
            return;
        }

        const stockFilter    = (items) => items.filter(p => p.inStock !== false);
        let spotlightProducts = [];

        if (selectedIds && selectedIds.length > 0) {
            spotlightProducts = selectedIds.map(id => DATA.p.find(p => p.id === id)).filter(Boolean);
        } else if (spotlightCatId) {
            spotlightProducts = stockFilter(DATA.p.filter(p => p.catId === spotlightCatId));
            spotlightProducts = spotlightProducts.slice(0, spotlightLimit || 8);
        }

        const titleText = spotlightTitle || "Featured Spotlight";
        const subText   = spotlightSubtitle || "";

        const buildCard = (p, isMobile) => {
            const pImg     = [p.img, ...(p.images || []), p.img2, p.img3].find(u => u && u !== 'img/') || 'img/';
            const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${getBadgeLabel(p.badge)}</div>` : '';
            const priceHtml = (() => {
                const origPrice = parseFloat(p.originalPrice);
                const salePrice = parseFloat(p.price);
                if (p.originalPrice && origPrice > salePrice) {
                    const disc = Math.round((1 - salePrice / origPrice) * 100);
                    return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                        '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + p.originalPrice + ' AED</span>' +
                        '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + p.price + ' AED</span>' +
                        '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span></div>';
                }
                return '<p class="price-tag mt-2 font-bold">' + p.price + ' AED</p>';
            })();

            if (isMobile) {
                return `
                    <div class="product-card group flex-shrink-0 w-[160px] sm:w-[200px] snap-start" data-id="${p.id}" style="margin-right: 12px;"
                         onmouseenter="window.preloadProductImage('${p.id}')" onclick="viewDetail('${p.id}')">
                        <div class="img-container mb-4 relative">
                            ${badgeHtml}
                            <img src="${getOptimizedUrl(pImg, 600)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="window.handleImgError(this)" alt="${p.name}">
                        </div>
                        <div class="px-1 text-left flex justify-between items-start mt-4">
                            <div class="flex-1 min-w-0">
                                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                                ${priceHtml}
                            </div>
                        </div>
                    </div>`;
            } else {
                return `
                    <div class="product-card group" data-id="${p.id}"
                         onmouseenter="window.preloadProductImage('${p.id}')" onclick="viewDetail('${p.id}')">
                        <div class="img-container mb-4 relative">
                            ${badgeHtml}
                            <img src="${getOptimizedUrl(pImg, 600)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="window.handleImgError(this)" alt="${p.name}">
                        </div>
                        <div class="px-1 text-left flex justify-between items-start mt-4">
                            <div class="flex-1 min-w-0">
                                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                                ${priceHtml}
                            </div>
                        </div>
                    </div>`;
            }
        };

        const html = `
            <div class="mt-8 pt-8 md:mt-20 md:pt-12 border-t border-gray-50">
                <!-- MODERN CATEGORY HEADER (Centered) -->
                <div class="relative w-full flex items-center justify-center mb-6 md:mb-12 mt-0 fade-in min-h-0 md:min-h-[90px]">
                    <div class="text-center px-4 w-full md:px-48">
                        <h3 class="font-black capitalize tracking-wide text-gray-900"
                            style="font-family: 'Poppins', sans-serif; font-size: clamp(26px, 4vw, 38px); margin-top: 0; margin-bottom: 0; line-height: 1.1;">
                            ${titleText}
                        </h3>
                        ${subText ? `
                        <p class="font-normal capitalize text-gray-400"
                            style="font-family: 'Poppins', sans-serif; font-size: clamp(12px, 2vw, 16px); margin-top: 0.4rem; letter-spacing: 1px;">
                            ${subText}
                        </p>` : ''}
                    </div>
                    <!-- Interactive Swipe Indicator (Mobile Only) -->
                    <div class="md:hidden absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-300 pointer-events-none" style="animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
                        <span class="text-[8px] font-black uppercase tracking-[0.2em]">Swipe</span>
                        <i class="fa-solid fa-chevron-right text-[9px] translate-y-[0.5px]"></i>
                    </div>
                </div>
                
                <style>
                    .spotlight-mobile-scroll::-webkit-scrollbar { display: none; }
                    .spotlight-mobile-scroll { -ms-overflow-style: none; scrollbar-width: none; }
                    @media (max-width: 767px) {
                        .spotlight-desktop-grid { display: none !important; }
                        .spotlight-mobile-flex { display: flex !important; }
                    }
                    @media (min-width: 768px) {
                        .spotlight-desktop-grid { display: grid !important; }
                        .spotlight-mobile-flex { display: none !important; }
                    }
                </style>
                
                <!-- MOBILE SWIPE VIEW -->
                <div class="spotlight-mobile-flex related-scroll-wrapper snap-x pb-4 spotlight-mobile-scroll">
                    ${spotlightProducts.map(p => buildCard(p, true)).join('')}
                </div>

                <!-- DESKTOP GRID VIEW -->
                <div class="spotlight-desktop-grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-x-3 gap-y-8 md:gap-x-8 md:gap-y-16 lg:gap-x-10 lg:gap-y-20 mt-4 justify-center">
                    ${spotlightProducts.map(p => buildCard(p, false)).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;
        container.classList.remove('hidden');
    };
}
