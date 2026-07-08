const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let updatedCount = 0;

for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('favicon.jpg')) {
        content = content.replace(/<link rel="icon" type="image\/jpeg" href="favicon\.jpg">/gi, `<link rel="icon" type="image/png" href="favicon.png">`);
        fs.writeFileSync(filePath, content, 'utf8');
        updatedCount++;
    }
}

console.log(`Updated ${updatedCount} HTML files to use favicon.png.`);
