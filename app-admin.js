import { createSelectionLink, copyTextToClipboard } from "./shared-selection.js";

// ============================================================================
// app-admin.js — Admin Panel (Lazy Loaded)
// Loaded ONLY when admin clicks the admin button. Normal users never download this.
// Shared context (db, auth, state, DATA, helpers) passed via initAdmin()
// ============================================================================

// Preload Cloudinary widget script in the background as soon as admin module loads.
// By the time admin clicks an upload button, the script will be ready.
// This keeps cloudinaryUpload() synchronous (no popup-blocker issues).
(function () {
    if (window.cloudinary) return;
    const s = document.createElement('script');
    s.src = 'https://upload-widget.cloudinary.com/global/all.js';
    s.async = true;
    document.head.appendChild(s);
})();

export function initAdmin(ctx) {
    const {
        db, auth, state, DATA, appId,
        prodCol, catCol, sliderCol, megaCol,
        popupSettingsCol, landingSettingsCol, leadsCol,
        doc, setDoc, addDoc, deleteDoc, updateDoc, getDoc, getDocs,
        collection, increment, writeBatch, arrayUnion,
        query, where, documentId,
        refreshData, renderHome, getAuth,
        getColumnsCount
    } = ctx;
    const shareCol = collection(db, 'artifacts', appId, 'public', 'data', 'selections');
    if (!Array.isArray(state.selected)) state.selected = [];
    if (typeof state.selectionId === 'undefined') state.selectionId = null;
    let megaMenuEditSelection = null;
window.addColorVariationRow = (colorName = '', price = '', images = [], hex = '#000000') => {
    const container = document.getElementById('color-variation-rows');
    if (!container) return;
    const rowId = 'v-color-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.className = 'color-variation-row bg-white p-4 rounded-xl border border-gray-100 space-y-3 relative fade-in';
    div.innerHTML = `
        <button onclick="this.parentElement.remove()" class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all">
            <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
        <div class="grid grid-cols-2 gap-2">
            <input type="text" class="vc-color admin-input !bg-gray-50" placeholder="Color Name" value="${colorName}">
                <input type="text" class="vc-price admin-input !bg-gray-50" placeholder="Price" value="${price}">
                </div>
                <div class="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                    <span class="text-[9px] font-black uppercase text-gray-400 ml-2">Visual Color:</span>
                    <input type="color" class="vc-hex h-8 w-12 rounded cursor-pointer bg-transparent border-none" value="${hex}">
                        <span class="text-[10px] font-mono text-gray-400">${hex}</span>
                </div>
                <div class="space-y-2">
                    <div id="${rowId}-grid" class="grid grid-cols-4 gap-2 vc-image-grid"></div>
                    <div class="drop-zone flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-gray-100 group hover:border-black transition-all" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleMultiDrop(event, '${rowId}-grid')">
                        <i class="fa-solid fa-images text-gray-200 group-hover:text-black transition-all"></i>
                        <button type="button" onclick="window.cloudinaryMultiUpload('${rowId}-grid')" class="text-[8px] font-black uppercase px-3 py-2 bg-gray-100 rounded-lg hover:bg-black hover:text-white transition-all">Add Photos</button>
                    </div>
                </div>
                `;

    const picker = div.querySelector('.vc-hex');
    picker.addEventListener('input', (e) => {
        e.target.nextElementSibling.innerText = e.target.value.toUpperCase();
    });

    container.appendChild(div);
    if (images && images.length > 0) {
        images.forEach(img => window.addImageToGrid(`${rowId}-grid`, img));
    } else if (typeof images === 'string' && images !== 'img/') {
        window.addImageToGrid(`${rowId}-grid`, images);
    }
};

window.addVariationRow = (size = '', price = '', images = []) => {
    const container = document.getElementById('variation-rows');
    if (!container) return;
    const rowId = 'v-size-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.className = 'variation-row bg-white p-4 rounded-xl border border-gray-100 space-y-3 relative fade-in';
    div.innerHTML = `
                <button onclick="this.parentElement.remove()" class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
                <div class="grid grid-cols-2 gap-2">
                    <input type="text" class="v-size admin-input !bg-gray-50" placeholder="Size" value="${size}">
                        <input type="text" class="v-price admin-input !bg-gray-50" placeholder="Price" value="${price}">
                        </div>
                        <div class="space-y-2">
                            <div id="${rowId}-grid" class="grid grid-cols-4 gap-2 v-image-grid"></div>
                            <div class="drop-zone flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-gray-100 group hover:border-black transition-all" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleMultiDrop(event, '${rowId}-grid')">
                                <i class="fa-solid fa-images text-gray-200 group-hover:text-black transition-all"></i>
                                <button type="button" onclick="window.cloudinaryMultiUpload('${rowId}-grid')" class="text-[8px] font-black uppercase px-3 py-2 bg-gray-100 rounded-lg hover:bg-black hover:text-white transition-all">Add Photos</button>
                            </div>
                        </div>
                        `;
    container.appendChild(div);
    if (images && images.length > 0) {
        images.forEach(img => window.addImageToGrid(`${rowId}-grid`, img));
    } else if (typeof images === 'string' && images !== 'img/') {
        window.addImageToGrid(`${rowId}-grid`, images);
    }
};

window.saveProduct = async () => {
    const id = document.getElementById('edit-id')?.value;
    const btn = document.getElementById('p-save-btn');

    // Collect images
    const images = collectImagesFromGrid('p-image-grid');
    const primaryImg = images[0] || 'img/';

    // Collect size variations
    const variationRows = document.querySelectorAll('.variation-row');
    const variations = Array.from(variationRows).map(row => {
        const gridId = row.querySelector('.v-image-grid').id;
        const varImages = collectImagesFromGrid(gridId);
        return {
            size: row.querySelector('.v-size').value,
            price: row.querySelector('.v-price').value,
            images: varImages,
            img: varImages[0] || 'img/' // fallback for existing logic
        };
    }).filter(v => v.size || v.price);

    // Collect color variations
    const colorRows = document.querySelectorAll('.color-variation-row');
    const colorVariations = Array.from(colorRows).map(row => {
        const gridId = row.querySelector('.vc-image-grid').id;
        const varImages = collectImagesFromGrid(gridId);
        return {
            color: row.querySelector('.vc-color').value,
            price: row.querySelector('.vc-price').value,
            images: varImages,
            img: varImages[0] || 'img/', // fallback
            hex: row.querySelector('.vc-hex').value
        };
    }).filter(v => v.color || v.price);

    const data = {
        name: document.getElementById('p-name')?.value || "",
        price: document.getElementById('p-price')?.value || "",
        originalPrice: document.getElementById('p-original-price')?.value || "",
        size: "",
        material: "",
        inStock: document.getElementById('p-stock')?.checked ?? true,
        img: primaryImg || "img/",
        images: images || [],
        catId: document.getElementById('p-cat-id')?.value || "",
        badge: document.getElementById('p-badge')?.value || "",
        isFeatured: document.getElementById('p-featured')?.value === 'true',
        desc: document.getElementById('p-desc')?.value || "",
        details: document.getElementById('p-details')?.value || "",
        keywords: document.getElementById('p-keywords')?.value || "",
        isPinned: document.getElementById('p-pinned')?.checked || false,
        variations: variations || [],
        colorVariations: colorVariations || [],
        updatedAt: Date.now()
    };
    if (!data.name || !data.img) return showToast("Required info missing");
    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try { if (id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id), data); else await addDoc(prodCol, data); showToast("Synced Successfully"); resetForm(); DATA.p = []; refreshData(); }
    catch (e) { console.error("Save Error:", e); showToast("Save Error"); } finally { if (btn) { btn.disabled = false; btn.innerText = "Sync Product"; } }
};

