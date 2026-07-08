const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let updated = 0;

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Update Refund Policy to Return & Refund Policy in the footer
    let modified = content.replace(
        /<li><a href="\/refund\.html">Refund Policy<\/a><\/li>/g,
        '<li><a href="/refund.html">Return & Refund Policy</a></li>'
    );

    if (content !== modified) {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`✅ Updated ${file}`);
        updated++;
    }
}

console.log(`Done. Updated ${updated} files.`);
