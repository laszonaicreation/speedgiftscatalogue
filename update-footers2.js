const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let updated = 0;

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Update Shipping Info to Shipping Policy
    let modified = content.replace(
        /<li><a href="\/shipping\.html">Shipping Info<\/a><\/li>/g,
        '<li><a href="/shipping.html">Shipping Policy</a></li>'
    );

    if (content !== modified) {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`✅ Updated ${file}`);
        updated++;
    }
}

console.log(`Done. Updated ${updated} files.`);