window.saveCategory = async () => {
    const id = document.getElementById('edit-cat-id')?.value;
    const btn = document.getElementById('c-save-btn');
    const data = {
        name: document.getElementById('c-name')?.value,
        img: document.getElementById('c-img')?.value,
        isPinned: document.getElementById('c-pinned')?.checked || false,
        pinnedAt: document.getElementById('c-pinned')?.checked ? (DATA.c.find(c => c.id === id)?.pinnedAt || Date.now()) : null
    };
    if (!data.name) return showToast("Name required");
    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try { if (id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', id), data); else await addDoc(catCol, data); showToast("Category Synced"); resetForm(); DATA.p = []; refreshData(); }
    catch (e) { console.error("Category Error:", e); showToast("Category Error"); } finally { if (btn) { btn.disabled = false; btn.innerText = "Sync Category"; } }
};

window.deleteProduct = async (id) => { if (!confirm("Are you sure?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id)); showToast("Deleted"); refreshData(); } catch (e) { showToast("Delete Error"); } };
window.deleteCategory = async (id) => { if (!confirm("Delete Category?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', id)); showToast("Category Removed"); refreshData(); } catch (e) { showToast("Error"); } };

window.saveMegaMenu = async () => {
    const id = document.getElementById('edit-megamenu-id')?.value;
    const btn = document.getElementById('m-save-btn');

    // Collect checked subcategories
    const checkboxes = document.querySelectorAll('.mega-cat-checkbox:checked');
    const categoryIds = Array.from(checkboxes).map(cb => cb.value);

    const data = {
        name: document.getElementById('m-name')?.value,
        categoryIds: categoryIds,
        order: id ? (DATA.m.find(m => m.id === id)?.order || 0) : Date.now() // simple ordering
    };
    if (!data.name) return showToast("Name required");
    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try {
        if (id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'mega_menus', id), data);
        else await addDoc(megaCol, data);
        showToast("Mega Menu Synced");
        resetForm();
        refreshData();
    }
    catch (e) { console.error("Mega Menu Error:", e); showToast("Mega Menu Error"); }
    finally { if (btn) { btn.disabled = false; btn.innerText = "Save Desktop Menu"; } }
};

window.deleteMegaMenu = async (id) => { if (!confirm("Delete Desktop Menu?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'mega_menus', id)); showToast("Menu Removed"); refreshData(); } catch (e) { showToast("Error"); } };

window.editMegaMenu = (id) => {
    const item = DATA.m.find(x => x.id === id);
    if (!item) return;
    const selectedIds = new Set();
    (Array.isArray(item.categoryIds) ? item.categoryIds : []).forEach((entry) => {
        if (!entry) return;
        if (typeof entry === 'string') {
            selectedIds.add(entry);
            selectedIds.add(entry.trim());
            selectedIds.add(entry.toLowerCase().trim());
            return;
        }
        if (typeof entry === 'object') {
            const rawId = String(entry.id || entry.value || entry.catId || '').trim();
            const rawName = String(entry.name || entry.label || '').trim();
            if (rawId) {
                selectedIds.add(rawId);
                selectedIds.add(rawId.toLowerCase());
            }
            if (rawName) {
                selectedIds.add(rawName);
                selectedIds.add(rawName.toLowerCase());
            }
        }
    });
    megaMenuEditSelection = selectedIds;

    // 1) Switch tab first so megamenu form/checklist exists
    switchAdminTab('megamenu');

    // 2) Fill edit meta fields
    const editId = document.getElementById('edit-megamenu-id');
    const mName = document.getElementById('m-name');
    const mFormTitle = document.getElementById('m-form-title');
    if (editId) editId.value = item.id;
    if (mName) mName.value = item.name;
    if (mFormTitle) mFormTitle.innerText = 'Editing: ' + item.name;

    // 3) Rebuild checklist so latest category list is present
    renderAdminMegaMenus();

    // 4) Tick selected categories (retry briefly in case tab render is async)
    const applyTicks = () => {
        const boxes = document.querySelectorAll('.mega-cat-checkbox');
        if (!boxes.length) return false;
        boxes.forEach(cb => {
            const rawVal = String(cb.value || '').trim();
            const cat = (DATA.c || []).find((c) => c.id === rawVal);
            const catName = String(cat?.name || '').trim();
            cb.checked =
                selectedIds.has(rawVal) ||
                selectedIds.has(rawVal.toLowerCase()) ||
                (catName && (selectedIds.has(catName) || selectedIds.has(catName.toLowerCase())));
            cb.dispatchEvent(new Event('change'));
        });
        return true;
    };

    if (!applyTicks()) {
        let tries = 0;
        const maxTries = 8;
        const retry = () => {
            if (applyTicks() || tries >= maxTries) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            tries += 1;
            requestAnimationFrame(retry);
        };
        requestAnimationFrame(retry);
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.editProduct = (id) => {
    const item = DATA.p.find(x => x.id === id);
    if (!item) return;
    const editId = document.getElementById('edit-id');
    const pName = document.getElementById('p-name');
    const pPrice = document.getElementById('p-price');
    const pStock = document.getElementById('p-stock');
    const pPinned = document.getElementById('p-pinned');
    const pCatId = document.getElementById('p-cat-id');
    const pBadge = document.getElementById('p-badge'); // Added
    const pFeatured = document.getElementById('p-featured');
    const pDesc = document.getElementById('p-desc');
    const pDetails = document.getElementById('p-details');
    const pKeywords = document.getElementById('p-keywords');
    const pFormTitle = document.getElementById('p-form-title');

    if (editId) editId.value = item.id;
    if (pName) pName.value = item.name;
    if (pPrice) pPrice.value = item.price;
    if (pStock) pStock.checked = item.inStock !== false;
    if (pPinned) pPinned.checked = item.isPinned || false;
    if (pCatId) pCatId.value = item.catId || "";
    if (pBadge) pBadge.value = item.badge || ""; // Added
    if (pFeatured) pFeatured.value = item.isFeatured ? 'true' : 'false';
    const pOriginalPrice = document.getElementById('p-original-price');
    if (pOriginalPrice) pOriginalPrice.value = item.originalPrice || "";

    if (pDesc) pDesc.value = item.desc;
    if (pDetails) pDetails.value = item.details || "";
    if (pKeywords) pKeywords.value = item.keywords || "";
    if (pFormTitle) pFormTitle.innerText = "Editing: " + item.name;

    document.getElementById('p-pinned').checked = item.isPinned || false;
    document.getElementById('p-keywords').value = item.keywords || '';

    // Load images
    const pGrid = document.getElementById('p-image-grid');
    if (pGrid) {
        pGrid.innerHTML = '';
        const allImages = [...(item.images || [])];
        // Migration: Add legacy images if not in array
        [item.img, item.img2, item.img3].forEach(img => {
            if (img && img !== 'img/' && !allImages.includes(img)) {
                allImages.push(img);
            }
        });
        allImages.forEach(url => window.addImageToGrid('p-image-grid', url));
    }

    // Load size variations
    const varRows = document.getElementById('variation-rows');
    if (varRows) {
        varRows.innerHTML = '';
        if (item.variations && item.variations.length > 0) {
            item.variations.forEach(v => window.addVariationRow(v.size, v.price, v.images || v.img));
        }
    }

    // Load color variations
    const colorRows = document.getElementById('color-variation-rows');
    if (colorRows) {
        colorRows.innerHTML = '';
        if (item.colorVariations && item.colorVariations.length > 0) {
            item.colorVariations.forEach(v => window.addColorVariationRow(v.color, v.price, v.images || v.img, v.hex || '#000000'));
        }
    }

    switchAdminTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.editCategory = (id) => {
    const item = DATA.c.find(x => x.id === id);
    if (!item) return;
    const editCatId = document.getElementById('edit-cat-id');
    const cName = document.getElementById('c-name');
    const cImg = document.getElementById('c-img');
    const cPinned = document.getElementById('c-pinned');
    const cFormTitle = document.getElementById('c-form-title');

    if (editCatId) editCatId.value = item.id;
    if (cName) cName.value = item.name;
    if (cImg) cImg.value = item.img;
    if (cPinned) cPinned.checked = item.isPinned || false;
    if (cFormTitle) cFormTitle.innerText = "Editing: " + item.name;
    switchAdminTab('categories');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.exportData = () => {
    try {
        const backup = { products: DATA.p, categories: DATA.c, timestamp: Date.now() };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); if (!a) return; a.href = url;
        a.download = `speedgifts_backup_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("Backup Created!");
    } catch (err) { showToast("Export Failed"); }
};

window.exportExcel = () => {
    try {
        if (DATA.p.length === 0) return showToast("No products found");
        const escapeCSV = (val) => { if (val === undefined || val === null) return '""'; let s = String(val).replace(/"/g, '""'); return `"${s}"`; };
        const headers = ["ID", "Name", "Price (AED)", "Category", "Stock Status", "Size", "Material", "Description", "Image 1", "Image 2", "Image 3"];
        const rows = DATA.p.map(p => {
            const catName = DATA.c.find(c => c.id === p.catId)?.name || "Uncategorized";
            const stockStatus = p.inStock !== false ? "In Stock" : "Out of Stock";
            return [p.id, p.name, p.price, catName, stockStatus, p.size || "", p.material || "", p.desc || "", p.img, p.img2 || "", p.img3 || ""].map(escapeCSV).join(",");
        });
        const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); if (!a) return; a.href = url;
        a.download = `speedgifts_inventory_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("Excel Exported!");
    } catch (err) { showToast("Export Failed"); }
};

// NEW: UNIVERSAL MIGRATION LOGIC (FOR FUTURE DB SWITCHING)
window.copyUniversalJSON = () => {
    try {
        const universalBackup = {
            metadata: {
                source: "Speed Gifts Boutique UI",
                version: "2.6.0",
                exportDate: new Date().toISOString(),
                schema: {
                    products: ["id", "name", "price", "catId", "stockStatus", "size", "material", "description", "images"]
                }
            },
            categories: DATA.c.map(c => ({ id: c.id, name: c.name, iconUrl: c.img })),
            products: DATA.p.map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                catId: p.catId,
                stockStatus: p.inStock !== false ? "instock" : "outofstock",
                specs: { size: p.size || "", material: p.material || "" },
                description: p.desc || "",
                images: p.images || [p.img, p.img2, p.img3].filter(u => u && u !== 'img/'),
                variations: p.variations || [],
                colorVariations: p.colorVariations || []
            }))
        };

        const jsonStr = JSON.stringify(universalBackup, null, 2);
        const textArea = document.createElement("textarea");
        if (!textArea) return;
        textArea.value = jsonStr;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast("Universal Migration JSON Copied!");
    } catch (err) { showToast("Migration Prep Failed"); }
};

window.importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm("This will add items from backup to current project. Continue?")) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            showToast("Restoring... Please Wait");

            // 1. Map old IDs to Names from the backup file
            const catOldIdToName = {};
            if (data.categories) {
                data.categories.forEach(c => { if (c.id) catOldIdToName[c.id] = (c.name || "").trim(); });
            }

            // 2. Handle/Create Categories & Build Name to New ID Map
            if (data.categories) {
                for (const cat of data.categories) {
                    const trimmedName = (cat.name || "").trim();
                    const exists = DATA.c.find(c => c.name.trim() === trimmedName);
                    if (!exists) {
                        const cleanCat = { name: trimmedName, img: cat.img || cat.iconUrl || "img/" };
                        const newDoc = await addDoc(catCol, cleanCat);
                        // Add to a temp list so we can map right away
                        DATA.c.push({ id: newDoc.id, ...cleanCat });
                    }
                }
            }

            // Build the final mapping: Trimmed Name -> Current/New ID
            const nameToNewId = {};
            DATA.c.forEach(c => { nameToNewId[c.name.trim()] = c.id; });

            // 3. Handle Products
            if (data.products) {
                for (const p of data.products) {
                    // Find the NEW Category ID
                    let finalCatId = "";
                    const oldCatName = catOldIdToName[p.catId];
                    if (oldCatName && nameToNewId[oldCatName]) {
                        finalCatId = nameToNewId[oldCatName];
                    } else if (p.catId && nameToNewId[p.catId]) {
                        // Fallback if catId in backup was already a name or matches exactly
                        finalCatId = nameToNewId[p.catId];
                    }

                    const pImg = (p.images && p.images[0]) || p.img || "img/";

                    // Refined Duplicate Check (Name + Category + Primary Image)
                    const isDuplicate = DATA.p.some(ep =>
                        ep.name === p.name &&
                        ep.catId === finalCatId &&
                        (ep.img === pImg)
                    );
                    if (isDuplicate) continue;

                    const cleanProd = {
                        name: p.name || "",
                        price: p.price || "",
                        catId: finalCatId,
                        badge: p.badge || "", // Added badge
                        desc: p.desc || p.description || "",
                        size: (p.specs ? p.specs.size : (p.size || "")),
                        material: (p.specs ? p.specs.material : (p.material || "")),
                        inStock: p.inStock !== undefined ? p.inStock : (p.stockStatus !== "outofstock"),
                        isPinned: p.isPinned || false,
                        keywords: p.keywords || "",
                        updatedAt: p.updatedAt || Date.now(),
                        // New fields
                        images: p.images || [],
                        variations: p.variations || [],
                        colorVariations: p.colorVariations || []
                    };

                    // Legacy image mapping for backward compatibility
                    if (p.images && Array.isArray(p.images)) {
                        cleanProd.img = p.images[0] || "img/";
                        cleanProd.img2 = p.images[1] || "img/";
                        cleanProd.img3 = p.images[2] || "img/";
                    } else if (p.img) {
                        cleanProd.img = p.img || "img/";
                        cleanProd.img2 = p.img2 || "img/";
                        cleanProd.img3 = p.img3 || "img/";
                        // Auto-migrate to images array if missing
                        if (!cleanProd.images || cleanProd.images.length === 0) {
                            cleanProd.images = [p.img, p.img2, p.img3].filter(u => u && u !== 'img/');
                        }
                    }

                    await addDoc(prodCol, cleanProd);
                }
            }
            showToast("Restore Successful!");
            refreshData();
        } catch (err) {
            console.error(err);
            showToast("Import Failed");
        }
    };
    reader.readAsText(file);
};

window.toggleSelect = (e, id) => {
    e.stopPropagation();
    const card = e.target.closest('.product-card');
    if (state.selected.includes(id)) {
        state.selected = state.selected.filter(x => x !== id);
        if (card) card.classList.remove('selected');
    } else {
        state.selected.push(id);
        if (card) card.classList.add('selected');
    }
    updateSelectionBar();
};

window.clearSelection = () => { state.selected = []; state.selectionId = null; state.skipScroll = true; renderHome(); };

window.shareSelection = async () => {
    if (state.selected.length === 0) return;
    showToast("Generating link...");
    try {
        const shareUrl = await createSelectionLink({
            addDoc,
            shareCol,
            ids: state.selected,
            baseUrl: `${window.location.origin}${window.location.pathname}`
        });
        await copyTextToClipboard(shareUrl);
        showToast("Secret Link Copied!");
    }
    catch (e) { showToast("Sharing failed."); }
};

window.sendBulkInquiry = () => {
    // Determine which list to use (Selected items for sharing OR Wishlist for sidebar)
    const isSidebarOpen = document.getElementById('favorites-sidebar')?.classList.contains('open');
    const sourceData = isSidebarOpen ? state.wishlist : state.selected;

    if (sourceData.length === 0) return showToast("No items to inquire");

    let msg = `*Hello Speed Gifts!*\nI am interested in these items from my ${isSidebarOpen ? 'Favorites' : 'Selection'}:\n\n`;

    sourceData.forEach((entry, i) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const p = DATA.p.find(x => x.id === id);
        if (!p) return;

        let details = "";
        const price = (entry.var && entry.var.price) ? entry.var.price : p.price;
        if (entry.var) {
            if (entry.var.size) details += ` (Size: ${entry.var.size})`;
            if (entry.var.color) details += ` (Color: ${entry.var.color})`;
        }

        const pUrl = `${window.location.origin}${window.location.pathname}?p=${id}`;
        msg += `${i + 1}. *${p.name}* - ${price} AED${details}\nLink: ${pUrl}\n\n`;
    });

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    const productIdsToTrack = sourceData.map(entry => typeof entry === 'string' ? entry : entry.id);
    window.trackWhatsAppInquiry(productIdsToTrack);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.inquireOnWhatsApp = (id, selectedSize = null, selectedPrice = null, selectedColor = null) => {
    const p = DATA.p.find(x => x.id === id);
    if (!p) return;
    const pUrl = `${window.location.origin}${window.location.pathname}?p=${p.id}`;
    const price = selectedPrice || p.price;
    let details = "";
    if (selectedSize) details += `\n*Size:* ${selectedSize}`;
    if (selectedColor) details += `\n*Color:* ${selectedColor}`;
    if (!selectedSize && !selectedColor && p.size) details += `\n*Size:* ${p.size}`;

    let msg = `*Inquiry regarding:* ${p.name}\n*Price:* ${price} AED${details}\n\n*Product Link:* ${pUrl}\n\nPlease let me know the availability.`;

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    window.trackWhatsAppInquiry(p.id);
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.handleFloatingWhatsAppClick = () => {
    let msg = `*Hello Speed Gifts!* \nI visited your website and would like to know more about your premium gift collections.`;

    const source = sessionStorage.getItem('traffic_source');
    if (source === 'Google Ads') {
        msg += `\n\n*Note: Customer joined via Google Ads* 🔍`;
    } else if (source) {
        msg += `\n\n[Source: ${source}]`;
    }

    // Tracking the inquiry specifically from the floating button
    window.trackWhatsAppInquiry('floating_button');
    window.open(`https://wa.me/971561010387?text=${encodeURIComponent(msg)}`);
};

window.switchImg = (src, el) => {
    const main = document.getElementById('main-detail-img');
    if (main) {
        main.src = getOptimizedUrl(src, 1200);
        // Update click handler for full-screen preview
        main.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${src}')`);
    }
    document.querySelectorAll('.thumb-box').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
};

window.handleZoom = (e, container) => {
    // Only zoom if it's a mouse event and not a touch simulation that triggers click
    const img = container?.querySelector('img');
    if (!img) return;
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    img.style.transformOrigin = `${x}% ${y}%`;
    img.style.transform = 'scale(2)';
};

window.resetZoom = (container) => {
    const img = container?.querySelector('img');
    if (!img) return;
    img.style.transform = 'scale(1)';
    img.style.transformOrigin = `center center`;
};

window.openFullScreen = (src) => {
    const overlay = document.getElementById('img-full-preview');
    const fullImg = document.getElementById('full-preview-img');
    if (overlay && fullImg) {
        fullImg.src = src;
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
};

window.toggleDescription = (btn) => {
    const content = btn.parentElement.querySelector('.desc-content');
    if (content.classList.contains('line-clamp-4')) {
        content.classList.remove('line-clamp-4');
        btn.innerText = "Read Less";
    } else {
        content.classList.add('line-clamp-4');
        btn.innerText = "Read More";
        // Optional: scroll back to top of container if it was long
        btn.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.closeFullScreen = () => {
    const overlay = document.getElementById('img-full-preview');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

window.renderAdminUI = () => {
    const pList = document.getElementById('admin-product-list');
    const cList = document.getElementById('admin-category-list');
    const iList = document.getElementById('admin-insights-list');
    if (!iList) return;

    if (state.adminTab === 'insights') {
        // window.renderInsights is async (lazy-loads app-insights.js on first call)
        // Use Promise chain so both sync and async errors are caught properly
        const insightsResult = window.renderInsights(iList);
        if (insightsResult && typeof insightsResult.catch === 'function') {
            insightsResult.catch(err => {
                console.error('[Admin] renderInsights failed:', err);
                iList.innerHTML = `<div class="p-10 text-center bg-red-50 rounded-[2rem] border border-red-100"><p class="text-red-500 font-bold text-[11px] uppercase tracking-widest">Insights failed to render</p><p class="text-red-300 text-[9px] mt-2">Please refresh and try again.</p></div>`;
            });
        }
        return;
    }
    if (!pList || !cList) return;
    if (state.adminTab === 'leads') {
        renderAdminLeads();
        return;
    }
    const filterEl = document.getElementById('admin-cat-filter');
    const catFilter = filterEl ? filterEl.value : "all";

    let products = DATA.p.filter(p => {
        const matchesCat = catFilter === 'all' || p.catId === catFilter;
        return matchesCat;
    });

    const grouped = {};
    products.forEach(p => {
        const catName = DATA.c.find(c => c.id === p.catId)?.name || "Uncategorized";
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(p);
    });

    let pHtml = "";
    Object.keys(grouped).sort().forEach(cat => {
        pHtml += `<div class="col-span-full mt-10 mb-4 flex items-center gap-4">
    <h5 class="text-[15px] font-semibold text-gray-800 tracking-tight text-gray-400 shrink-0">${cat}</h5>
    <div class="h-[1px] bg-gray-100 flex-1"></div>
    <span class="text-[13px] font-medium text-gray-500 shrink-0">${grouped[cat].length} Items</span>
</div>`;

        grouped[cat].forEach(p => {
            const stockTag = p.inStock !== false ? '<span class="stock-badge in">In Stock</span>' : '<span class="stock-badge out">Out of Stock</span>';
            const pinIcon = p.isPinned ? '<div class="absolute top-3 left-3 w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg z-20"><i class="fa-solid fa-thumbtack text-[10px]"></i></div>' : '';
            const badgeHtml = p.badge ? `<div class="absolute top-3 left-10 px-3 py-1 bg-black text-white text-[8px] font-black uppercase rounded-full shadow-lg z-10">${getBadgeLabel(p.badge)}</div>` : '';
            const viewCount = (p.views || 0) + (p.adViews || 0);

            pHtml += `
                        <div class="admin-product-card group">
                            <div class="admin-product-img-box">
                                <img src="${getOptimizedUrl(p.img, 400)}" alt="${p.name}">
                                ${pinIcon}
                                ${badgeHtml}
                                <div class="admin-card-actions">
                                    <button onclick="editProduct('${p.id}')" class="admin-action-btn" title="Edit Item">
                                        <i class="fa-solid fa-pen-to-square text-[11px]"></i>
                                    </button>
                                    <button onclick="deleteProduct('${p.id}')" class="admin-action-btn delete" title="Delete Item">
                                        <i class="fa-solid fa-trash text-[11px]"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="admin-product-info">
                                <h4 class="font-bold text-[13px] capitalize truncate text-gray-800">${p.name}</h4>
                                <div class="flex items-center justify-between mt-1">
                                    <p class="text-[10px] text-gray-500 font-black tracking-widest uppercase">${p.price} AED</p>
                                    ${stockTag}
                                </div>
                            </div>
                        </div>
                        `;
        });
    });

    const prodCountEl = document.getElementById('admin-prod-count');
    if (prodCountEl) {
        const isProd = state.adminTab === 'products';
        prodCountEl.innerText = `${products.length} Products`;
        prodCountEl.classList.toggle('hidden', !isProd);
    }

    pList.innerHTML = pHtml || `<div class="col-span-full py-40 text-center"><p class="text-[13px] text-gray-500 font-medium italic">No items found.</p></div>`;

    cList.innerHTML = DATA.c.map(c => `
                        <div class="flex items-center gap-4 p-4 bg-white rounded-[1.5rem] border border-gray-100 relative group transition-all hover:border-black hover:shadow-xl hover:-translate-y-1">
                            <div class="relative shrink-0">
                                <img src="${getOptimizedUrl(c.img, 100) || 'https://placehold.co/100x100?text=Icon'}" class="w-12 h-12 rounded-xl object-cover" ${getOptimizedUrl(c.img, 100) ? "onerror=\"this.src='https://placehold.co/100x100?text=Icon'\"" : ''}>
                                ${c.isPinned ? '<div class="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center border-2 border-white shadow-lg"><i class="fa-solid fa-thumbtack text-[7px]"></i></div>' : ''}
                            </div>
                            <div class="flex-1 font-bold text-[12px] uppercase tracking-tight truncate">${c.name}</div>
                            <div class="flex gap-2">
                                <button onclick="editCategory('${c.id}')" class="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-500 rounded-xl hover:bg-blue-100 hover:text-black transition-all hover:scale-110 hover:shadow-lg active:scale-95">
                                    <i class="fa-solid fa-pen text-[11px]"></i>
                                </button>
                                <button onclick="deleteCategory('${c.id}')" class="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 hover:text-black transition-all hover:scale-110 hover:shadow-lg active:scale-95">
                                    <i class="fa-solid fa-trash text-[11px]"></i>
                                </button>
                            </div>
                        </div>
                        `).join('') || `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Categories</p>`;
};

window.handleCategoryRowScroll = window.handleCategoryRowScroll || ((el) => {
    const container = el.parentElement;
    if (!container) return;
    const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
    if (isAtEnd) container.classList.add('scrolled-end');
    else container.classList.remove('scrolled-end');

    // Update progress bar
    const bar = document.getElementById('cat-scroll-bar');
    if (bar && el.scrollWidth > el.clientWidth) {
        const scrollRatio = el.scrollLeft / (el.scrollWidth - el.clientWidth);
        // Bar goes from 20% (at start) to 100% (at end)
        const barWidth = 20 + scrollRatio * 80;
        bar.style.width = barWidth + '%';
    }
});

window.applyFilter = window.applyFilter || ((id, e) => {
    if (e) e.stopPropagation();
    state.filter = id;
    state.search = '';
    state.scrollPos = 0;

    // Only push state if not already in that filter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('c') !== id) {
        safePushState({ c: id === 'all' ? null : id, q: null, p: null });
    }

    renderHome();
});
window.showSearchSuggestions = window.showSearchSuggestions || ((show) => {
    // Both desktop and mobile search tags are scoped by IDs globally now
    // the desktop search tags might have a different ID, but mobile is 'search-tags'
    const tags = document.getElementById('search-tags');
    if (tags) {
        if (show) tags.classList.remove('hidden');
        else setTimeout(() => {
            const currentTags = document.getElementById('search-tags');
            if (currentTags) currentTags.classList.add('hidden');
        }, 200);
    }
});
let searchTimeout;
window.applyCustomerSearch = window.applyCustomerSearch || ((val) => {
    state.search = val;
    if (val && !state.selectionId) {
        state.filter = 'all';
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        // Push state for search (replace if same type to avoid polluting history with every letter)
        const urlParams = new URLSearchParams(window.location.search);
        const currentQ = urlParams.get('q') || '';
        if (val !== currentQ) {
            // Use replaceState if we are just refining a search, pushState for a new search
            const isRefining = currentQ && val.startsWith(currentQ);
            safePushState({ q: val || null, c: 'all', p: null }, isRefining);
        }
        // Use lightweight search-only render (skips category row, mega menu, slider)
        renderSearchResults();
    }, 500); // 500ms debounce — good balance of speed vs. unnecessary renders

    // Update Clear Button UI immediately with safety
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
        if (val) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    const deskClearBtn = document.getElementById('desk-clear-btn');
    if (deskClearBtn) {
        if (val) deskClearBtn.classList.remove('hidden');
        else deskClearBtn.classList.add('hidden');
    }
});
window.clearCustomerSearch = window.clearCustomerSearch || (() => {
    state.search = '';
    exitSearchMode();
    const input = document.getElementById('customer-search');
    const deskInput = document.getElementById('desk-search');
    if (input) { input.value = ''; input.blur(); }
    if (deskInput) deskInput.value = '';
    // Clear the clear buttons
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const deskClearBtn = document.getElementById('desk-clear-btn');
    if (deskClearBtn) deskClearBtn.classList.add('hidden');
    // Clear URL search param
    safePushState({ q: null, c: null, p: null });
    renderHome();
});
window.applyPriceSort = window.applyPriceSort || ((sort) => { state.sort = sort; renderHome(); });
window.showAdminPanel = async () => {
    const u = state.authUser || window._fbAuth?.currentUser || getAuth().currentUser;

    // Auto-retry once to give Firebase time to log in
    if (!u && !window._adminAuthAttempted) {
        window._adminAuthAttempted = true;
        showToast("Verifying Admin Access...");
        setTimeout(() => window.showAdminPanel(), 1500);
        return;
    }

    // Strict block
    if (!u || u.email !== "laszonaicreation@gmail.com") {
        alert("ACCESS DENIED: You are not authorized to view the control panel.");
        window.hideAdminPanel();
        const url = new URL(window.location);
        url.searchParams.delete('admin');
        window.history.replaceState({}, '', url);
        return;
    }

    if (window.innerWidth < 1024) {
        alert("The Admin Panel is only accessible on Desktop devices. Please switch to a computer.");
        return;
    }
    // Lazy-load admin HTML if not present in DOM yet
    let adminPanelEl = document.getElementById('admin-panel');
    if (!adminPanelEl) {
        try {
            showToast("Loading Admin Panel...");
            const res = await fetch('./admin-panel.html');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            const mount = document.getElementById('admin-panel-mount');
            if (mount) {
                mount.outerHTML = html;
            } else {
                document.body.insertAdjacentHTML('beforeend', html);
            }
            await new Promise(r => requestAnimationFrame(r));
            populateCatSelect();
            populateAdminCatFilter();
            if (typeof window.populateHomeAdminUI === 'function') window.populateHomeAdminUI();
            adminPanelEl = document.getElementById('admin-panel');
        } catch (e) {
            console.error('[Admin] Failed to load admin-panel.html:', e);
            showToast('Admin panel failed to load. Please refresh.');
            return;
        }
    }
    if (!adminPanelEl) return;
    adminPanelEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // URL Persistence
    const url = new URL(window.location);
    url.searchParams.set('admin', 'true');
    if (state.adminTab) url.searchParams.set('atab', state.adminTab);
    window.history.replaceState({}, '', url);

    // Preset Popup Settings
    if (DATA.popupSettings) {
        if (document.getElementById('popup-title')) document.getElementById('popup-title').value = DATA.popupSettings.title || "";
        if (document.getElementById('popup-msg')) document.getElementById('popup-msg').value = DATA.popupSettings.msg || "";
        if (document.getElementById('popup-img')) document.getElementById('popup-img').value = DATA.popupSettings.img || "img/";

        // Success Message Fields
        if (document.getElementById('popup-success-title'))
            document.getElementById('popup-success-title').value = DATA.popupSettings.successTitle || "";
        if (document.getElementById('popup-success-msg'))
            document.getElementById('popup-success-msg').value = DATA.popupSettings.successMsg || "";
    }

    if (typeof window.populateLandingProductSelects === 'function') window.populateLandingProductSelects();
    if (typeof window.populateLandingSettingsUI === 'function') window.populateLandingSettingsUI();

    window.switchAdminTab(state.adminTab || 'products');
};
window.hideAdminPanel = () => {
    document.getElementById('admin-panel').classList.add('hidden');
    document.body.style.overflow = 'auto';

    // URL Persistence: Clear admin params
    const url = new URL(window.location);
    url.searchParams.delete('admin');
    url.searchParams.delete('atab');
    window.history.replaceState({}, '', url);
};

window.toggleSidebarGroup = (groupId) => {
    const el = document.getElementById('sidebar-' + groupId);
    const icon = document.getElementById('icon-' + groupId);
    if (!el || !icon) return;

    if (el.style.maxHeight === '0px' || el.style.maxHeight === '') {
        el.style.maxHeight = '500px';
        el.style.opacity = '1';
        icon.classList.remove('rotate-180');
    } else {
        el.style.maxHeight = '0px';
        el.style.opacity = '0';
        icon.classList.add('rotate-180');
    }
};

window.expandSidebarGroupForTab = (tab) => {
    let groupId = 'core';
    if (['products', 'categories'].includes(tab)) groupId = 'core';
    if (['homepage', 'sliders', 'megamenu', 'announcements'].includes(tab)) groupId = 'design';
    if (['insights', 'landing', 'leads'].includes(tab)) groupId = 'marketing';
    if (['migration'].includes(tab)) groupId = 'tools';

    ['core', 'design', 'marketing', 'tools'].forEach(id => {
        const el = document.getElementById('sidebar-' + id);
        const icon = document.getElementById('icon-' + id);
        if (el && icon) {
            el.style.maxHeight = '0px';
            el.style.opacity = '0';
            icon.classList.add('rotate-180');
        }
    });

    const activeEl = document.getElementById('sidebar-' + groupId);
    const activeIcon = document.getElementById('icon-' + groupId);
    if (activeEl && activeIcon) {
        activeEl.style.maxHeight = '500px';
        activeEl.style.opacity = '1';
        activeIcon.classList.remove('rotate-180');
    }
};
window.switchAdminTab = (tab) => {
    state.adminTab = tab;
    if (window.expandSidebarGroupForTab) window.expandSidebarGroupForTab(tab);

    // URL Persistence: Update active tab
    const url = new URL(window.location);
    if (document.getElementById('admin-panel').classList.contains('hidden') === false) {
        url.searchParams.set('atab', tab);
        window.history.replaceState({}, '', url);
    }
    const isProd = tab === 'products';
    const isCat = tab === 'categories';
    const isMega = tab === 'megamenu';
    const isSlider = tab === 'sliders';
    const isInsight = tab === 'insights';
    const isAnnounce = tab === 'announcements';
    const isLeads = tab === 'leads';
    const isLanding = tab === 'landing';
    const isHomepage = tab === 'homepage';
    const isMigration = tab === 'migration';

    document.getElementById('admin-product-section').classList.toggle('hidden', !isProd);
    document.getElementById('admin-migration-section')?.classList.toggle('hidden', !isMigration);
    document.getElementById('admin-category-section').classList.toggle('hidden', !isCat);
    document.getElementById('admin-megamenu-section')?.classList.toggle('hidden', !isMega);
    document.getElementById('admin-slider-section').classList.toggle('hidden', !isSlider);
    document.getElementById('admin-landing-section').classList.toggle('hidden', !isLanding);
    document.getElementById('admin-homepage-section')?.classList.toggle('hidden', !isHomepage);
    document.getElementById('admin-insights-section').classList.toggle('hidden', !isInsight);
    document.getElementById('admin-announcements-section').classList.toggle('hidden', !isAnnounce);
    document.getElementById('admin-leads-section').classList.toggle('hidden', !isLeads);

    // Populate homepage admin UI when switching to it
    if (isHomepage) populateHomeAdminUI();

    // Center Insights View Full Width
    const formContainer = document.getElementById('admin-form-container');
    formContainer.classList.toggle('hidden', isInsight);
    const rightCol = document.getElementById('admin-right-column');
    if (isInsight) {
        rightCol.className = "transition-all duration-500";
        rightCol.style.gridColumn = "1 / -1";
        rightCol.style.maxWidth = "1000px";
        rightCol.style.margin = "0 auto";
        rightCol.style.width = "100%";
    } else {
        rightCol.className = "lg:col-span-7 transition-all duration-500";
        rightCol.style.gridColumn = "";
        rightCol.style.maxWidth = "";
        rightCol.style.margin = "";
        rightCol.style.width = "";
    }

    // Migration opens as a standalone tools view
    rightCol.classList.toggle('hidden', isMigration);
    formContainer.style.gridColumn = isMigration ? "1 / -1" : "";
    formContainer.style.maxWidth = isMigration ? "1000px" : "";
    formContainer.style.margin = isMigration ? "0 auto" : "";

    document.getElementById('admin-product-list-container').classList.toggle('hidden', !isProd);
    document.getElementById('admin-category-list').classList.toggle('hidden', !isCat);
    document.getElementById('admin-megamenu-list')?.classList.toggle('hidden', !isMega);
    document.getElementById('admin-slider-list').classList.toggle('hidden', !isSlider);
    document.getElementById('admin-announcements-list').classList.toggle('hidden', !isAnnounce);
    document.getElementById('admin-insights-list').classList.toggle('hidden', !isInsight);
    document.getElementById('admin-leads-list').classList.toggle('hidden', !isLeads);

    document.getElementById('product-admin-filters').classList.toggle('hidden', !isProd);

    const activeClass = "w-full flex items-center justify-start gap-4 px-6 py-4 rounded-xl text-[14px] font-medium transition-all bg-black text-white shadow-lg";
    const inactiveClass = "w-full flex items-center justify-start gap-4 px-6 py-4 rounded-xl text-[14px] font-medium text-gray-500 hover:bg-gray-50 hover:text-black transition-all";

    document.getElementById('tab-p').className = isProd ? activeClass : inactiveClass;
    document.getElementById('tab-c').className = isCat ? activeClass : inactiveClass;
    const tabM = document.getElementById('tab-m');
    if (tabM) tabM.className = isMega ? activeClass : inactiveClass;
    document.getElementById('tab-s').className = isSlider ? activeClass : inactiveClass;
    document.getElementById('tab-a').className = isAnnounce ? activeClass : inactiveClass;
    document.getElementById('tab-i').className = isInsight ? activeClass : inactiveClass;
    document.getElementById('tab-landing').className = isLanding ? activeClass : inactiveClass;
    document.getElementById('tab-l').className = isLeads ? activeClass : inactiveClass;
    const tabHp = document.getElementById('tab-hp');
    if (tabHp) tabHp.className = isHomepage ? activeClass : inactiveClass;
    const tabMig = document.getElementById('tab-mig');
    if (tabMig) tabMig.className = isMigration ? activeClass : inactiveClass;

    document.getElementById('list-title').innerText = isProd ? "" : (isCat ? "Existing Categories" : (isMega ? "Desktop Menus" : (isSlider ? "Management Sliders" : (isAnnounce ? "Manage Notices" : (isLeads ? "Gift Claim Leads" : (isLanding ? "Landing Page Settings" : (isHomepage ? "Home Page Settings" : (isMigration ? "Migration & Cloud Tools" : ""))))))));
    renderAdminUI();
};

/* CATEGORY PICKER LOGIC */

function populateCatSelect() {
    const selects = [document.getElementById('p-cat-id'), document.getElementById('landing-sec1-cat'), document.getElementById('landing-sec2-cat'), document.getElementById('spotlight-cat-id')];

    const optionsHtml = `<option value="">Select Category</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    selects.forEach(select => {
        if (select) select.innerHTML = optionsHtml;
    });
}

function populateAdminCatFilter() {
    const select = document.getElementById('admin-cat-filter');
    if (select) select.innerHTML = `<option value="all">All Categories</option>` + DATA.c.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

window.resetForm = () => {
    // Basic fields
    const fields = ['edit-id', 'p-name', 'p-price', 'p-desc', 'p-details', 'p-keywords', 'c-name', 'p-badge', 'edit-slider-id', 's-img', 's-mobileImg', 's-title', 's-link', 's-order', 'm-name']; // Added 'p-badge' and 'm-name'
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = "";
    });

    // Reset checkboxes
    const checkboxes = ['p-stock', 'p-pinned', 'c-pinned'];
    checkboxes.forEach(c => {
        const el = document.getElementById(c);
        if (el) el.checked = (c === 'p-stock'); // Default stock to true, others false
    });

    // Reset titles
    const pTitle = document.getElementById('p-form-title');
    if (pTitle) pTitle.innerText = "Product Details";
    const cTitle = document.getElementById('c-form-title');
    if (cTitle) cTitle.innerText = "New Category";
    const sTitle = document.getElementById('s-form-title');
    if (sTitle) sTitle.innerText = "New Slider Image";
    const sImgField = document.getElementById('s-img');
    if (sImgField) sImgField.value = "img/";
    const sMobileImgField = document.getElementById('s-mobileImg');
    if (sMobileImgField) sMobileImgField.value = "img/";

    // Clear dynamic grids
    const grids = ['variation-rows', 'color-variation-rows', 'p-image-grid'];
    grids.forEach(g => {
        const el = document.getElementById(g);
        if (el) el.innerHTML = '';
    });

    // Reset selects
    const catSelect = document.getElementById('p-cat-id');
    if (catSelect) catSelect.value = "";
    const filter = document.getElementById('admin-cat-filter');
    if (filter) filter.value = "all";

    // Reset Mega Menu category checkboxes + custom tick visuals
    const editMegaId = document.getElementById('edit-megamenu-id');
    if (editMegaId) editMegaId.value = "";
    megaMenuEditSelection = null;
    const mTitle = document.getElementById('m-form-title');
    if (mTitle) mTitle.innerText = "New Main Category";
    document.querySelectorAll('.mega-cat-checkbox').forEach(cb => {
        cb.checked = false;
        cb.dispatchEvent(new Event('change')); // reset custom tick visual
    });
};

// MULTI-IMAGE HELPERS
window.addImageToGrid = (containerId, url) => {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    const div = document.createElement('div');
    div.className = 'relative aspect-square border-2 border-gray-100 rounded-xl overflow-hidden group hover:border-black transition-all bg-white';
    div.innerHTML = `
                        <img src="${getOptimizedUrl(url, 300)}" class="w-full h-full object-cover">
                            <input type="hidden" class="grid-img-url" value="${url}">
                                <button type="button" onclick="this.parentElement.remove()" class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-all">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                                `;
    grid.appendChild(div);
};

window.handleMultiDrop = async (e, containerId) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;

    showToast(`Uploading ${files.length} images...`);
    for (const file of files) {
        try {
            const url = await directCloudinaryUpload(file);
            addImageToGrid(containerId, url);
        } catch (err) {
            showToast("One or more uploads failed.");
        }
    }
    showToast("Upload Complete!");
};

window.cloudinaryMultiUpload = (containerId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        showToast(`Uploading ${files.length} images...`);
        for (const file of files) {
            try {
                const url = await directCloudinaryUpload(file);
                addImageToGrid(containerId, url);
            } catch (err) {
                showToast("One or more uploads failed.");
            }
        }
        showToast("Upload Complete!");
    };
    input.click();
};

function collectImagesFromGrid(containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('.grid-img-url')).map(input => input.value);
}

// Ensure handleDragOver/Leave are accessible
window.handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-black', 'bg-gray-50');
};
window.handleDragLeave = (e) => {
    e.currentTarget.classList.remove('border-black', 'bg-gray-50');
};

window.handleDrop = async (e, fieldId) => {
    e.preventDefault();
    const zone = e.currentTarget;
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return showToast("Please drop an image file.");

    zone.classList.add('uploading');
    try {
        const url = await directCloudinaryUpload(file);
        document.getElementById(fieldId).value = url;
        showToast("Image Uploaded!");
    } catch (err) {
        showToast("Upload Failed.");
    } finally {
        zone.classList.remove('uploading');
    }
};

window.handleVariationDrop = async (e, zone) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return showToast("Please drop an image file.");

    zone.classList.add('uploading');
    try {
        const url = await directCloudinaryUpload(file);
        const input = zone.querySelector('.v-img, .vc-img');
        if (input) input.value = url;
        showToast("Image Uploaded!");
    } catch (err) {
        showToast("Upload Failed.");
    } finally {
        zone.classList.remove('uploading');
    }
};

async function directCloudinaryUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'speed_preset');
    formData.append('cloud_name', 'dxkcvm2yh');

    const res = await fetch(`https://api.cloudinary.com/v1_1/dxkcvm2yh/image/upload`, {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    throw new Error("Upload failed");
}

let cloudinaryWidget = null;
let cloudinaryTarget = null; // Can be ID string or input element

window.cloudinaryUpload = (target) => {
    cloudinaryTarget = target;

    // If script is still loading, show a brief message and retry
    if (!window.cloudinary) {
        showToast('Upload widget loading... please try again in a moment.');
        return;
    }

    if (cloudinaryWidget) {
        cloudinaryWidget.open();
        return;
    }
    cloudinaryWidget = cloudinary.createUploadWidget({
        cloudName: 'dxkcvm2yh',
        apiKey: '749457642941763',
        uploadPreset: 'speed_preset',
        sources: ['local', 'url', 'camera'],
        multiple: false,
        styles: {
            palette: { window: '#FFFFFF', windowBorder: '#90A0B3', tabIcon: '#000000', menuIcons: '#5A616A', textDark: '#000000', textLight: '#FFFFFF', link: '#000000', action: '#111111', inactiveTabIcon: '#0E2F5A', error: '#F44235', inProgress: '#0078FF', complete: '#20B832', sourceBg: '#E4EBF1' }
        }
    }, (error, result) => {
        if (!error && result && result.event === "success") {
            if (typeof cloudinaryTarget === 'string') {
                const el = document.getElementById(cloudinaryTarget);
                if (el) el.value = result.info.secure_url;
            } else if (cloudinaryTarget instanceof HTMLElement) {
                cloudinaryTarget.value = result.info.secure_url;
            }
            showToast("Image Uploaded!");
        }
    });
    cloudinaryWidget.open();
};

window.cloudinaryUploadForVariation = (btn) => {
    window.cloudinaryUpload(btn.parentElement.querySelector('.v-img, .vc-img'));
};

window.selectSize = (price, size, imgs, el) => {
    // Update price
    const priceDisplay = document.querySelector('.detail-price-text');
    if (priceDisplay) priceDisplay.innerText = `${price} AED`;

    // Handle images
    const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
    if (images.length > 0) {
        const mainImg = document.getElementById('main-detail-img');
        if (mainImg) {
            mainImg.src = getOptimizedUrl(images[0], 1200);
            mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
        }

        // Update thumbnail grid
        const thumbGrid = document.getElementById('detail-thumb-grid');
        if (thumbGrid) {
            thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
        }
    }

    // Highlight selected size badge
    document.querySelectorAll('.size-badge').forEach(b => {
        b.classList.remove('bg-black', 'text-white', 'border-black');
        b.classList.add('bg-white', 'text-black', 'border-gray-200');
    });
    el.classList.remove('bg-white', 'text-black', 'border-gray-200');
    el.classList.add('bg-black', 'text-white', 'border-black');

    // Update state for wishlist
    state.currentVar = { size, price, img: images[0] };

    // Update WhatsApp inquiry button state
    updateInquiryButton(size, price, null);

    // Auto-scroll on mobile
    if (window.innerWidth < 768) {
        const container = document.querySelector('.detail-view-container');
        if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
    }
};

window.selectColor = (price, color, imgs, el) => {
    // Update price
    const priceDisplay = document.querySelector('.detail-price-text');
    if (priceDisplay) priceDisplay.innerText = `${price} AED`;

    // Handle images
    const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
    if (images.length > 0) {
        const mainImg = document.getElementById('main-detail-img');
        if (mainImg) {
            mainImg.src = getOptimizedUrl(images[0], 1200);
            mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
        }

        // Update thumbnail grid
        const thumbGrid = document.getElementById('detail-thumb-grid');
        if (thumbGrid) {
            thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
        }
    }

    // Highlight selected color swatch
    document.querySelectorAll('.color-swatch').forEach(b => {
        b.classList.remove('border-black', 'scale-110');
        b.classList.add('border-white');
    });

    const swatch = el.querySelector('.color-swatch');
    if (swatch) {
        swatch.classList.remove('border-white');
        swatch.classList.add('border-black', 'scale-110');
    }

    // Update state for wishlist
    state.currentVar = { color, price, img: images[0] };

    // Update WhatsApp inquiry button state
    updateInquiryButton(null, price, color);

    // Auto-scroll on mobile
    if (window.innerWidth < 768) {
        const container = document.querySelector('.detail-view-container');
        if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
    }
};

function updateInquiryButton(selectedSize, selectedPrice, selectedColor) {
    const inquiryBtn = document.getElementById('main-inquiry-btn');
    if (!inquiryBtn) return;

    // Extract existing values if not provided
    const match = inquiryBtn.getAttribute('onclick').match(/inquireOnWhatsApp\('([^']+)'(?:, '([^']*)')?(?:, '([^']*)')?(?:, '([^']*)')?\)/);
    if (!match) return;

    const id = match[1];
    const currentSize = selectedSize !== null ? selectedSize : (match[2] !== 'null' ? match[2] : null);
    const currentPrice = selectedPrice !== null ? selectedPrice : (match[3] !== 'null' ? match[3] : null);
    const currentColor = selectedColor !== null ? selectedColor : (match[4] !== 'null' ? match[4] : null);

    let args = `'${id}'`;
    if (currentSize) args += `, '${currentSize}'`; else args += `, null`;
    if (currentPrice) args += `, '${currentPrice}'`; else args += `, null`;
    if (currentColor) args += `, '${currentColor}'`;

    inquiryBtn.setAttribute('onclick', `inquireOnWhatsApp(${args})`);
}

function showToast(msg) {
    const t = document.getElementById('toast'); if (!t) return;
    t.innerText = msg; t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
}

window.shareProduct = async (id, name) => {
    const url = `${window.location.origin}${window.location.pathname}?p=${id}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: name, url: url });
        } catch (err) { console.log('Share Cancelled'); }
    } else {
        try {
            await navigator.clipboard.writeText(url);
            showToast("Link Copied to Clipboard");
        } catch (err) { showToast("Copy Failed"); }
    }
};

window.handleFavoritesClick = () => {
    window.openFavoritesSidebar();
};

window.openFavoritesSidebar = () => {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (sidebar && overlay) {
        renderFavoritesSidebar();
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeFavoritesSidebar = () => {
    const sidebar = document.getElementById('favorites-sidebar');
    const overlay = document.getElementById('favorites-sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

window.openCategoriesSidebar = window.openCategoriesSidebar || (() => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (sidebar && overlay) {
        renderCategoriesSidebar();
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
});

window.closeCategoriesSidebar = window.closeCategoriesSidebar || (() => {
    const sidebar = document.getElementById('categories-sidebar');
    const overlay = document.getElementById('categories-sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
});

window.renderCategoriesSidebar = window.renderCategoriesSidebar || (() => {
    const container = document.getElementById('sidebar-categories-list');
    if (!container) return;

    if (DATA.c.length === 0) {
        container.innerHTML = `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Categories</p>`;
        return;
    }

    container.innerHTML = DATA.c.map(c => {
        const productCount = DATA.p.filter(p => p.catId === c.id).length;
        return `
            <div class="sidebar-cat-item group" onclick="window.closeCategoriesSidebar(); applyFilter('${c.id}')">
                <div class="sidebar-cat-img-box">
                    <img src="${getOptimizedUrl(c.img, 100) || 'https://placehold.co/100x100?text=Icon'}" alt="${c.name}" ${getOptimizedUrl(c.img, 100) ? "onerror=\"this.src='https://placehold.co/100x100?text=Icon'\"" : ''}>
                </div>
                <h4 class="sidebar-cat-name">${c.name}</h4>
                <span class="sidebar-cat-count">${productCount}</span>
            </div>
        `;
    }).join('');
});

// End of sidebar functions (cleaned duplicates)


window.renderFavoritesSidebar = () => {
    const container = document.getElementById('sidebar-items');
    if (!container) return;

    if (state.wishlist.length === 0) {
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

    const items = state.wishlist.map(entry => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const p = DATA.p.find(x => x.id === id);
        if (!p) return null;

        let displayP = { ...p };
        let preSelect = null;
        if (entry.var) {
            displayP = { ...displayP, ...entry.var };
            preSelect = entry.var;
        }
        return { ...displayP, originalId: id, preSelect };
    }).filter(x => x);

    container.innerHTML = items.map(p => `
                                <div class="sidebar-item group" onclick="window.closeFavoritesSidebar(); viewDetail('${p.originalId}', false, ${p.preSelect ? JSON.stringify(p.preSelect) : 'null'})">
                                    <div class="sidebar-img-box">
                                        <img src="${getOptimizedUrl(p.img, 300)}" alt="${p.name}">
                                    </div>
                                    <div class="sidebar-info">
                                        <h4 class="sidebar-item-name">${p.name}</h4>
                                        <p class="sidebar-item-price">${p.price} AED</p>
                                    </div>
                                    <button onclick="event.stopPropagation(); window.toggleWishlist(null, '${p.originalId}')"
                                        class="sidebar-remove-btn shadow-sm">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                                `).join('');
};

window.preloadProductImage = (id, priority = 'low') => {
    const p = DATA.p.find(x => x.id === id);
    if (!p || p._preloaded) return;
    const imgUrl = getOptimizedUrl(p.images?.[0] || p.img, window.innerWidth < 768 ? 600 : 1200);
    const img = new Image();
    if (priority === 'high') img.fetchPriority = 'high';
    img.src = imgUrl;
    p._preloaded = true;
};

// Aggressively preload first 8 products for "instant" feel
// Aggressively preload sliders and first 8 products for "instant" feel
window.preloadInitialBatch = () => {
    // 1. Preload Sliders (High Priority)
    if (DATA.s && DATA.s.length) {
        DATA.s.forEach(s => {
            const isMobile = window.innerWidth < 768;
            const imgUrl = getOptimizedUrl(isMobile ? s.mobileImg : s.img, isMobile ? 1200 : 1920);
            const img = new Image();
            img.fetchPriority = 'high';
            img.src = imgUrl;
        });
    }
    // 2. Preload Product Detail Images (High Priority)
    if (DATA.p && DATA.p.length) {
        DATA.p.slice(0, 8).forEach(p => window.preloadProductImage(p.id, 'high'));
    }
};


function getOptimizedUrl(url, width) {
    if (!url || typeof url !== 'string') return '';
    if (!url.includes('cloudinary.com')) return url;

    const baseTransform = 'f_auto,q_auto';
    const widthTransform = width ? `,w_${width},c_limit` : '';
    const fullTransform = baseTransform + widthTransform;

    if (url.includes('/upload/f_auto,q_auto')) {
        if (width && !url.includes(',w_')) {
            return url.replace('/upload/f_auto,q_auto', `/upload/${fullTransform}`);
        }
        return url;
    }

    return url.replace('/upload/', `/upload/${fullTransform}/`);
}

// Fallback: If Cloudinary transform URL fails, retry with original URL
window.handleImgError = function (img) {
    if (img._retried) return; // Avoid infinite loop
    img._retried = true;
    const src = img.src || '';
    if (!src.includes('cloudinary.com')) return;
    // Strip all transforms and load the raw original URL
    const originalUrl = src.replace(/\/upload\/[^/]+\//, '/upload/');
    if (originalUrl !== src) {
        img.src = originalUrl;
    }
};


async function trackProductView(id) {
    if (!id || typeof id !== 'string') return;
    const today = getTodayStr();
    const sessionKey = `product_view_tracked_${today}_${id}`;

    // Strict Synchronous Guard to prevent double/triple counting
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, 'true');

    console.log(`[Traffic] Product interaction tracking triggered: ${id}. waiting for auth...`);
    await waitForAuth();

    try {
        const isAd = sessionStorage.getItem('traffic_source') === 'Google Ads';

        // 1. Update Global Stats (Product Journey Pillar)
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_stats', today);
        const globalField = isAd ? 'adProductClicks' : 'normalProductClicks';

        // 2. Update Per-Product Stats (Top Items)
        const dailyProdRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_product_stats', `${today}_${id}`);
        const prodField = isAd ? 'adViews' : 'views';

        // Perform both updates (Batch would be cleaner but setDoc merge is fine here)
        await Promise.all([
            setDoc(statsRef, { [globalField]: increment(1) }, { merge: true }),
            setDoc(dailyProdRef, { [prodField]: increment(1), productId: id, date: today }, { merge: true })
        ]);

        console.log(`[Traffic] ${isAd ? 'AD' : 'Normal'} Product view recorded for: ${id}`);
    } catch (e) {
        console.error("[Traffic] Consolidated tracking failed:", e);
    }
}

function getBadgeLabel(badge) {
    const labels = {
        'new': 'New Arrival',
        'best': 'Best Seller',
        'limited': 'Limited Stock',
        'sale': 'On Sale',
        'trending': 'Trending'
    };
    return labels[badge] || badge;
}

function getTodayStr() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

const _errorTrackedUrls = new Set();

// renderInsights, updateInsightsRange, resetAdTraffic, clearHealthErrors,
// resetAllAnalytics — all delegated to app-insights.js via lazy shims in app.js.
// Do NOT redefine them here.
function renderInsights(container, rangeData) { window.renderInsights(container, rangeData); }

window.focusSearch = () => {
    // Navigate home first if we're not there
    if (new URLSearchParams(window.location.search).has('p') || state.selectionId) {
        window.goBackToHome(true);
    }

    setTimeout(() => {
        const searchInput = document.getElementById('customer-search');
        if (!searchInput) return;

        // Ensure the container is visible (renderSlider can hide it based on state)
        const topElements = document.getElementById('home-top-elements');
        if (topElements) topElements.classList.remove('hidden');
        const searchContainer = document.getElementById('customer-search-container');
        if (searchContainer) searchContainer.classList.remove('hidden');

        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        searchInput.focus();
    }, 300);
};

// SLIDER LOGIC
let sliderInterval;
let currentSlide = 0;

function renderSlider() {
    const wrapper = document.getElementById('home-top-elements');
    const container = document.getElementById('home-slider-container');
    const slider = document.getElementById('home-slider');
    const dots = document.getElementById('slider-dots');

    // Safety: always hide slider when a product detail is open (?p= in URL)
    const isProductDetail = new URLSearchParams(window.location.search).has('p');
    if (!slider || !DATA.s.length || isProductDetail || state.filter !== 'all' || state.selectionId) {
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }

    // When search is active, only hide the slider container — keep the mobile search bar visible
    if (state.search) {
        if (container) container.classList.add('hidden');
        // Keep the wrapper visible so the mobile search bar (md:hidden) stays accessible
        if (wrapper) wrapper.classList.remove('hidden');
        return;
    }

    if (container) container.classList.remove('hidden');
    if (wrapper) wrapper.classList.remove('hidden');

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const sortedSliders = [...DATA.s].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    // RELAXED FILTERING: Block only the default placeholder
    const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';

    const visibleSliders = sortedSliders.filter(s => {
        const hasMobile = isUrl(s.mobileImg);
        const hasDesktop = isUrl(s.img);
        return isMobile ? hasMobile : hasDesktop;
    });

    if (!visibleSliders.length) {
        if (container) container.classList.add('hidden');
        return;
    }

    slider.innerHTML = visibleSliders.map((s, i) => {
        const displayImg = isMobile ? s.mobileImg : s.img;

        // Exact original mobile overlay vs New premium desktop overlay
        const overlayHTML = s.title ? (isMobile
            ? `<div class="absolute bottom-12 left-8 text-white z-20">
                 <h2 class="text-2xl font-black uppercase tracking-tighter">${s.title}</h2>
               </div>`
            : `<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex items-end pb-14 pl-16 z-20 pointer-events-none">
                 <h2 class="text-5xl lg:text-5xl font-black text-white uppercase tracking-[-0.03em] drop-shadow-md max-w-2xl leading-[1]">${s.title}</h2>
               </div>`
        ) : '';

        return `
            <div class="slider-slide relative" data-index="${i}">
                <img src="${getOptimizedUrl(displayImg, isMobile ? 1200 : 1920)}" 
                     class="${i === 0 ? 'no-animation' : ''} w-full h-full object-cover"
                     alt="${s.title || ''}" 
                     ${i === 0 ? 'fetchpriority="high" loading="eager"' : 'fetchpriority="auto" loading="eager"'}
                     onclick="${s.link ? `window.open('${s.link}', '_blank')` : ''}" 
                     style="${s.link ? 'cursor:pointer' : ''}"
                     draggable="false">
                ${overlayHTML}
            </div>
        `;
    }).join('');

    if (dots) {
        dots.innerHTML = visibleSliders.map((_, i) => `
            <div class="slider-dot ${i === 0 ? 'active' : ''}" onclick="window.goToSlide(${i})"></div>
        `).join('');
    }

    currentSlide = 0;
    startSliderAutoPlay();

    // Sync dots on manual scroll/swipe
    slider.onscroll = () => {
        const index = Math.round(slider.scrollLeft / slider.offsetWidth);
        if (index !== currentSlide && !isNaN(index)) {
            currentSlide = index;
            const allDots = dots.querySelectorAll('.slider-dot');
            allDots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlide);
            });
            // Reset autoplay timer when user interacts manually
            startSliderAutoPlay();
        }
    };

    // Desktop Mouse Drag Support
    initSliderDrag(slider);
}

// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP SLIDER DRAG — click-and-drag for better desktop UX
// ─────────────────────────────────────────────────────────────────────────────
function initSliderDrag(slider) {
    if (!slider || slider._dragInitialized) return;
    slider._dragInitialized = true;

    let isDown = false;
    let startX = 0;
    let moveDistance = 0;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.clientX;
        moveDistance = 0;
        slider.style.cursor = 'grab';
    });

    slider.addEventListener('mouseup', (e) => {
        if (!isDown) return;
        isDown = false;

        const endX = e.clientX;
        const diff = endX - startX;
        moveDistance = Math.abs(diff);

        // TRIGGER ON RELEASE ONLY (Flick)
        if (moveDistance > 40) { // More sensitive for easier swiping
            if (diff > 0) {
                window.moveSlider(-1);
            } else {
                window.moveSlider(1);
            }
        }
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
    });

    slider.addEventListener('mousemove', (e) => {
        if (isDown) {
            e.preventDefault();
        }
    });

    slider.addEventListener('click', (e) => {
        if (moveDistance > 15) { // Threshold to distinguish click from swipe
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

window.moveSlider = (dir) => {
    const slider = document.getElementById('home-slider');
    if (!slider) return;
    const slides = slider.querySelectorAll('.slider-slide');
    currentSlide = (currentSlide + dir + slides.length) % slides.length;
    updateSliderUI();
};

window.goToSlide = (index) => {
    currentSlide = index;
    updateSliderUI();
};

function updateSliderUI() {
    const slider = document.getElementById('home-slider');
    const dots = document.querySelectorAll('.slider-dot');
    if (!slider) return;

    slider.scrollTo({
        left: slider.offsetWidth * currentSlide,
        behavior: 'smooth'
    });

    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });

    startSliderAutoPlay(); // Reset timer
}

function startSliderAutoPlay() {
    clearInterval(sliderInterval);
    sliderInterval = setInterval(() => {
        window.moveSlider(1);
    }, 5000);
}

// ADMIN SLIDER FUNCTIONS
window.saveSlider = async () => {
    const id = document.getElementById('edit-slider-id').value;
    const sliderData = {
        img: document.getElementById('s-img').value.trim(),
        mobileImg: document.getElementById('s-mobileImg').value.trim(),
        title: document.getElementById('s-title').value.trim(),
        link: document.getElementById('s-link').value.trim(),
        order: Number(document.getElementById('s-order').value) || 0,
        updatedAt: Date.now()
    };

    const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';
    const hasImg = isUrl(sliderData.img);
    const hasMobileImg = isUrl(sliderData.mobileImg);

    if (!hasImg && !hasMobileImg) return showToast("Image is required");

    try {
        if (id) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sliders', id), sliderData);
            showToast("Slider Updated");
        } else {
            await addDoc(sliderCol, sliderData);
            showToast("Slider Added");
        }
        resetForm();
        DATA.s = []; // Clear local to force refresh
        refreshData();
    } catch (e) {
        console.error("Slider Save Error:", e);
        showToast("Error saving slider");
    }
};

window.cloudinaryBulkSliderUpload = (type) => {
    cloudinary.openUploadWidget({
        cloudName: 'dxkcvm2yh',
        uploadPreset: 'speed_preset',
        multiple: true,
        maxFiles: 20,
        sources: ['local', 'url', 'camera']
    }, async (error, result) => {
        if (!error && result && result.event === "success") {
            const url = result.info.secure_url;
            showToast(`Saving ${type} image...`);

            const sliderData = {
                title: "",
                link: "",
                order: DATA.s.length + 1,
                updatedAt: Date.now()
            };

            if (type === 'desktop') {
                sliderData.img = url;
                sliderData.mobileImg = "img/";
            } else {
                sliderData.img = "img/";
                sliderData.mobileImg = url;
            }

            try {
                await addDoc(sliderCol, sliderData);
                DATA.s = []; // Trigger full refresh
                refreshData();
                showToast(`New ${type} slider added!`);
            } catch (err) {
                console.error("Bulk Upload Save Error:", err);
                showToast("Save failed");
            }
        }
    });
};

window.handleSliderBulkDrop = async (e, type) => {
    e.preventDefault();
    const zone = e.currentTarget;
    zone.classList.remove('border-black', 'bg-gray-50');

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return showToast("No images found.");

    showToast(`Uploading ${files.length} ${type} images...`);

    for (const file of files) {
        try {
            const url = await directCloudinaryUpload(file);
            const sliderData = {
                title: "",
                link: "",
                order: DATA.s.length + 1,
                updatedAt: Date.now(),
                img: type === 'desktop' ? url : "img/",
                mobileImg: type === 'mobile' ? url : "img/"
            };
            await addDoc(sliderCol, sliderData);
        } catch (err) {
            console.error("Bulk Drop Error:", err);
            showToast("One or more uploads failed");
        }
    }

    DATA.s = [];
    refreshData();
    showToast("Bulk Upload Complete!");
};

window.editSlider = (id) => {
    const s = DATA.s.find(x => x.id === id);
    if (!s) return;
    document.getElementById('edit-slider-id').value = s.id;
    document.getElementById('s-img').value = s.img;
    document.getElementById('s-mobileImg').value = s.mobileImg || "img/";
    document.getElementById('s-title').value = s.title || "";
    document.getElementById('s-link').value = s.link || "";
    document.getElementById('s-order').value = s.order || 0;
    document.getElementById('slider-form-title').innerText = "Edit Slider Image";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteSlider = async (id) => {
    if (!confirm("Are you sure?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sliders', id));
        showToast("Slider Deleted");
        refreshData();
    } catch (e) {
        showToast("Error deleting slider");
    }
};

function renderAdminSliders(container) {
    const sorted = [...DATA.s].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    container.innerHTML = sorted.map(s => {
        const hasMobile = s.mobileImg && s.mobileImg !== 'img/';
        const hasDesktop = s.img && s.img !== 'img/';

        return `
            <div class="admin-slider-card">
                <div class="flex gap-4 w-full">
                    <div class="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border">
                        <img src="${getOptimizedUrl(s.img, 200)}" class="w-full h-full object-cover ${!hasDesktop ? 'opacity-20 grayscale' : ''}">
                        <div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[7px] text-center font-bold uppercase py-1">Desktop</div>
                    </div>
                    <div class="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border">
                        <img src="${getOptimizedUrl(s.mobileImg, 200)}" class="w-full h-full object-cover ${!hasMobile ? 'opacity-20 grayscale' : ''}" onerror="this.src='https://placehold.co/200x200?text=No+Mobile'">
                        <div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[7px] text-center font-bold uppercase py-1">Mobile</div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-[13px] truncate">${s.title || 'Untitled Slide'}</p>
                        <p class="text-[9px] text-gray-400 font-black uppercase mt-1">Order: ${s.order}</p>
                        <div class="flex gap-2 mt-2">
                             ${hasDesktop ? '<span class="px-2 py-0.5 bg-blue-50 text-blue-400 text-[7px] font-black rounded-full uppercase">Desktop On</span>' : '<span class="px-2 py-0.5 bg-gray-50 text-gray-300 text-[7px] font-black rounded-full uppercase">Desktop Off</span>'}
                             ${hasMobile ? '<span class="px-2 py-0.5 bg-green-50 text-green-400 text-[7px] font-black rounded-full uppercase">Mobile On</span>' : '<span class="px-2 py-0.5 bg-gray-50 text-gray-300 text-[7px] font-black rounded-full uppercase">Mobile Off</span>'}
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button onclick="editSlider('${s.id}')" class="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-full text-gray-400 hover:text-black transition-all">
                            <i class="fa-solid fa-pen text-[10px]"></i>
                        </button>
                        <button onclick="deleteSlider('${s.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 rounded-full text-red-200 hover:text-red-500 transition-all">
                            <i class="fa-solid fa-trash text-[10px]"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('') || `<p class="text-center py-20 text-[11px] text-gray-300 italic">No Sliders</p>`;
}

// ANNOUNCEMENT BAR LOGIC
let announcementInterval;
let currentAnnouncement = 0;

function renderAnnouncementBar() {
    const bar = document.getElementById('announcement-bar');
    const nav = document.querySelector('nav');
    if (!bar) return;

    let msgs = DATA.announcements || [];
    if (msgs.length === 0 || (msgs.length === 1 && msgs[0].trim() === "")) {
        bar.style.display = 'none';
        if (nav) nav.style.marginTop = '10px';
        return;
    }
    bar.style.display = 'flex';
    if (nav) nav.style.marginTop = '0px';

    bar.innerHTML = msgs.map((msg, idx) => `
        <div class="announcement-item ${idx === 0 ? 'active' : ''}">
            <span class="announcement-text">${msg}</span>
        </div>
    `).join('');

    initAnnouncementRotation();
}

function initAnnouncementRotation() {
    clearInterval(announcementInterval);
    const items = document.querySelectorAll('.announcement-item');
    if (items.length <= 1) return;

    announcementInterval = setInterval(() => {
        items[currentAnnouncement].classList.remove('active');
        currentAnnouncement = (currentAnnouncement + 1) % items.length;
        items[currentAnnouncement].classList.add('active');
    }, 3000);
}

// ADMIN ANNOUNCEMENTS
window.addAnnouncementRow = (text = "") => {
    const container = document.getElementById('announcement-rows');
    if (!container) return;
    const div = document.createElement('div');
    div.className = "flex gap-3 animate-fade-in";
    div.innerHTML = `
        <input type="text" class="admin-input flex-1 a-msg" placeholder="Notice text..." value="${text}">
        <button onclick="this.parentElement.remove()" class="w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    container.appendChild(div);
};

window.saveAnnouncements = async () => {
    const btn = document.getElementById('a-save-btn');
    const msgs = Array.from(document.querySelectorAll('.a-msg')).map(i => i.value.trim()).filter(v => v);

    if (btn) { btn.disabled = true; btn.innerText = "Syncing..."; }
    try {
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_announcements_');
        await setDoc(statsRef, { messages: msgs, updatedAt: Date.now() });
        showToast("Announcements Saved!");
        refreshData();
    } catch (e) {
        console.error("Save Error:", e);
        showToast("Error saving data");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Save Announcements"; }
    }
};

window.savePopupSettings = async () => {
    const title = document.getElementById('popup-title')?.value || "";
    const msg = document.getElementById('popup-msg')?.value || "";
    const img = document.getElementById('popup-img')?.value || "img/";
    const successTitle = document.getElementById('popup-success-title')?.value || "";
    const successMsg = document.getElementById('popup-success-msg')?.value || "";
    const btn = document.getElementById('popup-save-btn');
    if (!title) return showToast("Title is required");
    if (btn) { btn.innerText = "Saving..."; btn.disabled = true; }
    try {
        const snap = await getDocs(popupSettingsCol);
        const data = { title, msg, img, successTitle, successMsg };
        if (snap.empty) await addDoc(popupSettingsCol, data);
        else await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'popupSettings', snap.docs[0].id), data);
        DATA.popupSettings = data;
        showToast("Popup Settings Updated");
    } catch (err) {
        console.error(err);
        showToast("Save Error");
    } finally {
        if (btn) { btn.innerText = "Update Popup"; btn.disabled = false; }
    }
};

window.landingSec1Selected = window.landingSec1Selected || [];
window.landingSec2Selected = window.landingSec2Selected || [];
window.spotlightSelectedProducts = window.spotlightSelectedProducts || [];

window.renderLandingPills = (sec) => {
    const list = sec === 'sec1' ? window.landingSec1Selected : window.landingSec2Selected;
    const container = document.getElementById(`landing-${sec}-pills`);
    if (!container) return;
    if (!list.length) {
        container.innerHTML = `<span class="text-[9px] text-gray-400 italic font-bold">No products selected...</span>`;
        return;
    }
    container.innerHTML = list.map(id => {
        const p = DATA.p.find(x => x.id === id);
        if (!p) return '';
        return `<div class="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
            <img src="${getOptimizedUrl(p.img, 50)}" class="w-4 h-4 rounded-full object-cover">
            <span class="text-[9px] font-bold uppercase truncate max-w-[120px]">${p.name}</span>
            <button type="button" onclick="removeLandingProduct('${sec}', '${id}')" class="text-gray-400 hover:text-red-500 ml-1"><i class="fa-solid fa-xmark text-[10px]"></i></button>
        </div>`;
    }).join('');
};

window.searchLandingProducts = (sec, query) => {
    const dropdown = document.getElementById(`landing-${sec}-dropdown`);
    if (!dropdown) return;
    const selectedList = sec === 'sec1' ? window.landingSec1Selected : window.landingSec2Selected;
    let matches = DATA.p.filter(p => p && !p.id.startsWith('_') && !p.id.startsWith('-'));
    if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        matches = matches.filter(p => (p.name || '').toLowerCase().includes(q));
    }
    const activeCat = dropdown.dataset.activeCat || 'all';
    if (activeCat !== 'all') matches = matches.filter(p => p.catId === activeCat);
    if (!matches.length) {
        dropdown.innerHTML = `<div class="p-4 text-[10px] text-gray-400 font-bold uppercase italic text-center">No products found</div>`;
        dropdown.classList.remove('hidden');
        return;
    }
    dropdown.innerHTML = matches.slice(0, 40).map(p => {
        const selected = selectedList.includes(p.id);
        return `<div onclick="${selected ? `removeLandingProduct('${sec}','${p.id}')` : `addLandingProduct('${sec}','${p.id}')`}" class="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50 ${selected ? 'bg-gray-100' : ''}">
            <img src="${getOptimizedUrl(p.img, 80)}" class="w-8 h-8 rounded-lg object-cover">
            <span class="text-[9px] font-bold uppercase truncate flex-1">${p.name}</span>
            ${selected ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
        </div>`;
    }).join('');
    dropdown.classList.remove('hidden');
};

window.addLandingProduct = (sec, id) => {
    const list = sec === 'sec1' ? window.landingSec1Selected : window.landingSec2Selected;
    if (!list.includes(id)) list.push(id);
    window.renderLandingPills(sec);
};
window.removeLandingProduct = (sec, id) => {
    if (sec === 'sec1') window.landingSec1Selected = window.landingSec1Selected.filter(x => x !== id);
    else window.landingSec2Selected = window.landingSec2Selected.filter(x => x !== id);
    window.renderLandingPills(sec);
};
window.landingSetCat = (sec, cat) => {
    const dropdown = document.getElementById(`landing-${sec}-dropdown`);
    if (dropdown) dropdown.dataset.activeCat = cat;
    const query = document.getElementById(`landing-${sec}-search`)?.value || '';
    window.searchLandingProducts(sec, query);
};
window.populateLandingProductSelects = () => { };
window.populateLandingSettingsUI = () => {
    if (!DATA.landingSettings) return;
    const s = DATA.landingSettings;
    if (document.getElementById('landing-announcement')) document.getElementById('landing-announcement').value = s.announcement || "";
    if (document.getElementById('landing-hero-mob')) document.getElementById('landing-hero-mob').value = s.heroMob || "img/";
    if (document.getElementById('landing-hero-desk')) document.getElementById('landing-hero-desk').value = s.heroDesk || "img/";
    if (document.getElementById('landing-sec1-title')) document.getElementById('landing-sec1-title').value = s.sec1Title || "";
    if (document.getElementById('landing-sec1-subtitle')) document.getElementById('landing-sec1-subtitle').value = s.sec1Subtitle || "";
    if (document.getElementById('landing-sec2-title')) document.getElementById('landing-sec2-title').value = s.sec2Title || "";
    if (document.getElementById('landing-sec2-subtitle')) document.getElementById('landing-sec2-subtitle').value = s.sec2Subtitle || "";
    window.landingSec1Selected = s.sec1Products || [];
    window.landingSec2Selected = s.sec2Products || [];
    window.renderLandingPills('sec1');
    window.renderLandingPills('sec2');
};
window.saveLandingSettings = async () => {
    const btn = document.getElementById('landing-save-btn');
    if (btn) { btn.innerText = "Saving..."; btn.disabled = true; }
    try {
        const data = {
            announcement: document.getElementById('landing-announcement')?.value || "",
            heroMob: document.getElementById('landing-hero-mob')?.value || "img/",
            heroDesk: document.getElementById('landing-hero-desk')?.value || "img/",
            sec1Title: document.getElementById('landing-sec1-title')?.value || "",
            sec1Subtitle: document.getElementById('landing-sec1-subtitle')?.value || "",
            sec1Products: window.landingSec1Selected || [],
            sec2Title: document.getElementById('landing-sec2-title')?.value || "",
            sec2Subtitle: document.getElementById('landing-sec2-subtitle')?.value || "",
            sec2Products: window.landingSec2Selected || []
        };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', '_landing_settings_'), data);
        DATA.landingSettings = data;
        showToast("Landing Page Settings Saved");
    } catch (err) {
        console.error(err);
        showToast("Save Error");
    } finally {
        if (btn) { btn.innerText = "Save Landing Page"; btn.disabled = false; }
    }
};

window.renderSpotlightPills = () => {
    const container = document.getElementById('spotlight-pills');
    if (!container) return;
    if (!window.spotlightSelectedProducts.length) {
        container.innerHTML = `<span class="text-[9px] text-gray-400 italic font-bold">No products selected yet...</span>`;
        return;
    }
    container.innerHTML = window.spotlightSelectedProducts.map(id => {
        const p = DATA.p.find(x => x.id === id);
        if (!p) return '';
        return `<div class="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-100">
            <img src="${getOptimizedUrl(p.img, 50)}" class="w-5 h-5 rounded-lg object-cover">
            <span class="text-[9px] font-black uppercase truncate max-w-[140px]">${p.name}</span>
            <button type="button" onclick="removeSpotlightProduct('${id}')" class="w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500"><i class="fa-solid fa-xmark text-[10px]"></i></button>
        </div>`;
    }).join('');
};
window.addSpotlightProduct = (id) => {
    if (!window.spotlightSelectedProducts.includes(id)) window.spotlightSelectedProducts.push(id);
    const searchInput = document.getElementById('spotlight-product-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('spotlight-dropdown')?.classList.add('hidden');
    window.renderSpotlightPills();
};
window.removeSpotlightProduct = (id) => {
    window.spotlightSelectedProducts = window.spotlightSelectedProducts.filter(x => x !== id);
    window.renderSpotlightPills();
};
window.searchSpotlightProducts = (query) => {
    const dropdown = document.getElementById('spotlight-dropdown');
    if (!dropdown) return;
    if (!query || query.trim().length < 1) {
        dropdown.classList.add('hidden');
        return;
    }
    const q = query.toLowerCase().trim();
    const matches = DATA.p.filter(p => (p.name && p.name.toLowerCase().includes(q)) || (p.id && p.id.toLowerCase() === q)).slice(0, 8);
    if (!matches.length) {
        dropdown.innerHTML = `<div class="p-4 text-[10px] text-gray-400 font-bold uppercase italic text-center">No products found</div>`;
    } else {
        dropdown.innerHTML = matches.map(p => `<div onclick="addSpotlightProduct('${p.id}')" class="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
            <img src="${getOptimizedUrl(p.img, 100)}" class="w-10 h-10 rounded-xl object-cover bg-gray-50">
            <div class="flex-1 min-w-0"><div class="text-[10px] font-black uppercase text-gray-900 truncate">${p.name}</div><div class="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">${p.price} AED</div></div>
        </div>`).join('');
    }
    dropdown.classList.remove('hidden');
};
window.populateHomeAdminUI = () => {
    if (!DATA.homeSettings) return;
    const h = DATA.homeSettings;
    if (document.getElementById('spotlight-enabled')) document.getElementById('spotlight-enabled').checked = h.spotlightEnabled || false;
    if (document.getElementById('spotlight-title')) document.getElementById('spotlight-title').value = h.spotlightTitle || "";
    if (document.getElementById('spotlight-subtitle')) document.getElementById('spotlight-subtitle').value = h.spotlightSubtitle || "";
    if (document.getElementById('spotlight-cat-id')) document.getElementById('spotlight-cat-id').value = h.spotlightCatId || "";
    if (document.getElementById('spotlight-limit')) document.getElementById('spotlight-limit').value = h.spotlightLimit || 8;
    window.spotlightSelectedProducts = h.spotlightProducts || [];
    window.renderSpotlightPills();
};
window.saveHomeSettings = async () => {
    const btn = document.getElementById('homepage-save-btn');
    if (btn) { btn.innerText = "Saving Configuration..."; btn.disabled = true; }
    try {
        const data = {
            spotlightEnabled: document.getElementById('spotlight-enabled')?.checked || false,
            spotlightTitle: document.getElementById('spotlight-title')?.value || "",
            spotlightSubtitle: document.getElementById('spotlight-subtitle')?.value || "",
            spotlightCatId: document.getElementById('spotlight-cat-id')?.value || "",
            spotlightLimit: parseInt(document.getElementById('spotlight-limit')?.value, 10) || 8,
            spotlightProducts: window.spotlightSelectedProducts || []
        };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', '_home_settings_'), data);
        DATA.homeSettings = data;
        showToast("Home Page Settings Saved");
        renderHome();
    } catch (err) {
        console.error(err);
        showToast("Error Saving Settings");
    } finally {
        if (btn) { btn.innerText = "Save Configuration"; btn.disabled = false; }
    }
};

window.renderAdminLeads = async () => {
    const container = document.getElementById('admin-leads-list');
    if (!container) return;
    container.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-gray-300 animate-pulse"><i class="fa-solid fa-cloud-arrow-down text-3xl mb-4"></i><p class="text-[10px] font-bold uppercase tracking-widest">Fetching live leads...</p></div>';
    try {
        const snap = await getDocs(leadsCol);
        DATA.leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        DATA.leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (!DATA.leads.length) {
            container.innerHTML = `<div class="col-span-full text-center py-40 bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-100"><h3 class="text-gray-900 font-bold text-[12px] uppercase tracking-widest mb-2">No Leads Collected</h3></div>`;
            return;
        }
        container.innerHTML = DATA.leads.map(lead => `<div class="lead-row fade-in">
            <div class="lead-info"><h4>${lead.name || 'Anonymous User'}</h4><p class="flex items-center gap-2"><span class="text-black font-bold">${lead.whatsapp || 'No Number'}</span></p></div>
            <div class="flex gap-2"><a href="https://wa.me/${(lead.whatsapp || '').replace(/\D/g, '')}" target="_blank" class="w-12 h-12 rounded-2xl bg-green-50 text-green-500 flex items-center justify-center"><i class="fa-brands fa-whatsapp text-lg"></i></a><button onclick="deleteLead('${lead.id}')" class="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"><i class="fa-solid fa-trash-can text-sm"></i></button></div>
        </div>`).join('');
    } catch (err) {
        console.error("[Admin] Lead Load Error:", err);
        container.innerHTML = `<div class="p-10 text-center bg-red-50 rounded-[2rem] border border-red-100"><p class="text-red-500 font-bold text-[11px] uppercase tracking-widest">Connection Error</p></div>`;
    }
};
window.deleteLead = async (id) => {
    if (!confirm("Delete this lead?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leads', id));
        showToast("Lead Deleted");
        window.renderAdminLeads();
    } catch (err) { showToast("Delete Error"); }
};
window.exportLeadsExcel = () => {
    if (!DATA.leads || DATA.leads.length === 0) return showToast("No leads to export");
    let csv = "Name,WhatsApp,Age,Created At\n";
    DATA.leads.forEach(l => { csv += `"${l.name || ''}","${l.whatsapp || ''}",${l.age || ''},"${l.createdAt || ''}"\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

function renderAdminAnnouncements() {
    const container = document.getElementById('announcement-rows');
    if (!container) return;
    container.innerHTML = '';
    const msgs = DATA.announcements || [];
    if (msgs.length === 0) {
        addAnnouncementRow("");
    } else {
        msgs.forEach(m => addAnnouncementRow(m));
    }
}

function renderAdminMegaMenus() {
    const list = document.getElementById('admin-megamenu-list');
    const checklist = document.getElementById('m-categories-checkboxes');
    if (!list || !checklist) return;
    const currentEditId = document.getElementById('edit-megamenu-id')?.value || '';
    const currentEditItem = currentEditId ? (DATA.m || []).find(m => m.id === currentEditId) : null;
    const preselected = megaMenuEditSelection instanceof Set ? megaMenuEditSelection : new Set();
    if (!preselected.size) {
        (Array.isArray(currentEditItem?.categoryIds) ? currentEditItem.categoryIds : []).forEach((entry) => {
            if (!entry) return;
            if (typeof entry === 'string') {
                preselected.add(entry);
                preselected.add(entry.trim());
                preselected.add(entry.toLowerCase().trim());
                return;
            }
            if (typeof entry === 'object') {
                const rawId = String(entry.id || entry.value || entry.catId || '').trim();
                const rawName = String(entry.name || entry.label || '').trim();
                if (rawId) {
                    preselected.add(rawId);
                    preselected.add(rawId.toLowerCase());
                }
                if (rawName) {
                    preselected.add(rawName);
                    preselected.add(rawName.toLowerCase());
                }
            }
        });
    }

    // 1. Render Checklist (all normal categories)
    checklist.innerHTML = DATA.c.map(c => `
        <label class="mega-cat-label flex items-center gap-2 cursor-pointer border border-gray-100 bg-white rounded-xl shadow-sm transition-all hover:border-gray-900 hover:bg-gray-50" data-cat-id="${c.id}" style="height:52px; padding: 0 10px; overflow:hidden;">
            <input type="checkbox" value="${c.id}" class="mega-cat-checkbox sr-only" ${(preselected.has(c.id) || preselected.has(String(c.id).toLowerCase()) || preselected.has(c.name) || preselected.has(String(c.name || '').toLowerCase())) ? 'checked' : ''}>
            <div class="flex-shrink-0 w-5 h-5 rounded-md border-2 border-gray-200 bg-white flex items-center justify-center transition-all mega-tick-box" style="min-width:20px;">
                <svg class="mega-tick-icon hidden" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <img src="${getOptimizedUrl(c.img, 50)}" class="flex-shrink-0 w-7 h-7 object-cover rounded-lg bg-gray-100" onerror="this.src='https://placehold.co/50x50?text=Icon'">
            <span class="text-[11px] font-semibold text-gray-700 leading-tight truncate">${c.name}</span>
        </label>
    `).join('');

    // Wire up custom tick visuals for each checkbox
    checklist.querySelectorAll('.mega-cat-checkbox').forEach(cb => {
        const tickBox = cb.nextElementSibling;
        const tickIcon = tickBox ? tickBox.querySelector('.mega-tick-icon') : null;
        const updateTick = () => {
            if (cb.checked) {
                if (tickBox) {
                    tickBox.style.setProperty('border-color', '#111', 'important');
                    tickBox.style.setProperty('background', '#111', 'important');
                }
                if (tickIcon) {
                    tickIcon.classList.remove('hidden');
                    tickIcon.style.display = 'block';
                    tickIcon.style.opacity = '1';
                    const path = tickIcon.querySelector('path');
                    if (path) path.setAttribute('stroke', '#fff');
                }
            } else {
                if (tickBox) {
                    tickBox.style.removeProperty('border-color');
                    tickBox.style.removeProperty('background');
                }
                if (tickIcon) {
                    tickIcon.classList.add('hidden');
                    tickIcon.style.display = 'none';
                    tickIcon.style.opacity = '0';
                }
            }
        };
        cb.addEventListener('change', updateTick);
        updateTick(); // apply initial state if pre-checked
    });

    // Robust click handling: even when input is visually hidden, clicking anywhere on the row toggles the checkbox.
    checklist.querySelectorAll('.mega-cat-label').forEach((labelEl) => {
        labelEl.addEventListener('click', (e) => {
            const input = labelEl.querySelector('.mega-cat-checkbox');
            if (!input) return;
            if (e.target === input) return; // native toggle already handled
            e.preventDefault();
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change'));
        });
    });

    // 2. Render created Mega Menus
    const sorted = [...(DATA.m || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    list.innerHTML = sorted.map(m => {
        // Get mapped category objects
        const mappedCats = (m.categoryIds || [])
            .map(cId => DATA.c.find(c => c.id === cId))
            .filter(Boolean);

        const thumbs = mappedCats.slice(0, 5).map(c => `
            <img src="${getOptimizedUrl(c.img, 60)}" title="${c.name}"
                class="w-9 h-9 rounded-xl object-cover border-2 border-white shadow-sm -ml-2 first:ml-0 bg-gray-100"
                onerror="this.src='https://placehold.co/60x60?text=?'">
        `).join('');

        const extra = mappedCats.length > 5 ? `<span class="w-9 h-9 rounded-xl bg-gray-100 border-2 border-white shadow-sm -ml-2 flex items-center justify-center text-[9px] font-black text-gray-500">+${mappedCats.length - 5}</span>` : '';

        return `
        <div style="background:#fff; border:1px solid #f0f0f0; border-radius:20px; padding:16px 20px; display:flex; align-items:center; gap:16px; box-shadow:0 2px 12px rgba(0,0,0,0.04);">
            <!-- Left: Title + Category Thumbs -->
            <div style="flex:1; min-width:0;">
                <p style="font-size:13px; font-weight:900; color:#111; margin:0 0 8px;">${m.name}</p>
                <div style="display:flex; align-items:center; gap:0;">
                    ${thumbs}${extra}
                    ${mappedCats.length === 0 ? '<span style="font-size:10px;color:#9ca3af;font-style:italic;">No categories mapped</span>' : ''}
                </div>
                ${mappedCats.length > 0 ? `<p style="font-size:9px;color:#9ca3af;font-weight:700;margin-top:6px;text-transform:uppercase;letter-spacing:0.1em;">${mappedCats.length} categor${mappedCats.length === 1 ? 'y' : 'ies'} mapped</p>` : ''}
            </div>

            <!-- Right: Edit + Delete Buttons -->
            <div style="display:flex; gap:8px; flex-shrink:0;">
                <button type="button" onclick="editMegaMenu('${m.id}')"
                    style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:#f3f4f6;border:none;border-radius:12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#374151;cursor:pointer;transition:all 0.2s;"
                    onmouseover="this.style.background='#000';this.style.color='#fff'"
                    onmouseout="this.style.background='#f3f4f6';this.style.color='#374151'">
                    <i class="fa-solid fa-pen" style="font-size:9px;"></i> Edit
                </button>
                <button type="button" onclick="deleteMegaMenu('${m.id}')"
                    style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:#fff0f0;border:none;border-radius:12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#ef4444;cursor:pointer;transition:all 0.2s;"
                    onmouseover="this.style.background='#ef4444';this.style.color='#fff'"
                    onmouseout="this.style.background='#fff0f0';this.style.color='#ef4444'">
                    <i class="fa-solid fa-trash" style="font-size:9px;"></i> Delete
                </button>
            </div>
        </div>
        `;
    }).join('') || `<div style="text-align:center;padding:60px 20px;color:#d1d5db;font-size:11px;font-style:italic;">No Desktop Menus created yet.</div>`;
}

// Update renderAdminUI to handle announcements and megamenus
const originalRenderAdminUI = window.renderAdminUI;
window.renderAdminUI = () => {
    originalRenderAdminUI();
    const sList = document.getElementById('admin-slider-list');
    if (sList && state.adminTab === 'sliders') {
        renderAdminSliders(sList);
    }
    if (state.adminTab === 'announcements') {
        renderAdminAnnouncements();
    }
    if (state.adminTab === 'megamenu') {
        renderAdminMegaMenus();
    }
};
} // end initAdmin
