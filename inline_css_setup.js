const fs = require('fs');
const glob = require('fs').readdirSync;

const cssFiles = {
    'tailwind-compiled.min.css': fs.readFileSync('tailwind-compiled.min.css', 'utf8'),
    'style.min.css': fs.readFileSync('style.min.css', 'utf8')
};

const htmlFiles = glob('.').filter(f => f.endsWith('.html'));

htmlFiles.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    
    // Replace traditional link tags with inline style blocks
    content = content.replace(/<link rel="stylesheet" href="tailwind-compiled\.min\.css[^"]*">/gi, `<style data-inline-src="tailwind-compiled.min.css">${cssFiles['tailwind-compiled.min.css']}</style>`);
    content = content.replace(/<link rel="stylesheet" href="style\.min\.css[^"]*">/gi, `<style data-inline-src="style.min.css">${cssFiles['style.min.css']}</style>`);
    
    // If it was already converted in a previous run, update the contents
    content = content.replace(/<style data-inline-src="tailwind-compiled\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="tailwind-compiled.min.css">${cssFiles['tailwind-compiled.min.css']}</style>`);
    content = content.replace(/<style data-inline-src="style\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="style.min.css">${cssFiles['style.min.css']}</style>`);

    fs.writeFileSync(f, content);
    console.log('Inlined CSS in ' + f);
});
