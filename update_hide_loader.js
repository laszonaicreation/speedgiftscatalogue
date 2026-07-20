const fs = require('fs');
const path = require('path');

const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html') && !f.endsWith('-static.html'));

for (const file of htmlFiles) {
    let content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    
    // Add clearTimeout if not already there
    if (content.includes('const hideInitialLoader = () => {') && !content.includes('window.__loaderTimeout')) {
        content = content.replace(
            'const hideInitialLoader = () => {', 
            'const hideInitialLoader = () => {\n          if (window.__loaderTimeout) clearTimeout(window.__loaderTimeout);'
        );
        fs.writeFileSync(path.join(__dirname, file), content, 'utf8');
        console.log(`Updated hideInitialLoader in ${file}`);
    }
}
