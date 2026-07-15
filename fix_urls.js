const fs = require('fs');
const path = require('path');

const files = [
    'shop.js', 'product-detail-page.js', 'landing-logic.js', 
    'favourites-page.js', 'checkout.js', 'catalogue.js', 
    'cart-page.js', 'app-admin.js', 'admin-page.js'
];

for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.log('Not found:', file);
        continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Ensure we don't inject twice
    if (content.includes('firebasestorage.googleapis.com') && file !== 'app.js') {
        if (content.includes('_thumb.webp?')) {
            console.log('Already fixed:', file);
            continue;
        }
    }
    
    // Find "function getOptimizedUrl(url, xyz) {"
    let replaced = false;
    content = content.replace(/(function\s+getOptimizedUrl\s*\(\s*url\s*(?:,\s*([a-zA-Z0-9_]+)\s*(?:=\s*\d+)?\s*)?\)\s*\{)/, (match, signature, paramName) => {
        replaced = true;
        let widthVar = paramName || 'undefined';
        return signature + `
    if (url && typeof url === 'string' && url.includes('firebasestorage.googleapis.com')) {
        if (${widthVar} && ${widthVar} <= 600 && url.includes('.webp?')) {
            return url.replace('.webp?', '_thumb.webp?');
        }
        return url;
    }
`;
    });

    if (replaced) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', file);
    } else {
        console.log('Could not match signature in', file);
    }
}
