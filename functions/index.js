const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const sharp = require('sharp');
const zlib = require('zlib');

admin.initializeApp();
const db = admin.firestore();

// ─── Global In-Memory Cache ───────────────────────────────────────
const memoryCache = {
    homeData: null,
    homeDataTime: 0,
    shopData: null,
    shopDataTime: 0,
    homeRawHtml: null,
    shopRawHtml: null
};
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

exports.renderProduct = onRequest(async (req, res) => {
    try {
        // The frontend sometimes uses ?id=... and sometimes ?p=...
        let productId = req.query.id || req.query.p;

        // Support shorter URL format: /p/PRODUCT_ID
        if (!productId && req.path.startsWith('/p/')) {
            const parts = req.path.split('/');
            try {
                productId = decodeURIComponent(parts[2]); // ['', 'p', 'PRODUCT_ID']
            } catch (e) {
                productId = parts[2];
            }
        }

        // Fetch the raw HTML template
        // We fetch the static file from the hosting domain
        const hostUrl = `https://${process.env.GCLOUD_PROJECT}.web.app`;
        const rawHtmlUrl = `${hostUrl}/product-detail-static.html`;

        const htmlResponse = await fetch(rawHtmlUrl);
        let htmlString = await htmlResponse.text();

        if (productId) {
            console.log("Fetching product ID:", productId);
            // Fetch product data from Firestore
            const productDoc = await db.collection('artifacts')
                .doc('speed-catalogue') // The projectId from frontend
                .collection('public')
                .doc('data')
                .collection('products')
                .doc(productId)
                .get();

            console.log("Product exists?", productDoc.exists);
            if (productDoc.exists) {
                const product = productDoc.data();
                const title = `${product.name} | Speed Gifts`;

                // Clean description
                let description = product.desc || product.details || `Buy ${product.name} at Speed Gifts.`;
                description = description.replace(/<[^>]*>?/gm, ''); // remove html tags if any
                description = description.substring(0, 150) + '...';

                // Get first valid image
                let imageUrl = (product.images && product.images.length > 0) ? product.images[0] : (product.img || 'https://res.cloudinary.com/dxkcvm2yh/image/upload/v1769084529/speed_logo_5552_zuu2n7.png');
                let lcpImageUrl = imageUrl;

                // WhatsApp does not support .webp and ignores images > 300KB. 
                // We inject Cloudinary transformations to enforce a small, compressed .jpg
                if (imageUrl.includes('res.cloudinary.com') && imageUrl.includes('/upload/')) {
                    // Extract the part after /upload/ (e.g. v12345/filename.webp)
                    const parts = imageUrl.split('/upload/');
                    let afterUpload = parts[1];
                    // If there are existing transformations, they are before the vXXXX/
                    // To be safe, we just prepend our strict WhatsApp-friendly transformations:
                    imageUrl = `${parts[0]}/upload/w_600,h_600,c_fit,q_80,f_jpg/${afterUpload}`;
                    // Replace .webp with .jpg at the end just to be sure
                    imageUrl = imageUrl.replace('.webp', '.jpg');

                    // LCP image for the website needs to be highly optimized WebP
                    lcpImageUrl = `${parts[0]}/upload/f_auto,q_auto,w_800,c_limit/${afterUpload}`;
                } else if (imageUrl.includes('firebasestorage.googleapis.com')) {
                    // Firebase Storage does NOT auto-convert formats like Cloudinary.
                    // .jpg files don't exist — only .webp files are stored.
                    // Modern WhatsApp fully supports WebP, so use the original .webp URL.
                    // For LCP preload, use the _thumb.webp variant if available.
                    if (imageUrl.includes('.webp?')) {
                        lcpImageUrl = imageUrl.replace('.webp?', '_thumb.webp?');
                    }
                    // imageUrl stays as-is (.webp) — WhatsApp will render it correctly
                }

                // Determine the actual requested domain for the og:url
                const actualHost = req.headers['x-forwarded-host'] || req.hostname || `${process.env.GCLOUD_PROJECT}.web.app`;
                const finalUrl = req.path.startsWith('/p/')
                    ? `https://${actualHost}/p/${productId}`
                    : `https://${actualHost}/product-detail.html?id=${productId}`;

                // Inject Open Graph tags into the <head>
                const ogTags = `
    <!-- Dynamic Open Graph Tags -->
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${finalUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="preload" as="image" href="${lcpImageUrl}" fetchpriority="high">
    <script>window.__INJECTED_PRODUCT__ = ${JSON.stringify({ id: productDoc.id, ...product }).replace(/</g, '\\u003c')};</script>
                `;

                htmlString = htmlString.replace('</head>', `${ogTags}\n</head>`);
                htmlString = htmlString.replace('<title>Product Detail | Speed Gifts</title>', `<title>${title}</title>`);
            }
        }

        // Send the modified HTML
        res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.set('Content-Type', 'text/html; charset=utf-8');
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (acceptEncoding.includes('br')) {
            res.set('Content-Encoding', 'br');
            res.status(200).send(zlib.brotliCompressSync(htmlString));
        } else if (acceptEncoding.includes('gzip')) {
            res.set('Content-Encoding', 'gzip');
            res.status(200).send(zlib.gzipSync(htmlString));
        } else {
            res.status(200).send(htmlString);
        }
    } catch (error) {
        console.error('Error rendering product page:', error);
        res.status(500).send('Internal Server Error');
    }
});

