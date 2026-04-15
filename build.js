const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir);

const jsFiles = files.filter(f => f.endsWith('.js') && !f.endsWith('.min.js') && f !== 'build.js');

console.log(`\n========================================`);
console.log(`  Speed Gifts - Smart JS Minification`);
console.log(`========================================\n`);
console.log(`Found ${jsFiles.length} JS files to minify.\n`);

let successCount = 0;
let failCount = 0;

for (const file of jsFiles) {
    const minFile = file.replace(/\.js$/, '.min.js');
    console.log(`Minifying ${file} -> ${minFile}...`);
    try {
        // Run terser via npx
        execSync(`npx terser ${file} --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output ${minFile}`, { stdio: 'inherit' });
        
        // Read the newly created minified file
        const minPath = path.join(dir, minFile);
        if (fs.existsSync(minPath)) {
            let content = fs.readFileSync(minPath, 'utf8');
            
            // Rewrite imports to point to their .min.js counterparts
            const newContent = content.replace(/(["'])(\.\/[^"']+)\.js(\?[^"']*)?\1/g, (match, quote, pathBase, qs) => {
                if (pathBase.endsWith('.min')) return match; // already .min.js
                return `${quote}${pathBase}.min.js${qs || ''}${quote}`;
            });
            
            if (content !== newContent) {
                fs.writeFileSync(minPath, newContent, 'utf8');
                console.log(`  -> Automatically updated internal imports -> .min.js`);
            }
        }
        successCount++;
    } catch (e) {
        console.error(`  => Failed to minify ${file}:`, e.message);
        failCount++;
    }
}

console.log(`\n========================================`);
console.log(`Minification complete!`);
console.log(`Successfully generated: ${successCount} files`);
if (failCount > 0) {
    console.log(`Failed files: ${failCount}`);
    process.exit(1);
} else {
    console.log(`All operations completely successfully.`);
}
console.log(`========================================\n`);
