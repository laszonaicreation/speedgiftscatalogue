export function getHomeEmptyStateHtml() {
    return `
    <div class="col-span-full text-center py-40 px-6">
        <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <i class="fa-solid fa-box-open text-gray-200 text-xl"></i>
        </div>
        <h3 class="text-gray-900 font-bold text-[14px] mb-2 uppercase tracking-widest">Collection Coming Soon</h3>
        <p class="text-gray-400 text-[11px] mb-8 max-w-xs mx-auto">We are currently updating this category with premium new products. Explore our other collections in the meantime.</p>
        <button onclick="window.applyFilter('all')" class="bg-black text-white px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-105 active:scale-95 transition-all">
            View All Collections
        </button>
    </div>
    `;
}

export function getHomeBestLoadMoreMarkup({ hasMore, isExpanded, canCollapse }) {
    if (hasMore) {
        return `
        <button onclick="window.toggleHomeBestView(true)" class="bg-black text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md md:hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group view-more-btn-custom">
            View More <i class="fa-solid fa-arrow-down transform md:group-hover:translate-y-1 transition-transform"></i>
        </button>
        `;
    }
    if (isExpanded && canCollapse) {
        return `
        <button onclick="window.toggleHomeBestView(false)" class="bg-black text-white rounded-full font-black uppercase tracking-[0.2em] shadow-md md:hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group view-more-btn-custom">
            Show Less <i class="fa-solid fa-arrow-up transform md:group-hover:-translate-y-1 transition-transform"></i>
        </button>
        `;
    }
    return '';
}

export function ensureHomeLoadMoreContainer(grid) {
    let loadMoreContainer = document.getElementById('load-more-container');
    if (!loadMoreContainer) {
        loadMoreContainer = document.createElement('div');
        loadMoreContainer.id = 'load-more-container';
        loadMoreContainer.className = 'w-full flex justify-center view-more-container-custom';

        const spotlightContainer = grid.parentElement.querySelector('#spotlight-section');
        if (spotlightContainer) {
            grid.parentElement.insertBefore(loadMoreContainer, spotlightContainer);
        } else {
            grid.parentElement.appendChild(loadMoreContainer);
        }
    }
    return loadMoreContainer;
}

export function buildHomeProductCardHtml({
    p,
    idx,
    isWish,
    badgeLabel,
    imageUrl,
    isEager,
    altText
}) {
    const badgeHtml = p.badge ? `<div class="p-badge-card badge-${p.badge}">${badgeLabel}</div>` : '';
    const origPrice = parseFloat(p.originalPrice);
    const salePrice = parseFloat(p.price);
    const hasDiscount = p.originalPrice && origPrice > salePrice;
    const priceHtml = hasDiscount
        ? (() => {
            const disc = Math.round((1 - salePrice / origPrice) * 100);
            return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;">' +
                '<span style="text-decoration:line-through;color:#9ca3af;font-size:10px;font-weight:500;">' + p.originalPrice + ' AED</span>' +
                '<span class="price-tag font-bold" style="margin:0;color:#111111;">' + p.price + ' AED</span>' +
                '<span style="font-size:8px;font-weight:900;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:999px;">-' + disc + '%</span>' +
                '</div>';
        })()
        : `<p class="price-tag mt-2 font-bold">${p.price} AED</p>`;

    return `
    <div class="product-card group ${idx < 4 ? '' : 'fade-in'} ${isWish ? 'wish-active' : ''}" data-id="${p.id}" 
         onmouseenter="window.preloadProductImage('${p.id}')"
         onclick="viewDetail('${p.id}', false, null)">
        <div class="img-container mb-4 relative">
            ${badgeHtml}
            <div class="wish-btn shadow-sm hidden-desktop" onclick="toggleWishlist(event, '${p.id}')"><i class="fa-solid fa-heart text-[10px]"></i></div>
            <img src="${imageUrl}" 
                 class="${idx < 4 ? 'no-animation' : ''}"
                 ${isEager ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="low" loading="lazy"'}
                 decoding="async"
                 onload="this.classList.add('loaded')"
                 onerror="window.handleImgError(this)"
                 alt="${altText}">
        </div>
        <div class="px-1 text-left flex justify-between items-start mt-4">
            <div class="flex-1 min-w-0">
                <h3 class="capitalize truncate leading-none text-gray-900 font-semibold">${p.name}</h3>
                ${priceHtml}
            </div>
            <div class="wish-btn desktop-wish-fix hidden-mobile" onclick="toggleWishlist(event, '${p.id}')">
                <i class="fa-solid fa-heart"></i>
            </div>
        </div>
    </div>`;
}