exports.renderHome = onRequest(async (req, res) => {
    try {
        const appId = req.query.appId || 'speed-catalogue';
        const now = Date.now();
        let responseData = null;

        // Use memory cache if valid
        if (memoryCache.homeData && (now - memoryCache.homeDataTime < CACHE_TTL_MS)) {
            responseData = memoryCache.homeData;
            console.log('[renderHome] Using memory cache (fast path)');
        } else {
            console.log('[renderHome] Fetching from Firestore (cache miss)');
            const today = new Date().toISOString().split('T')[0];
            const dataRef = db.collection('artifacts').doc(appId).collection('public').doc('data');

            const prodCol = dataRef.collection('products');
            const catCol = dataRef.collection('categories');
            const megaCol = dataRef.collection('mega_menus');
            const sliderCol = dataRef.collection('sliders');
            const popupCol = dataRef.collection('popup_settings');
            const dailyStatsRef = dataRef.collection('daily_stats').doc(today);

            const configDocIds = ['_announcements_', '_landing_settings_', '_home_settings_', '_ad_stats_', '--global-stats--', '_hero_config_'];

            const [syncSnap, configSnap, featuredSnap, fallbackSnap, catSnap, megaSnap, sliderSnap, popupSnap, todaySnap] = await Promise.all([
                db.doc(`artifacts/${appId}/public/data/config/sync_status`).get(),
                prodCol.where(admin.firestore.FieldPath.documentId(), 'in', configDocIds).get(),
                prodCol.where('isFeatured', '==', true).get(),
                prodCol.limit(30).get(),
                catCol.get(),
                megaCol.get(),
                sliderCol.get(),
                popupCol.limit(1).get(),
                dailyStatsRef.get().catch(() => null)
            ]);

            const uniqueMap = new Map();
            [...configSnap.docs, ...featuredSnap.docs, ...fallbackSnap.docs].forEach(d => {
                if (!uniqueMap.has(d.id)) {
                    uniqueMap.set(d.id, { id: d.id, ...d.data() });
                }
            });

            const rawProducts = Array.from(uniqueMap.values());
            const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const megaMenus = megaSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
            const sliders = sliderSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const announcementsDoc = rawProducts.find(p => p.id === '_announcements_');
            const announcements = announcementsDoc ? (announcementsDoc.messages || []) : [];

            const popupSettings = (!popupSnap.empty) ? popupSnap.docs[0].data() : null;

            const landingDoc = rawProducts.find(p => p.id === '_landing_settings_');
            const landingSettings = landingDoc ? { ...landingDoc } : null;

            const homeSettingsDoc = rawProducts.find(p => p.id === '_home_settings_');
            const homeSettings = homeSettingsDoc ? { ...homeSettingsDoc } : null;

            const products = rawProducts.filter(p => !p.id.startsWith('_') && !p.id.startsWith('--'));
            
            let stats = null;
            if (todaySnap && todaySnap.exists) {
                stats = todaySnap.data();
            }

            responseData = {
                products,
                categories,
                megaMenus,
                sliders,
                announcements,
                popupSettings,
                landingSettings,
                homeSettings,
                stats,
                serverSyncTime: syncSnap.exists ? (syncSnap.data().lastUpdated?.toMillis() || Date.now()) : Date.now()
            };
            
            // Save to memory cache
            memoryCache.homeData = responseData;
            memoryCache.homeDataTime = now;
        }

        const rawHtmlUrl = 'https://speed-catalogue.web.app/index-static.html';
        let htmlString = memoryCache.homeRawHtml;
        if (!htmlString) {
            const htmlResponse = await fetch(rawHtmlUrl);
            if (!htmlResponse.ok) throw new Error('Failed to fetch template');
            htmlString = await htmlResponse.text();
            memoryCache.homeRawHtml = htmlString;
        }
        
        const sliders = responseData.sliders;
        let preloadTag = '';
        let ssrSliderKey = null; // Will be set if sliders exist — used to prevent re-render after Firebase fetch
        if (sliders && sliders.length > 0) {
            const sortedSliders = [...sliders].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
            const firstMobile = sortedSliders.find(s => s.mobileImg && s.mobileImg !== 'img/' && s.mobileImg !== 'img');
            const firstDesktop = sortedSliders.find(s => s.img && s.img !== 'img/' && s.img !== 'img');

            const mUrl = firstMobile ? firstMobile.mobileImg : null;
            const dUrl = firstDesktop ? firstDesktop.img : null;

            if (mUrl && dUrl && mUrl !== dUrl) {
                preloadTag = `<link rel="preload" as="image" href="${mUrl}" media="(max-width: 767px)" fetchpriority="high">\n<link rel="preload" as="image" href="${dUrl}" media="(min-width: 768px)" fetchpriority="high">\n`;
            } else if (mUrl || dUrl) {
                preloadTag = `<link rel="preload" as="image" href="${mUrl || dUrl}" fetchpriority="high">\n`;
            }
            
            // Hide the skeleton using CSS since we are injecting the actual image
            preloadTag += '<style>#slider-skeleton, #slider-skeleton-dots { display: none !important; }</style>\n';

            // Generate SSR HTML for the first slide to eliminate JS-induced LCP delay
            let firstSlideHtml = '';
            if (firstDesktop || firstMobile) {
                let validSrcDesktop = dUrl || mUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                let validSrcMobile = mUrl || dUrl || validSrcDesktop;
                
                const altText = (firstDesktop && firstDesktop.title) || (firstMobile && firstMobile.title) || '';
                
                const titleText = (firstDesktop && firstDesktop.title) || (firstMobile && firstMobile.title) || '';
                const overlayHTML = titleText ? `
                    <div class="absolute inset-0 hidden md:flex bg-gradient-to-t from-black/60 via-black/10 to-transparent items-end pb-14 pl-16 z-20 pointer-events-none">
                         <h2 class="text-5xl lg:text-5xl font-black text-white uppercase tracking-[-0.03em] drop-shadow-md max-w-2xl leading-[1]">${titleText}</h2>
                    </div>
                    <div class="absolute bottom-12 left-8 text-white z-20 md:hidden">
                         <h2 class="text-2xl font-black uppercase tracking-tighter">${titleText}</h2>
                    </div>
                ` : '';

                // data-ssr-slide="1" lets app-slider.js detect this is SSR content
                firstSlideHtml = `
                <div class="slider-slide relative" data-index="0" data-ssr-slide="1">
                    <picture>
                        ${mUrl && dUrl && mUrl !== dUrl ? \`<source media="(max-width: 767px)" srcset="\${validSrcMobile}">
                        <source media="(min-width: 768px)" srcset="\${validSrcDesktop}">
                        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="no-animation w-full h-full object-cover" fetchpriority="high" loading="eager" alt="\${altText}">\` : \`
                        <img src="\${validSrcDesktop}" class="no-animation w-full h-full object-cover" fetchpriority="high" loading="eager" alt="\${altText}">\`}
                    </picture>
                    ${overlayHTML}
                </div>`;
                
                // Pre-compute the sliderMarkupKey for BOTH mobile and desktop universally.
                // Key format: "id|mobileImg|img|title|link" for each slide
                const computeKey = () => {
                    const parts = sortedSliders
                        .filter(s => (s.mobileImg && s.mobileImg !== 'img/' && s.mobileImg !== 'img') || (s.img && s.img !== 'img/' && s.img !== 'img'))
                        .map(s => `${s.id||''}|${s.mobileImg||''}|${s.img||''}|${s.title||''}|${s.link||''}`);
                    return parts.join('::');
                };
                ssrSliderKey = { u: computeKey() };
                
                // Inject into the HTML string directly inside home-slider
                // IMPORTANT: Use function form of replace() to prevent $ chars in Firebase URLs from being
                // interpreted as regex replacement patterns ($1, $&, etc.)
                htmlString = htmlString.replace(/(<div id="home-slider"[^>]*>)/, (match) => match + '\n' + firstSlideHtml);
            }
        }

        // Inject data + SSR slider key (prevents JS re-render after Firebase fetch if data unchanged)
        const injectionScript = `<script>window.__INJECTED_HOME_DATA__ = ${JSON.stringify(responseData)};${ssrSliderKey ? `window._sgSSRSliderKeys=${JSON.stringify(ssrSliderKey)};` : ''}</script>`;

        if (htmlString.includes('<head>')) {
            htmlString = htmlString.replace('<head>', '<head>\n' + preloadTag);
        } else {
            htmlString = preloadTag + htmlString;
        }

        if (htmlString.includes('</body>')) {
            htmlString = htmlString.replace('</body>', injectionScript + '\n</body>');
        } else if (htmlString.includes('</head>')) {
            htmlString = htmlString.replace('</head>', injectionScript + '\n</head>');
        } else {
            htmlString += injectionScript;
        }

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.set('Content-Type', 'text/html; charset=utf-8');
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (acceptEncoding.includes('br')) {
            res.set('Content-Encoding', 'br');
            res.status(200).send(zlib.brotliCompressSync(htmlString));
        } else if (acceptEncoding.includes('gzip')) {
            res.set('Content-Encoding', 'gzip');
            res.status(200).send(zlib.gzipSync(htmlString));
        } else {
            res.status(200).send(htmlString);
        }
    } catch (error) {
        console.error('Error rendering home page:', error);
        res.status(500).send('Internal Server Error');
    }
});

