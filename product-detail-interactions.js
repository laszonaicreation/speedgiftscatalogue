export function registerProductDetailInteractions({ getOptimizedUrl, state }) {
    window.switchImg = (src, el) => {
        const main = document.getElementById('main-detail-img');
        if (main) {
            main.src = getOptimizedUrl(src, 1200);
            main.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${src}')`);
        }
        document.querySelectorAll('.thumb-box').forEach(x => x.classList.remove('active'));
        if (el) el.classList.add('active');
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
            fullImg.src = src;
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    window.toggleDescription = (btn) => {
        const content = btn.parentElement.querySelector('.desc-content');
        if (content.classList.contains('line-clamp-4')) {
            content.classList.remove('line-clamp-4');
            btn.innerText = 'Read Less';
        } else {
            content.classList.add('line-clamp-4');
            btn.innerText = 'Read More';
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
        inquiryBtn.setAttribute('onclick', `inquireOnWhatsApp(${args})`);
    }

    window.selectSize = (price, size, imgs, el) => {
        const priceDisplay = document.querySelector('.detail-price-text');
        if (priceDisplay) priceDisplay.innerText = `${price} AED`;

        const images = Array.isArray(imgs) ? imgs : (imgs && imgs !== 'img/' ? [imgs] : []);
        if (images.length > 0) {
            const mainImg = document.getElementById('main-detail-img');
            if (mainImg) {
                mainImg.src = getOptimizedUrl(images[0], 1200);
                mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
            }
            const thumbGrid = document.getElementById('detail-thumb-grid');
            if (thumbGrid) {
                thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
            }
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
        if (images.length > 0) {
            const mainImg = document.getElementById('main-detail-img');
            if (mainImg) {
                mainImg.src = getOptimizedUrl(images[0], 1200);
                mainImg.closest('.zoom-img-container')?.setAttribute('onclick', `openFullScreen('${images[0]}')`);
            }
            const thumbGrid = document.getElementById('detail-thumb-grid');
            if (thumbGrid) {
                thumbGrid.innerHTML = images.map((img, i) => `
                <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
                    <img src="${getOptimizedUrl(img, 300)}">
                </div>
            `).join('');
            }
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
}
