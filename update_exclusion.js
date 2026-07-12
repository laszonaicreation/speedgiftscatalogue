const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/Administrator/Desktop/speedcataloguetest';

function processDir(d) {
    const files = fs.readdirSync(d);
    for (const file of files) {
        const fullPath = path.join(d, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') processDir(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // Match an array containing _home_settings_ and append _hero_config_ if not present
            content = content.replace(/\[([^\]]*?_home_settings_[^\]]*?)\]/g, (match, p1) => {
                if (match.includes('_hero_config_')) return match;
                const useDouble = match.includes('"_home_settings_"');
                const addition = useDouble ? ',"_hero_config_"' : ", '_hero_config_'";
                return '[' + p1 + addition + ']';
            });
            
            if (content !== original) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Updated', file);
            }
        }
    }
}
processDir(dir);
