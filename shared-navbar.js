export function initSharedNavbar(config) {
    const {
        getWishlistIds,
        getProductById,
        getCategories,
        getProductUrl,
        getCategoryImage,
        onWishlistToggle,
        onCategorySelect,
        onSearchFocus,
        onAccountClick,
        onBulkInquiry,
        renderFavorites,
        renderCategories,
        onSidebarStateChange,
        showToast
    } = config;

    const getIds = () => (getWishlistIds?.() || []).map(x => (typeof x === 'string' ? x : x.id));

    function updateWishlistCounts() {
        const count = getIds().length;
        const desk = document.getElementById('nav-wishlist-count');
        const mob = document.getElementById('nav-wishlist-count-mob');
        [desk, mob].forEach(el => {
            if (!el) return;
            el.textContent = String(count);
            el.classList.toggle('hidden', count === 0);
        });
    }

    function closeFavoritesSidebar() {
        const side = document.getElementById('favorites-sidebar');
        const over = document.getElementById('favorites-sidebar-overlay');
        if (!side || !over) return;
        side.classList.remove('open');
        over.classList.remove('open');
        if (typeof onSidebarStateChange === 'function') onSidebarStateChange(false);
    }

    function closeCategoriesSidebar() {
        const side = document.getElementById('categories-sidebar');
        const over = document.getElementById('categories-sidebar-overlay');
        if (!side || !over) return;
        side.classList.remove('open');
        over.classList.remove('open');
        if (typeof onSidebarStateChange === 'function') onSidebarStateChange(false);
    }

    function renderFavoritesSidebar() {
        if (typeof renderFavorites === 'function') {
            renderFavorites();
            return;
        }
        const list = document.getElementById('sidebar-items');
        const countEl = document.getElementById('sidebar-count');
        if (!list || !countEl) return;

        const items = getIds().map(id => getProductById?.(id)).filter(Boolean);
        countEl.textContent = `${items.length} Item${items.length === 1 ? '' : 's'} Saved`;

        if (!items.length) {
            list.innerHTML = `<p class="text-[11px] text-gray-400 px-2">No favorites yet.</p>`;
            return;
        }

        list.innerHTML = items.map(p => {
            const img = getCategoryImage?.(p) || 'https://placehold.co/140x140?text=Item';
            const safeName = (p.name || 'Product').replace(/"/g, '&quot;');
            return `
                <div class="sidebar-item" onclick="window.location.href='${getProductUrl?.(p.id) || '#'}'">
                    <div class="sidebar-img-box"><img src="${img}" alt="${safeName}"></div>
                    <div class="sidebar-info">
                        <div class="sidebar-item-name">${p.name || 'Product'}</div>
                        <div class="sidebar-item-price">${p.price || '-'} AED</div>
                    </div>
                    <button class="sidebar-remove-btn" onclick="event.stopPropagation(); window.__sharedNavRemoveWish('${p.id}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    function renderSidebarCategories() {
        if (typeof renderCategories === 'function') {
            renderCategories();
            return;
        }
        const container = document.getElementById('sidebar-categories-list');
        if (!container) return;

        const categories = getCategories?.() || [];
        let html = `
            <button class="sidebar-cat-item" onclick="window.__sharedNavApplyFilter('all')">
                <div class="sidebar-cat-img-box"><img src="https://placehold.co/44x44?text=All" alt="All"></div>
                <div class="sidebar-cat-name">All Products</div>
            </button>
        `;

        html += categories.map(cat => {
            const safeName = (cat.name || 'Category').replace(/"/g, '&quot;');
            const img = getCategoryImage?.(cat) || 'https://placehold.co/44x44?text=Cat';
            return `
                <button class="sidebar-cat-item" onclick="window.__sharedNavApplyFilter('${cat.id}')">
                    <div class="sidebar-cat-img-box"><img src="${img}" alt="${safeName}"></div>
                    <div class="sidebar-cat-name">${cat.name || 'Category'}</div>
                </button>
            `;
        }).join('');

        container.innerHTML = html;
    }

    window.__sharedNavRemoveWish = (id) => {
        onWishlistToggle?.(id);
        updateWishlistCounts();
        renderFavoritesSidebar();
    };

    window.__sharedNavApplyFilter = (catId) => {
        onCategorySelect?.(catId);
        closeCategoriesSidebar();
    };

    window.handleFavoritesClick = () => {
        window.location.href = 'favourites.html';
    };

    window.closeFavoritesSidebar = () => { };

    window.openCategoriesSidebar = () => {
        renderSidebarCategories();
        const side = document.getElementById('categories-sidebar');
        const over = document.getElementById('categories-sidebar-overlay');
        if (!side || !over) return;
        side.classList.add('open');
        over.classList.add('open');
        if (typeof onSidebarStateChange === 'function') onSidebarStateChange(true);
    };

    window.closeCategoriesSidebar = closeCategoriesSidebar;

    window.sendBulkInquiry = () => {
        if (typeof onBulkInquiry === 'function') {
            onBulkInquiry();
            return;
        }
        const items = getIds().map(id => getProductById?.(id)).filter(Boolean);
        if (!items.length) {
            showToast?.('No favorites selected');
            return;
        }
        const lines = items.map((p, i) => `${i + 1}. ${p.name} - ${p.price} AED`).join('\n');
        const msg = `Hi Speed Gifts, I want inquiry for these items:\n\n${lines}`;
        window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`, '_blank');
    };

    window.handleUserAuthClick = () => {
        if (typeof onAccountClick === 'function') onAccountClick();
    };

    window.focusSearch = () => {
        if (typeof onSearchFocus === 'function') onSearchFocus();
    };

    renderSidebarCategories();
    renderFavoritesSidebar();
    updateWishlistCounts();

    return {
        refresh() {
            renderSidebarCategories();
            renderFavoritesSidebar();
            updateWishlistCounts();
        },
        closeAll() {
            closeFavoritesSidebar();
            closeCategoriesSidebar();
        }
    };
}
