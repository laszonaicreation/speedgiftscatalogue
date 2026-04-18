// ─────────────────────────────────────────────────────────────────────────────
// app-slider.js — Hero Slider & Announcement Bar
// Lazy-loaded after first data fetch. Does NOT block initial page parse.
// Context received via initSlider({ db, appId, doc, setDoc }).
// Live data read via window._sgDATA / window._sgState / window._sgGetOptUrl.
// ─────────────────────────────────────────────────────────────────────────────

export function initSlider({ db, appId, doc, setDoc }) {
    let sliderInterval;
    let currentSlide = 0;
    let sliderMarkupKey = '';
    let announcementInterval;
    let currentAnnouncement = 0;

    const getData    = () => window._sgDATA;
    const getState   = () => window._sgState;
    const getOptUrl  = (url, w) => window._sgGetOptUrl ? window._sgGetOptUrl(url, w) : url;

    // ─── SLIDER ──────────────────────────────────────────────────────────────

    function renderSlider() {
        const DATA  = getData();
        const state = getState();

        const wrapper   = document.getElementById('home-top-elements');
        const container = document.getElementById('home-slider-container');
        const slider    = document.getElementById('home-slider');
        const dots      = document.getElementById('slider-dots');

        // Safety: always hide slider when a product detail is open (?p= in URL)
        const isProductDetail = new URLSearchParams(window.location.search).has('p');

        // Hide if product detail page or not on home view
        if (!slider || isProductDetail || state.filter !== 'all') {
            if (wrapper) wrapper.classList.add('hidden');
            return;
        }

        // DATA not yet loaded — skeleton is already visible in HTML, just wait
        // We detect this by checking if the skeleton placeholder still occupies the slider
        const skeletonEl = document.getElementById('slider-skeleton');
        const hasRealSlides = slider.children.length > 0 && !skeletonEl;
        if (!hasRealSlides && !DATA.s.length) {
            // Skeleton is showing — keep wrapper visible, don't hide
            if (wrapper) wrapper.classList.remove('hidden');
            return;
        }

        // Data loaded but no slides configured — hide cleanly
        if (!DATA.s.length) {
            if (wrapper) wrapper.classList.add('hidden');
            sliderMarkupKey = '';
            return;
        }

        // When search is active, only hide the slider container — keep mobile search bar visible
        if (state.search) {
            if (container) container.classList.add('hidden');
            if (wrapper) wrapper.classList.remove('hidden');
            return;
        }

        if (container) container.classList.remove('hidden');
        if (wrapper) wrapper.classList.remove('hidden');

        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        const sortedSliders = [...DATA.s].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

        const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';

        const visibleSliders = sortedSliders.filter(s => {
            const hasMobile  = isUrl(s.mobileImg);
            const hasDesktop = isUrl(s.img);
            return isMobile ? hasMobile : hasDesktop;
        });

        if (!visibleSliders.length) {
            if (container) container.classList.add('hidden');
            sliderMarkupKey = '';
            return;
        }

        // ── LCP PRELOAD CACHE ─────────────────────────────────────────────────
        try {
            const _lcpRawImg  = isMobile ? visibleSliders[0].mobileImg : visibleSliders[0].img;
            const _lcpUrl     = getOptUrl(_lcpRawImg, isMobile ? 1200 : 1920);
            const _lcpUrlDesk = getOptUrl(visibleSliders[0].img, 1920);
            const _lcpUrlMob  = getOptUrl(visibleSliders[0].mobileImg || visibleSliders[0].img, 1200);
            if (_lcpUrl && _lcpUrl !== 'img/') {
                localStorage.setItem('sg_lcp_img_url', _lcpUrl);
                localStorage.setItem('sg_lcp_img_mobile', isMobile ? '1' : '0');
                try {
                    const _heroRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', '_hero_config_');
                    setDoc(_heroRef, {
                        desktopUrl: _lcpUrlDesk || _lcpUrl,
                        mobileUrl:  _lcpUrlMob  || _lcpUrl,
                        updatedAt:  Date.now()
                    }, { merge: true }).catch(() => { });
                } catch (_fe) { /* Firestore write unavailable — not critical */ }
            }
        } catch (_e) { /* localStorage unavailable — ignore */ }

        // Avoid rebuilding markup when data/layout is unchanged
        const nextMarkupKey = [
            isMobile ? 'm' : 'd',
            ...visibleSliders.map((s) => `${s.id || ''}|${isMobile ? (s.mobileImg || '') : (s.img || '')}|${s.title || ''}|${s.link || ''}`)
        ].join('::');
        const canReuseMarkup = sliderMarkupKey === nextMarkupKey && slider.children.length === visibleSliders.length;
        if (canReuseMarkup) {
            if (container) container.classList.remove('hidden');
            if (wrapper) wrapper.classList.remove('hidden');
            return;
        }

        slider.innerHTML = visibleSliders.map((s, i) => {
            const displayImg = isMobile ? s.mobileImg : s.img;
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
                    <img src="${getOptUrl(displayImg, isMobile ? 1200 : 1920)}" 
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
        sliderMarkupKey = nextMarkupKey;

        // ── REMOVE LOADING STATE ──────────────────────────────────────────────
        // Now that real slider content is in place, snap back to normal white design
        document.getElementById('sg-loading-bg')?.remove();

        if (dots) {
            dots.innerHTML = visibleSliders.map((_, i) => `
                <div class="slider-dot ${i === 0 ? 'active' : ''}" onclick="window.goToSlide(${i})"></div>
            `).join('');
        }

        currentSlide = 0;
        startSliderAutoPlay();

        slider.onscroll = () => {
            const index = Math.round(slider.scrollLeft / slider.offsetWidth);
            if (index !== currentSlide && !isNaN(index)) {
                currentSlide = index;
                const allDots = dots.querySelectorAll('.slider-dot');
                allDots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
                startSliderAutoPlay();
            }
        };

        if (!isMobile) initSliderDrag(slider);
    }

    // ─── DESKTOP SLIDER DRAG ─────────────────────────────────────────────────

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
            if (moveDistance > 40) {
                if (diff > 0) window.moveSlider(-1);
                else window.moveSlider(1);
            }
        });

        slider.addEventListener('mouseleave', () => { isDown = false; });
        slider.addEventListener('mousemove', (e) => { if (isDown) e.preventDefault(); });
        slider.addEventListener('click', (e) => {
            if (moveDistance > 15) { e.preventDefault(); e.stopPropagation(); }
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
        slider.scrollTo({ left: slider.offsetWidth * currentSlide, behavior: 'smooth' });
        dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
        startSliderAutoPlay();
    }

    function startSliderAutoPlay() {
        clearInterval(sliderInterval);
        sliderInterval = setInterval(() => window.moveSlider(1), 5000);
    }

    // ─── ANNOUNCEMENT BAR ────────────────────────────────────────────────────

    function renderAnnouncementBar() {
        const DATA = getData();
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

    // ─── RESPONSIVE REBUILD ───────────────────────────────────────────────────
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (document.getElementById('home-slider-container')) renderSlider();
        }, 250);
    });

    return { renderSlider, renderAnnouncementBar };
}