export function renderHomeBestGridSection({
    grid,
    filtered,
    homeBestExpanded,
    getColumnsCount,
    isInWishlist,
    getBadgeLabel,
    getOptimizedUrl,
    initialEagerImages,
    ensureGridImagesVisible,
    getEmptyStateHtml,
    ensureLoadMoreContainer,
    getLoadMoreMarkup
}) {
    const cols = getColumnsCount();
    const limit = homeBestExpanded ? filtered.length : (cols * 2);
    const visibleProducts = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    let gridContent = visibleProducts.map((p, idx) => buildHomeProductCardHtml({
        p,
        idx,
        isWish: isInWishlist(p.id),
        badgeLabel: getBadgeLabel(p.badge),
        imageUrl: getOptimizedUrl(p.img, 600),
        isEager: idx < initialEagerImages,
        altText: p.name
    })).join('');

    if (visibleProducts.length > 0 && !hasMore) {
        const remainder = visibleProducts.length % cols;
        if (remainder > 0) {
            const ghosts = cols - remainder;
            for (let g = 0; g < ghosts; g++) {
                gridContent += `<div style="visibility:hidden;pointer-events:none;" aria-hidden="true"><div style="aspect-ratio:4/5;width:100%;"></div></div>`;
            }
        }
    }

    if (filtered.length === 0) {
        gridContent = getEmptyStateHtml();
    }

    const currentHeight = grid.offsetHeight;
    if (currentHeight > 0) grid.style.minHeight = `${currentHeight}px`;

    grid.innerHTML = gridContent;
    setTimeout(() => ensureGridImagesVisible(grid), 0);
    setTimeout(() => { grid.style.minHeight = ''; }, 800);

    const loadMoreContainer = ensureLoadMoreContainer(grid);
    const loadMoreMarkup = getLoadMoreMarkup({
        hasMore,
        isExpanded: homeBestExpanded,
        canCollapse: filtered.length > (cols * 2)
    });
    if (loadMoreMarkup) {
        loadMoreContainer.innerHTML = loadMoreMarkup;
        loadMoreContainer.style.display = 'flex';
    } else {
        loadMoreContainer.style.display = 'none';
    }
}

export function renderHomeCategoryRow({
    catRow,
    categories,
    activeFilter,
    getImageUrl,
    isAdminVisible
}) {
    if (!catRow) return;
    catRow.innerHTML = buildHomeCategoryRowHtml({
        categories,
        activeFilter,
        getImageUrl,
        isAdminVisible
    });

    setTimeout(() => {
        if (activeFilter === 'all') return;
        const activeItem = catRow.querySelector('.category-item.active');
        if (!activeItem) return;
        catRow.scrollTo({
            left: catRow.scrollLeft + (activeItem.getBoundingClientRect().left - catRow.getBoundingClientRect().left) - 16,
            behavior: 'smooth'
        });
    }, 100);
}

export function getHomeBestsellerProducts({ products, sort }) {
    const stockFilter = (items) => items.filter((p) => p.inStock !== false);
    let filtered = stockFilter((products || []).filter((p) => p.isFeatured));
    if (filtered.length === 0) filtered = stockFilter(products || []);

    filtered.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;

        if (sort !== 'all') {
            const priceA = parseFloat(a.price) || 0;
            const priceB = parseFloat(b.price) || 0;
            return sort === 'low' ? priceA - priceB : priceB - priceA;
        }
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return filtered;
}

export function applyHomeBestsellerSeo({
    activeCatTitle,
    activeCatTitleMob,
    activeFilter,
    updateMetaDescription,
    updateCanonicalURL
}) {
    const catNameDisplay = 'Our Bestsellers';
    if (activeCatTitle) activeCatTitle.innerText = catNameDisplay;
    if (activeCatTitleMob) activeCatTitleMob.innerText = catNameDisplay;

    document.title = `${catNameDisplay} | Speed Gifts Website`;
    try {
        updateMetaDescription(`Explore our ${catNameDisplay} collection at Speed Gifts. Premium selection of personalized gifts.`);
        const cId = activeFilter !== 'all' ? activeFilter : '';
        updateCanonicalURL(cId ? `?c=${cId}` : '');
    } catch (e) {
        console.error('SEO Update failed:', e);
    }
}

