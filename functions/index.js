const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

exports.renderProduct = onRequest(async (req, res) => {
    try {
        // The frontend sometimes uses ?id=... and sometimes ?p=...
        let productId = req.query.id || req.query.p;

        // Support shorter URL format: /p/PRODUCT_ID
        if (!productId && req.path.startsWith('/p/')) {
            const parts = req.path.split('/');
            productId = parts[2]; // ['', 'p', 'PRODUCT_ID']
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
                let imageUrl = product.img || (product.images && product.images[0]) || 'https://res.cloudinary.com/dxkcvm2yh/image/upload/v1769084529/speed_logo_5552_zuu2n7.png';
                
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
