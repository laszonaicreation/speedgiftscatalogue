const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let c = 0;
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    if (!content.includes('firebasestorage.googleapis.com') && content.includes('<link rel="preconnect" href="https://res.cloudinary.com">')) {
        content = content.replace('<link rel="preconnect" href="https://res.cloudinary.com">', '<link rel="preconnect" href="https://res.cloudinary.com"><link rel="preconnect" href="https://firebasestorage.googleapis.com">');
        fs.writeFileSync(f, content);
        c++;
    }
});
console.log('Updated ' + c + ' HTML files');