exports.renderShop = onRequest(async (req, res) => {
    try {
        const appId = req.query.appId || 'speed-catalogue';
        const now = Date.now();
        let responseData = null;

        // Use memory cache if valid
        if (memoryCache.shopData && (now - memoryCache.shopDataTime < CACHE_TTL_MS)) {
            responseData = memoryCache.shopData;
            console.log('[renderShop] Using memory cache (fast path)');
        } else {
            console.log('[renderShop] Fetching from Firestore (cache miss)');
            const dataRef = db.collection('artifacts').doc(appId).collection('public').doc('data');

            const prodCol = dataRef.collection('products');
            const catCol = dataRef.collection('categories');
            const megaCol = dataRef.collection('mega_menus');

            // We only need basic configs to exclude them from the product list
            const configDocIds = ['_announcements_', '_landing_settings_', '_home_settings_', '_ad_stats_', '--global-stats_', '_hero_config_'];

            const [syncSnap, prodSnap, catSnap, megaSnap] = await Promise.all([
                db.doc(`artifacts/${appId}/public/data/config/sync_status`).get(),
                prodCol.get(),
                catCol.get(),
                megaCol.get()
            ]);

            const rawProducts = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const products = rawProducts.filter(p => !configDocIds.includes(p.id) && !p.id.startsWith('--'));
            const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const megaMenus = megaSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));

            responseData = {
                products,
                categories,
                megaMenus,
                serverSyncTime: syncSnap.exists ? (syncSnap.data().lastUpdated?.toMillis() || Date.now()) : Date.now()
            };
            
            // Save to memory cache
            memoryCache.shopData = responseData;
            memoryCache.shopDataTime = now;
        }

        const rawHtmlUrl = `https://${process.env.GCLOUD_PROJECT}.web.app/shop-static.html`;
        let htmlString = memoryCache.shopRawHtml;
        if (!htmlString) {
            const htmlResponse = await fetch(rawHtmlUrl);
            if (!htmlResponse.ok) throw new Error('Failed to fetch shop template');
            htmlString = await htmlResponse.text();
            memoryCache.shopRawHtml = htmlString;
        }

        const injectionScript = `<script>window.__INJECTED_SHOP_DATA__ = ${JSON.stringify(responseData)};</script>`;

        if (htmlString.includes('</body>')) {
            htmlString = htmlString.replace('</body>', injectionScript + '\n</body>');
        } else if (htmlString.includes('</head>')) {
            htmlString = htmlString.replace('</head>', injectionScript + '\n</head>');
        } else {
            htmlString += injectionScript;
        }

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.set('Content-Type', 'text/html; charset=utf-8');
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (acceptEncoding.includes('br')) {
            res.set('Content-Encoding', 'br');
            res.status(200).send(zlib.brotliCompressSync(htmlString));
        } else if (acceptEncoding.includes('gzip')) {
            res.set('Content-Encoding', 'gzip');
            res.status(200).send(zlib.gzipSync(htmlString));
        } else {
            res.status(200).send(htmlString);
        }
    } catch (error) {
        console.error('Error rendering shop page:', error);
        res.status(500).send('Internal Server Error');
    }
});

