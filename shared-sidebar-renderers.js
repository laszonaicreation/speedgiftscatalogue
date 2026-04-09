export function renderCategoriesSidebarMainLike({
    categories,
    products,
    getOptimizedUrl,
    onSelectCategoryJs = "window.closeCategoriesSidebar();"
}) {
    const container = document.getElementById('sidebar-categories-list');
    if (!container) return;

    if (!categories.length) {
        container.innerHTML = `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Categories</p>`;
        return;
    }

    container.innerHTML = categories.map(c => {
        const productCount = products.filter(p => p.catId === c.id).length;
        const imgUrl = getOptimizedUrl(c.img, 100) || 'https://placehold.co/100x100?text=Icon';
        const safeName = (c.name || 'Category').replace(/"/g, '&quot;');
        return `
            <div class="sidebar-cat-item group" onclick="${onSelectCategoryJs} applyFilter('${c.id}')">
                <div class="sidebar-cat-img-box">
                    <img src="${imgUrl}" alt="${safeName}" ${imgUrl ? "onerror=\"this.src='https://placehold.co/100x100?text=Icon'\"" : ''}>
                </div>
                <h4 class="sidebar-cat-name">${c.name || 'Category'}</h4>
                <span class="sidebar-cat-count">${productCount}</span>
            </div>
        `;
    }).join('');
}

export function renderFavoritesSidebarMainLike({
    wishlist,
    products,
    getOptimizedUrl,
    onItemClickJs,
    onRemoveClickJs
}) {
    const container = document.getElementById('sidebar-items');
    if (!container) return;

    if (wishlist.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center px-6">
                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <i class="fa-solid fa-heart text-gray-200 text-2xl"></i>
                </div>
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Your list is empty</p>
                <p class="text-[9px] text-gray-300 mt-2 leading-relaxed">Add items you love to find them here easily.</p>
            </div>
        `;
        document.getElementById('sidebar-inquiry-btn')?.classList.add('hidden');
        return;
    }

    document.getElementById('sidebar-inquiry-btn')?.classList.remove('hidden');

    const items = wishlist.map(entry => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const p = products.find(x => x.id === id);
        if (!p) return null;
        let displayP = { ...p };
        let preSelect = null;
        if (entry && typeof entry === 'object' && entry.var) {
            displayP = { ...displayP, ...entry.var };
            preSelect = entry.var;
        }
        return { ...displayP, originalId: id, preSelect };
    }).filter(Boolean);

    container.innerHTML = items.map(p => `
        <div class="sidebar-item group" onclick="${onItemClickJs(p)}">
            <div class="sidebar-img-box">
                <img src="${getOptimizedUrl(p.img, 300)}" alt="${(p.name || 'Product').replace(/"/g, '&quot;')}">
            </div>
            <div class="sidebar-info">
                <h4 class="sidebar-item-name">${p.name || 'Product'}</h4>
                <p class="sidebar-item-price">${p.price || '-'} AED</p>
            </div>
            <button onclick="event.stopPropagation(); ${onRemoveClickJs(p)}" class="sidebar-remove-btn shadow-sm">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}