export function ensureHomeViewScaffold({ appMain, template }) {
    if (!appMain || !template) return false;
    if (!appMain.querySelector('#product-grid')) {
        appMain.innerHTML = template.innerHTML;
    }
    return true;
}

export function getHomeRenderElements(appMain) {
    if (!appMain) return null;
    return {
        catRow: appMain.querySelector('#category-row'),
        grid: appMain.querySelector('#product-grid'),
        mobileSort: appMain.querySelector('#price-sort-mob'),
        selectAllBtn: appMain.querySelector('#select-all-btn'),
        activeCatTitle: appMain.querySelector('#active-category-title'),
        activeCatTitleMob: appMain.querySelector('#active-category-title-mob'),
        categorySelector: appMain.querySelector('#category-selector-container')
    };
}

export function runHomePostRenderTasks({
    renderSlider,
    renderSpotlightSection,
    initImpressionTracking,
    syncHomeSearchUi,
    searchValue,
    mobileSort,
    sortValue,
    setHomeMobileNavActive,
    applyHomePostRenderScroll,
    isLoadMore,
    skipScroll,
    scrollPos
}) {
    renderSlider();
    renderSpotlightSection();
    initImpressionTracking();

    syncHomeSearchUi({ searchValue });
    if (mobileSort) mobileSort.value = sortValue;
    setHomeMobileNavActive();

    return applyHomePostRenderScroll({
        isLoadMore,
        skipScroll,
        searchValue,
        scrollPos
    });
}

export function buildHomeCategoryRowHtml({
    categories,
    activeFilter,
    getImageUrl,
    isAdminVisible
}) {
    return categories.map((c) => `
        <div class="category-item ${activeFilter === c.id ? 'active' : ''}" onclick="applyFilter('${c.id}', event)">
            <div class="category-img-box">
                <img src="${getImageUrl(c)}" loading="lazy" decoding="async" ${getImageUrl(c) ? "onerror=\"this.src='https://placehold.co/100x100?text=Gift'\"" : ''}>
                ${c.isPinned && isAdminVisible ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-black text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm"><i class="fa-solid fa-thumbtack text-[6px]"></i></div>' : ''}
            </div>
            <p class="category-label truncate px-1 w-full">${c.name}</p>
        </div>
    `).join('');
}

export function syncHomeSearchUi({
    searchValue,
    mobileInputId = 'customer-search',
    mobileClearId = 'clear-search-btn',
    desktopInputId = 'desk-search',
    desktopClearId = 'desk-clear-btn'
}) {
    const mobileInput = document.getElementById(mobileInputId);
    const mobileClear = document.getElementById(mobileClearId);
    const desktopInput = document.getElementById(desktopInputId);
    const desktopClear = document.getElementById(desktopClearId);

    if (mobileInput && mobileInput !== document.activeElement) mobileInput.value = searchValue || '';
    if (desktopInput && desktopInput !== document.activeElement) desktopInput.value = searchValue || '';

    if (mobileClear) {
        if (searchValue) mobileClear.classList.remove('hidden');
        else mobileClear.classList.add('hidden');
    }
    if (desktopClear) {
        if (searchValue) desktopClear.classList.remove('hidden');
        else desktopClear.classList.add('hidden');
    }
}

export function setHomeMobileNavActive(homeButtonSelector = '.mobile-nav-btn:nth-child(1)') {
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(homeButtonSelector)?.classList.add('active');
}

export function applyHomePostRenderScroll({
    isLoadMore,
    skipScroll,
    searchValue,
    scrollPos
}) {
    if (isLoadMore || skipScroll) {
        return { nextIsLoadMore: false, nextSkipScroll: false };
    }
    if (!searchValue) window.scrollTo({ top: scrollPos || 0 });
    else window.scrollTo({ top: 0 });
    return { nextIsLoadMore: isLoadMore, nextSkipScroll: skipScroll };
}