exports.getHomeData = onRequest({ cors: true }, async (req, res) => {
    try {
        const appId = req.query.appId || 'speed-catalogue';
        const now = Date.now();
        let responseData = null;

        // Use memory cache if valid
        if (memoryCache.getHomeData && (now - memoryCache.getHomeDataTime < CACHE_TTL_MS)) {
            responseData = memoryCache.getHomeData;
            console.log('[getHomeData] Using memory cache (fast path)');
        } else {
            console.log('[getHomeData] Fetching from Firestore (cache miss)');
            const today = new Date().toISOString().split('T')[0];
            const dataRef = db.collection('artifacts').doc(appId).collection('public').doc('data');

            const prodCol = dataRef.collection('products');
            const catCol = dataRef.collection('categories');
            const megaCol = dataRef.collection('mega_menus');
            const sliderCol = dataRef.collection('sliders');
            const popupCol = dataRef.collection('popup_settings');
            const dailyStatsRef = dataRef.collection('daily_stats').doc(today);

            const configDocIds = ['_announcements_', '_landing_settings_', '_home_settings_', '_ad_stats_', '--global-stats--', '_hero_config_'];

            const [syncSnap, configSnap, featuredSnap, fallbackSnap, catSnap, megaSnap, sliderSnap, popupSnap, todaySnap] = await Promise.all([
                db.doc(`artifacts/${appId}/public/data/config/sync_status`).get(),
                prodCol.where(admin.firestore.FieldPath.documentId(), 'in', configDocIds).get(),
                prodCol.where('isFeatured', '==', true).get(),
                prodCol.limit(30).get(),
                catCol.get(),
                megaCol.get(),
                sliderCol.get(),
                popupCol.limit(1).get(),
                dailyStatsRef.get().catch(() => null)
            ]);

            const uniqueMap = new Map();
            [...configSnap.docs, ...featuredSnap.docs, ...fallbackSnap.docs].forEach(d => {
                if (!uniqueMap.has(d.id)) {
                    uniqueMap.set(d.id, { id: d.id, ...d.data() });
                }
            });

            const rawProducts = Array.from(uniqueMap.values());
            const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const megaMenus = megaSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
            const sliders = sliderSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const announcementsDoc = rawProducts.find(p => p.id === '_announcements_');
            const announcements = announcementsDoc ? (announcementsDoc.messages || []) : [];

            const popupSettings = (!popupSnap.empty) ? popupSnap.docs[0].data() : null;

            const landingDoc = rawProducts.find(p => p.id === '_landing_settings_');
            const landingSettings = landingDoc ? { ...landingDoc } : null;

            const homeDoc = rawProducts.find(p => p.id === '_home_settings_');
            const homeSettings = homeDoc ? { ...homeDoc } : null;

            const defaultStats = { adVisits: 0, adHops: 0, adInquiries: 0, adImpressions: 0, totalSessionSeconds: 0, normalVisits: 0, adProductClicks: 0, normalProductClicks: 0, imageLoadFail: 0 };
            const statsDoc = rawProducts.find(p => p.id === '_ad_stats_');
            const stats = statsDoc ? { ...defaultStats, ...statsDoc } : { ...defaultStats };

            if (todaySnap && todaySnap.exists) {
                const td = todaySnap.data();
                stats.adVisits += (td.adVisits || 0) + (td.landingAdVisits || 0);
                stats.normalVisits += (td.normalVisits || 0);
                stats.adProductClicks = (stats.adProductClicks || 0) + (td.adProductClicks || 0);
                stats.normalProductClicks = (stats.normalProductClicks || 0) + (td.normalProductClicks || 0);
                stats.adInquiries += (td.adInquiries || 0);
                stats.imageLoadFail += (td.imageLoadFail || 0);
            }

            const products = rawProducts.filter(p => !configDocIds.includes(p.id));

            responseData = {
                products,
                categories,
                megaMenus,
                sliders,
                announcements,
                popupSettings,
                landingSettings,
                homeSettings,
                stats
            };
            
            // Save to memory cache
            memoryCache.getHomeData = responseData;
            memoryCache.getHomeDataTime = now;
        }

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching home data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── Order Email Notification ──────────────────────────────────────────────────
exports.sendOrderEmailNotification = onDocumentCreated('orders/{orderId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const order = snapshot.data();

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
        }
    });

    const itemsHtml = (order.items || []).map(item => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                <strong>${item.name}</strong><br>
                <small style="color: #666;">Qty: ${item.qty} ${item.size ? '| Size: ' + item.size : ''} ${item.color ? '| Color: ' + item.color : ''}</small>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                ${item.price} AED
            </td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `Speed Gifts <${process.env.MAIL_USER}>`,
        to: process.env.MAIL_TO || 'speedgiftsuae@gmail.com',
        subject: `New Order Received! #${order.orderId || event.params.orderId}`,
        priority: 'high',
        headers: {
            'X-Priority': '1 (Highest)',
            'X-Entity-Ref-ID': order.orderId || event.params.orderId
        },
        html: `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; max-width: 600px;">
                <p>Hi Team,</p>
                <p>A new order has just been placed on Speed Gifts.</p>
                <p><strong>Order ID:</strong> ${order.orderId || event.params.orderId}<br>
                <strong>Customer:</strong> ${order.customer?.name || 'Guest'} (${order.customer?.phone || 'N/A'})<br>
                <strong>Email:</strong> ${order.customer?.email || 'N/A'}<br>
                <strong>Method:</strong> ${order.fulfillmentMethod === 'pickup' ? 'Store Pickup' : 'Delivery'}</p>
                
                ${order.fulfillmentMethod !== 'pickup' ? `
                <p><strong>Shipping Details:</strong><br>
                Emirate: ${order.shipping?.emirate || 'N/A'}<br>
                City: ${order.shipping?.city || 'N/A'}<br>
                Street: ${order.shipping?.street || 'N/A'}<br>
                Building: ${order.shipping?.building || 'N/A'}<br>
                Notes: ${order.shipping?.notes || 'None'}</p>
                ` : ''}

                <p><strong>Order Items:</strong></p>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    ${itemsHtml}
                    <tr>
                        <td style="padding: 8px; font-weight: bold; text-align: right;">Delivery Fee:</td>
                        <td style="padding: 8px; font-weight: bold; text-align: right;">${order.deliveryFee || 0} AED</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold; text-align: right;">Total:</td>
                        <td style="padding: 8px; font-weight: bold; text-align: right;">${order.total || 0} AED</td>
                    </tr>
                </table>
                <p>Best regards,<br>Speed Gifts System</p>
            </div>
        `
    };


    try {
        await transporter.sendMail(mailOptions);
        console.log('Order notification email sent for order:', order.orderId);
    } catch (error) {
        console.error('Error sending order email:', error);
    }

    // Securely Deduct Stock using Admin SDK (bypasses security rules)
    try {
        const appId = 'speed-catalogue';
        const batch = db.batch();
        let hasUpdates = false;

        (order.items || []).forEach(item => {
            if (!item.id) return;
            const pRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('products').doc(item.id);
            batch.update(pRef, { stockCount: admin.firestore.FieldValue.increment(-(item.qty || 1)) });
            hasUpdates = true;
        });

        if (hasUpdates) {
            await batch.commit();
            console.log('Successfully deducted stock for order:', order.orderId);
        }
    } catch (error) {
        console.error('Error securely deducting stock:', error);
    }
});

