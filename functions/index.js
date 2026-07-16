const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const sharp = require('sharp');

admin.initializeApp();
const db = admin.firestore();

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
                } else if (imageUrl.includes('firebasestorage.googleapis.com') && imageUrl.includes('.webp?')) {
                    // Firebase Storage: preload _thumb.webp for fast LCP (matches what JS renders first)
                    // JS shows thumb instantly, then swaps to full quality in background
                    lcpImageUrl = imageUrl.replace('.webp?', '_thumb.webp?');
                    // WhatsApp og:image - keep as jpg
                    imageUrl = imageUrl.replace('.webp', '.jpg');
                } else if (imageUrl.includes('.webp')) {
                    imageUrl = imageUrl.replace('.webp', '.jpg');
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
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.status(200).send(htmlString);
    } catch (error) {
        console.error('Error rendering product page:', error);
        res.status(500).send('Internal Server Error');
    }
});

exports.getHomeData = onRequest({ cors: true }, async (req, res) => {
    try {
        const appId = req.query.appId || 'speed-catalogue';
        const today = new Date().toISOString().split('T')[0];
        const dataRef = db.collection('artifacts').doc(appId).collection('public').doc('data');

        const prodCol = dataRef.collection('products');
        const catCol = dataRef.collection('categories');
        const megaCol = dataRef.collection('mega_menus');
        const sliderCol = dataRef.collection('sliders');
        const popupCol = dataRef.collection('popup_settings');
        const dailyStatsRef = dataRef.collection('daily_stats').doc(today);

        const configDocIds = ['_announcements_', '_landing_settings_', '_home_settings_', '_ad_stats_', '--global-stats--', '_hero_config_'];
        
        const [configSnap, featuredSnap, fallbackSnap, catSnap, megaSnap, sliderSnap, popupSnap, todaySnap] = await Promise.all([
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

        const responseData = {
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

        res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
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
