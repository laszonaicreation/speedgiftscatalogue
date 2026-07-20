const fs = require('fs');
const path = require('path');

const jsFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));

for (const file of jsFiles) {
    const filePath = path.join(__dirname, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace import * from 'shared-shell.js?v=X' with ?v=10
    const regex = /shared-shell\.js\?v=\d+/g;
    
    if (regex.test(content)) {
        content = content.replace(regex, 'shared-shell.js?v=' + Date.now());
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated shared-shell.js import in ${file}`);
    }
}