exports.generateThumbnail = onObjectFinalized({ memory: "512MiB" }, async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name; // e.g. "uploads/product_123.webp"
    const contentType = event.data.contentType;

    // Exit if this is triggered on a file that is not an image
    if (!contentType || !contentType.startsWith('image/')) {
        return console.log('Not an image.');
    }

    // Exit if the image is already a thumbnail to prevent infinite loops
    if (filePath.endsWith('_thumb.webp')) {
        return console.log('Already a Thumbnail.');
    }

    // We only process .webp files since that's what the admin panel uploads
    if (!filePath.endsWith('.webp')) {
        return console.log('Not a .webp image, skipping.');
    }

    console.log(`Processing file: ${filePath}`);

    const bucket = admin.storage().bucket(fileBucket);

    try {
        // Download file into memory
        const [buffer] = await bucket.file(filePath).download();

        // Resize and compress
        const thumbBuffer = await sharp(buffer)
            .resize({ width: 400, withoutEnlargement: true })
            .webp({ quality: 70 })
            .toBuffer();

        // Save the thumb file back to the same folder with the new name
        const thumbPath = filePath.replace('.webp', '_thumb.webp');
        await bucket.file(thumbPath).save(thumbBuffer, {
            metadata: {
                contentType: 'image/webp'
            }
        });

        console.log(`Thumbnail created successfully at ${thumbPath}`);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
    }
});

