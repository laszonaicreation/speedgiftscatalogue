export function registerProductDetailInteractions({ getOptimizedUrl, state }) {
    let swipeStartX = 0;
    let swipeStartY = 0;
    const SWIPE_THRESHOLD = 40;

    const bindMobileImageSwipe = () => {
        const mediaContainer = document.querySelector('.zoom-img-container');
        if (!mediaContainer) return;
        if (mediaContainer.dataset.swipeBound === '1') return;
        mediaContainer.dataset.swipeBound = '1';

        mediaContainer.addEventListener('touchstart', (e) => {
            const t = e.changedTouches?.[0];
            if (!t) return;
            swipeStartX = t.clientX;
            swipeStartY = t.clientY;
        }, { passive: true });

        mediaContainer.addEventListener('touchend', (e) => {
            const t = e.changedTouches?.[0];
            if (!t) return;
            const dx = t.clientX - swipeStartX;
            const dy = t.clientY - swipeStartY;
            if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;

            const dots = Array.from(document.querySelectorAll('#detail-image-dots .detail-image-dot'));
            if (!dots.length) return;
            const currentIndex = Math.max(0, dots.findIndex((d) => d.classList.contains('active')));
            const nextIndex = dx < 0
                ? Math.min(dots.length - 1, currentIndex + 1)
                : Math.max(0, currentIndex - 1);
            if (nextIndex === currentIndex) return;

            const nextSrc = dots[nextIndex]?.dataset?.src;
            if (!nextSrc) return;
            window.switchImg(nextSrc, null);
        }, { passive: true });
    };

    window.initDetailMobileSwipe = bindMobileImageSwipe;
    const preloadedMainUrls = new Set();
    const getDetailMainImageUrl = (src) => {
        const width = window.innerWidth < 768 ? 1200 : 1600;
        return getOptimizedUrl(src, width);
    };
    const getDetailPreviewUrl = (src) => getOptimizedUrl(src, 260);
    const preloadDetailImages = (images = []) => {
        images.forEach((src) => {
            if (!src) return;
            const mainUrl = getDetailMainImageUrl(src);
            const previewUrl = getDetailPreviewUrl(src);

            const pImg = new Image();
            pImg.decoding = 'async';
            pImg.src = previewUrl;

            const img = new Image();
            img.decoding = 'async';
            img.onload = () => preloadedMainUrls.add(mainUrl);
            img.src = mainUrl;
        });
    };
    window.preloadDetailImages = preloadDetailImages;

    const renderMediaSelectors = (images = []) => {
        const thumbGrid = document.getElementById('detail-thumb-grid');
        if (thumbGrid) {
            thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
        }
        const dots = document.getElementById('detail-image-dots');
        if (dots) {
            dots.innerHTML = images.map((img, i) => `
                <button type="button" class="detail-image-dot ${i === 0 ? 'active' : ''}" data-src="${img}" onclick="switchImg('${img}', this)" aria-label="View image ${i + 1}"></button>
            `).join('');
        }
        bindMobileImageSwipe();
    };

    window.switchImg = (src, el) => {
        const main = document.getElementById('main-detail-img');
        if (main) {
            const mainUrl = getDetailMainImageUrl(src);
            const previewUrl = getDetailPreviewUrl(src);
            // Perceived-speed path: paint a tiny preview instantly, then upgrade to main image.
            main.src = previewUrl;
            if (preloadedMainUrls.has(mainUrl)) {
                main.src = mainUrl;
            } else {
                const hi = new Image();
                hi.decoding = 'async';
                hi.onload = () => {
                    preloadedMainUrls.add(mainUrl);
                    if ((main.dataset.targetSrc || '') === src) main.src = mainUrl;
                };
                hi.src = mainUrl;
            }
            main.dataset.targetSrc = src;
            main.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${src}')`);
        }
        document.querySelectorAll('.thumb-box').forEach(x => x.classList.remove('active'));
        if (el && el.classList.contains('thumb-box')) el.classList.add('active');
        document.querySelectorAll('.detail-image-dot').forEach((dot) => {
            dot.classList.toggle('active', dot.dataset.src === src);
        });
    };

    window.handleZoom = (e, container) => {
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
        img.style.transformOrigin = 'center center';
    };

    window.openFullScreen = (src) => {
        const overlay = document.getElementById('img-full-preview');
        const fullImg = document.getElementById('full-preview-img');
        if (overlay && fullImg) {
            fullImg.src = getDetailMainImageUrl ? getDetailMainImageUrl(src) : src;
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            if (overlay.dataset.swipeBound !== '1') {
                overlay.dataset.swipeBound = '1';
                overlay.addEventListener('touchstart', (e) => {
                    const t = e.changedTouches?.[0];
                    if (!t) return;
                    swipeStartX = t.clientX;
                    swipeStartY = t.clientY;
                }, { passive: true });

                overlay.addEventListener('touchend', (e) => {
                    const t = e.changedTouches?.[0];
                    if (!t) return;
                    const dx = t.clientX - swipeStartX;
                    const dy = t.clientY - swipeStartY;
                    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;

                    const dots = Array.from(document.querySelectorAll('#detail-image-dots .detail-image-dot'));
                    if (!dots.length) return;
                    const currentIndex = Math.max(0, dots.findIndex((d) => d.classList.contains('active')));
                    const nextIndex = dx < 0
                        ? Math.min(dots.length - 1, currentIndex + 1)
                        : Math.max(0, currentIndex - 1);
                    if (nextIndex === currentIndex) return;

                    const nextSrc = dots[nextIndex]?.dataset?.src;
                    if (!nextSrc) return;

                    overlay.dataset.justSwiped = '1';
                    setTimeout(() => overlay.dataset.justSwiped = '0', 100);

                    fullImg.src = getDetailMainImageUrl ? getDetailMainImageUrl(nextSrc) : nextSrc;
                    window.switchImg(nextSrc, null);
                }, { passive: true });
            }
        }
    };

    window.toggleDetailSection = (btn) => {
        const wrap = btn.closest('.detail-accordion');
        if (!wrap) return;
        const content = wrap.querySelector('.detail-accordion-content');
        const arrow = wrap.querySelector('.detail-accordion-arrow');
        if (!content) return;
        const isOpen = !content.classList.contains('hidden');
        if (isOpen) {
            content.classList.add('hidden');
            arrow?.classList.remove('open');
        } else {
            content.classList.remove('hidden');
            arrow?.classList.add('open');
        }
    };

    window.closeFullScreen = () => {
        const overlay = document.getElementById('img-full-preview');
        if (overlay) {
            if (overlay.dataset.justSwiped === '1') return;
            overlay.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };

    window.updateDetailQty = (change) => {
        const qtyEl = document.getElementById('detail-qty-val');
        if (!qtyEl) return;
        let currentQty = parseInt(qtyEl.value) || 1;
        let maxQty = qtyEl.hasAttribute('max') ? parseInt(qtyEl.getAttribute('max')) : 100;
        if (isNaN(maxQty)) maxQty = 100;
        
        currentQty += change;
        if (currentQty < 1) currentQty = 1;
        if (currentQty > maxQty) {
            currentQty = maxQty;
            if (window.showToast && change > 0) window.showToast(`Only ${maxQty} in stock`);
        }
        qtyEl.value = currentQty;
    };

    window.validateDetailQty = (el) => {
        let val = parseInt(el.value);
        let maxQty = el.hasAttribute('max') ? parseInt(el.getAttribute('max')) : 100;
        if (isNaN(maxQty)) maxQty = 100;
        
        if (isNaN(val) || val < 1) val = 1;
        if (val > maxQty) {
            val = maxQty;
            if (window.showToast) window.showToast(`Only ${maxQty} in stock`);
        }
        el.value = val;
    };

    function updateInquiryButton(selectedSize, selectedPrice, selectedColor) {
        const inquiryBtn = document.getElementById('main-inquiry-btn');
        if (!inquiryBtn) return;
        const match = inquiryBtn.getAttribute('onclick').match(/inquireOnWhatsApp\('([^']+)'(?:, '([^']*)')?(?:, '([^']*)')?(?:, '([^']*)')?\)/);
        if (!match) return;

        const id = match[1];
        const currentSize = selectedSize !== null ? selectedSize : (match[2] !== 'null' ? match[2] : null);
        const currentPrice = selectedPrice !== null ? selectedPrice : (match[3] !== 'null' ? match[3] : null);
        const currentColor = selectedColor !== null ? selectedColor : (match[4] !== 'null' ? match[4] : null);

        let args = `'${id}'`;
        if (currentSize) args += `, '${currentSize}'`; else args += ', null';
        if (currentPrice) args += `, '${currentPrice}'`; else args += ', null';
        if (currentColor) args += `, '${currentColor}'`;

        // WhatsApp button doesn't directly take qty in args, it reads from DOM inside inquireOnWhatsApp.
        inquiryBtn.setAttribute('onclick', `inquireOnWhatsApp(${args})`);
    }

    window.selectSize = (price, size, imgs, el) => {
        const priceDisplay = document.querySelector('.detail-price-text');
        if (priceDisplay) priceDisplay.innerText = `${price} AED`;

        const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
        preloadDetailImages(images);
        if (images.length > 0) {
            const mainImg = document.getElementById('main-detail-img');
            if (mainImg) {
                mainImg.src = getDetailMainImageUrl(images[0]);
                mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
            }
            renderMediaSelectors(images);
        }

        document.querySelectorAll('.size-badge').forEach(b => {
            b.classList.remove('bg-black', 'text-white', 'border-black');
            b.classList.add('bg-white', 'text-black', 'border-gray-200');
        });
        el.classList.remove('bg-white', 'text-black', 'border-gray-200');
        el.classList.add('bg-black', 'text-white', 'border-black');

        state.currentVar = { size, price, img: images[0] };
        updateInquiryButton(size, price, null);

        if (window.innerWidth < 768) {
            const container = document.querySelector('.detail-view-container');
            if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
        }
    };

    window.selectColor = (price, color, imgs, el) => {
        const priceDisplay = document.querySelector('.detail-price-text');
        if (priceDisplay) priceDisplay.innerText = `${price} AED`;

        const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
        preloadDetailImages(images);
        if (images.length > 0) {
            const mainImg = document.getElementById('main-detail-img');
            if (mainImg) {
                mainImg.src = getDetailMainImageUrl(images[0]);
                mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
            }
            renderMediaSelectors(images);
        }

        document.querySelectorAll('.color-swatch').forEach(b => {
            b.classList.remove('border-black', 'scale-110');
            b.classList.add('border-white');
        });
        const swatch = el.querySelector('.color-swatch');
        if (swatch) {
            swatch.classList.remove('border-white');
            swatch.classList.add('border-black', 'scale-110');
        }

        state.currentVar = { color, price, img: images[0] };
        updateInquiryButton(null, price, color);

        if (window.innerWidth < 768) {
            const container = document.querySelector('.detail-view-container');
            if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
        }
    };

    window.addToCart = (productId) => {
        // Collect current variation state
        const currentVar = state.currentVar || {};
        const price = currentVar.price || null;
        const size = currentVar.size || null;
        const color = currentVar.color || null;
        const img = currentVar.img || null;

        let qty = 1;
        const qtyEl = document.getElementById('detail-qty-val');
        if (qtyEl) qty = parseInt(qtyEl.value) || 1;

        // Read name and base price from DOM
        const nameEl = document.querySelector('.detail-product-name');
        const priceEl = document.querySelector('.detail-price-text');
        const imgEl = document.getElementById('main-detail-img');

        const name = nameEl?.innerText || productId;
        const displayPrice = price || (priceEl?.innerText?.replace(' AED', '').trim()) || '0';
        const displayImg = img || imgEl?.src || '';

        if (typeof window.cartAddItem === 'function') {
            window.cartAddItem({ id: productId, name, price: displayPrice, img: displayImg, size, color, qty });
        }

        // Visual feedback: pulse the button → green "Added!"
        const btn = document.getElementById('main-add-to-cart-btn');
        if (btn) {
            btn.classList.add('scale-95');
            btn.style.background = '#16a34a';
            btn.innerHTML = `<i class="fa-solid fa-check text-2xl"></i><div class="flex flex-col items-start leading-tight"><span class="text-[8px] font-bold opacity-70 uppercase tracking-[0.2em]">Added to</span><span class="text-[13px] font-black uppercase tracking-widest leading-none mt-0.5">Cart!</span></div>`;
            setTimeout(() => {
                btn.classList.remove('scale-95');
                btn.style.background = '';
                btn.innerHTML = `<i class="fa-solid fa-cart-shopping text-2xl"></i><div class="flex flex-col items-start leading-tight"><span class="text-[8px] font-bold opacity-60 uppercase tracking-[0.2em]">Add to</span><span class="text-[13px] font-black uppercase tracking-widest leading-none mt-0.5">Cart</span></div>`;
            }, 2000);
        }
    };

    // Global listener for interactive star rating in the review form
    document.addEventListener('change', (e) => {
        if (e.target.name === 'rating' && e.target.closest('#star-rating-input')) {
            const val = parseInt(e.target.value);
            const container = e.target.closest('#star-rating-input');
            const icons = container.querySelectorAll('i');
            icons.forEach((icon, index) => {
                if (index < val) {
                    icon.classList.remove('fa-regular');
                    icon.classList.add('fa-solid');
                } else {
                    icon.classList.remove('fa-solid');
                    icon.classList.add('fa-regular');
                }
            });
        }
    });
}
