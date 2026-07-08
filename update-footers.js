const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let updated = 0;

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Update the Customer Care links
    let modified = content;
    
    // Some files might have '&amp;' instead of '&'
    if (modified.includes('Shipping &amp; Returns')) {
        modified = modified.replace(
            /<li><a href="\/shipping\.html">Shipping &amp; Returns<\/a><\/li>/g,
            '<li><a href="/shipping.html">Shipping Info</a></li>\n                        <li><a href="/refund.html">Refund Policy</a></li>'
        );
    } else if (modified.includes('Shipping & Returns')) {
        modified = modified.replace(
            /<li><a href="\/shipping\.html">Shipping & Returns<\/a><\/li>/g,
            '<li><a href="/shipping.html">Shipping Info</a></li>\n                        <li><a href="/refund.html">Refund Policy</a></li>'
        );
    }

    // 2. Add the Payment Icons in sg-bottom
    const paymentHTML = `                <div style="display:flex;gap:10px;align-items:center;color:#6b7280;margin:1rem 0;">
                    <i class="fa-brands fa-cc-visa text-2xl hover:text-white transition-colors"></i>
                    <i class="fa-brands fa-cc-mastercard text-2xl hover:text-white transition-colors"></i>
                    <i class="fa-brands fa-apple-pay text-3xl hover:text-white transition-colors"></i>
                    <span style="font-size:0.7rem;font-weight:bold;padding:2px 6px;border:1px solid #374151;border-radius:4px;letter-spacing:1px;cursor:default;" title="Cash on Delivery Accepted">COD</span>
                </div>`;
    
    // Check if it already has payment icons to avoid duplicates
    if (!modified.includes('fa-cc-visa') && modified.includes('All Rights Reserved.')) {
        modified = modified.replace(
            /(<span>&copy;.*?Speed Gifts\. All Rights Reserved\.<\/span>)/i,
            `$1\n${paymentHTML}`
        );
    }

    if (content !== modified) {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`✅ Updated ${file}`);
        updated++;
    }
}

console.log(`Done. Updated ${updated} files.`);