// Cache Warmer: Runs every 30 minutes to ping home, shop, and category pages to ensure the CDN cache is hot.
exports.warmCache = onSchedule({
    schedule: "every 30 minutes",
    timeZone: "Asia/Dubai",
    timeoutSeconds: 300,
    memory: "256MiB"
}, async (event) => {
    try {
        console.log('Starting Cache Warming...');
        
        let successCount = 0;
        let failCount = 0;

        // 1. Warm up Main Page and Shop Page first
        try {
            console.log('Warming up main home page...');
            const homeRes = await fetch("https://speedgifts.net/");
            if (homeRes.ok) successCount++; else failCount++;
        } catch (e) { failCount++; }

        try {
            console.log('Warming up shop page...');
            const shopRes = await fetch("https://speedgifts.net/shop");
            if (shopRes.ok) successCount++; else failCount++;
        } catch (e) { failCount++; }

        // 2. Fetch products and warm them up
        const prodSnapshot = await db.collection('artifacts').doc('speed-catalogue')
            .collection('public').doc('data')
            .collection('products').get();
        
        if (!prodSnapshot.empty) {
            const productIds = [];
            prodSnapshot.forEach(doc => {
                if (!doc.id.startsWith('_') && !doc.id.startsWith('--')) {
                    productIds.push(doc.id);
                }
            });

            console.log(`Found ${productIds.length} products to warm up.`);
            const BATCH_SIZE = 10;
            for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
                const batch = productIds.slice(i, i + BATCH_SIZE);
                const promises = batch.map(async (id) => {
                    const url = `https://speedgifts.net/product/${encodeURIComponent(id)}`;
                    try {
                        const res = await fetch(url);
                        if (res.ok) successCount++;
                        else failCount++;
                    } catch (e) {
                        failCount++;
                    }
                });
                await Promise.all(promises);
                await new Promise(r => setTimeout(r, 200)); // slight delay
            }
        }

        // 3. Fetch categories and warm them up
        const catSnapshot = await db.collection('artifacts').doc('speed-catalogue')
            .collection('public').doc('data')
            .collection('categories').get();

        if (catSnapshot.empty) {
            console.log('No categories found for cache warming.');
        } else {
            const categoryIds = [];
            catSnapshot.forEach(doc => {
                categoryIds.push(doc.id);
            });

            console.log(`Found ${categoryIds.length} categories to warm up.`);

            for (const catId of categoryIds) {
                const url = `https://speedgifts.net/shop?c=${encodeURIComponent(catId)}`;
                try {
                    const res = await fetch(url);
                    if (res.ok) successCount++;
                    else failCount++;
                } catch (e) {
                    failCount++;
                }
                // Optional: slight delay
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.log(`Cache warming complete. Success: ${successCount}, Failed: ${failCount}`);
    } catch (error) {
        console.error('Error during cache warming:', error);
    }
});
// Force restart
// Force restart 2
// Force restart 3
// Force restart 4

exports.updateGlobalSync = onDocumentWritten('artifacts/{appId}/public/data/{collectionId}/{docId}', async (event) => {
    const { collectionId, docId, appId } = event.params;
    if (collectionId !== 'products' && collectionId !== 'categories' && collectionId !== 'mega_menus') return;
    if (docId.startsWith('_') || docId.startsWith('--')) return;
    const db = admin.firestore();
    await db.doc(`artifacts/${appId}/public/data/config/sync_status`).set({
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
});
