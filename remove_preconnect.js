const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace('<link rel="preconnect" href="https://res.cloudinary.com">', '');
    content = content.replace('<link rel="preconnect" href="https://api.cloudinary.com">', '');
    fs.writeFileSync(f, content);
});
console.log('Removed Cloudinary preconnect from HTML files');
