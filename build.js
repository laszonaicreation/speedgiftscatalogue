const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir);

// ── CLI flags ─────────────────────────────────────────────────────────────────
// Usage:
//   node build.js          → incremental (only changed files)
//   node build.js --force  → rebuild everything
const FORCE = process.argv.includes('--force') || process.argv.includes('-f');
const BUILD_VERSION = Date.now();

const jsFiles   = files.filter(f => f.endsWith('.js')  && !f.endsWith('.min.js')  && f !== 'build.js');
const cssFiles  = files.filter(f => f.endsWith('.css')  && !f.endsWith('.min.css'));
const htmlFiles = files.filter(f => f.endsWith('.html') && f !== 'index.dev.html');

console.log(`\n========================================`);
console.log(`  Speed Gifts - Smart Incremental Build`);
console.log(`  ${FORCE ? '⚠️  FORCE MODE (rebuilding all)' : '⚡ Incremental (skipping unchanged files)'}`);
console.log(`========================================\n`);

// ── Helper: does source need rebuilding? ─────────────────────────────────────
function needsRebuild(srcFile, outFile) {
    if (FORCE) return true;
    const outPath = path.join(dir, outFile);
    if (!fs.existsSync(outPath)) return true;
    const srcMtime = fs.statSync(path.join(dir, srcFile)).mtimeMs;
    const outMtime = fs.statSync(outPath).mtimeMs;
    return srcMtime > outMtime;
}

let successCount = 0;
let skippedCount = 0;
let failCount    = 0;

// ── JS Minification ───────────────────────────────────────────────────────────
console.log(`JS Files (${jsFiles.length} total):`);
for (const file of jsFiles) {
    const minFile = file.replace(/\.js$/, '.min.js');
    if (!needsRebuild(file, minFile)) {
        console.log(`  ⏭  Skipping ${file} (unchanged)`);
        skippedCount++;
        continue;
    }
    console.log(`  🔨 Minifying ${file} -> ${minFile}...`);
    try {
        execSync(
            `npx terser ${file} --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output ${minFile}`,
            { stdio: 'inherit' }
        );
        const minPath = path.join(dir, minFile);
        if (fs.existsSync(minPath)) {
            let content = fs.readFileSync(minPath, 'utf8');
            const newContent = content.replace(/(['"])(\.\/[^'"]+)\.js(\?[^'"]*)?['"]/g, (match, quote, pathBase, qs) => {
                if (pathBase.endsWith('.min')) return match;
                return `${quote}${pathBase}.min.js?v=${BUILD_VERSION}${quote}`;
            });
            if (content !== newContent) {
                fs.writeFileSync(minPath, newContent, 'utf8');
                console.log(`    -> Automatically updated internal imports -> .min.js with cachebuster`);
            }
        }
        successCount++;
    } catch (e) {
        console.error(`  => Failed to minify ${file}:`, e.message);
        failCount++;
    }
}

// ── CSS Minification ──────────────────────────────────────────────────────────
console.log(`\nCSS Files (${cssFiles.length} total):`);
for (const file of cssFiles) {
    const minFile = file.replace(/\.css$/, '.min.css');
    if (!needsRebuild(file, minFile)) {
        console.log(`  ⏭  Skipping ${file} (unchanged)`);
        skippedCount++;
        continue;
    }
    console.log(`  🔨 Minifying ${file} -> ${minFile}...`);
    try {
        execSync(`npx clean-css-cli -o ${minFile} ${file}`, { stdio: 'inherit' });
        successCount++;
    } catch (e) {
        console.error(`  => Failed to minify ${file}:`, e.message);
        failCount++;
    }
}

// ── HTML Cache-buster Update (only if something was rebuilt) ─────────────────
if (successCount > 0) {
    console.log(`\nUpdating HTML files to use .min.css and .min.js with cache-busters...`);
    const ts = BUILD_VERSION;
    for (const file of htmlFiles) {
        try {
            const filePath = path.join(dir, file);
            if (!fs.existsSync(filePath)) continue;
            let content = fs.readFileSync(filePath, 'utf8');

            let newContent = content;

            // Handle inline CSS
            const tailwindCss = fs.readFileSync(path.join(dir, 'tailwind-compiled.min.css'), 'utf8');
            const styleCss = fs.readFileSync(path.join(dir, 'style.min.css'), 'utf8');
            let productDetailCss = '';
            try { productDetailCss = fs.readFileSync(path.join(dir, 'product-detail.min.css'), 'utf8'); } catch(e){}
            newContent = newContent.replace(/<style data-inline-src="tailwind-compiled\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="tailwind-compiled.min.css">${tailwindCss}</style>`);
            newContent = newContent.replace(/<style data-inline-src="style\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="style.min.css">${styleCss}</style>`);
            if (productDetailCss) {
                newContent = newContent.replace(/<style data-inline-src="product-detail\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="product-detail.min.css">${productDetailCss}</style>`);
            }

            newContent = newContent.replace(/href=['"]([^'"]+\.css)(\?[^'"]*)?['"]/gi, (match, pathStr) => {
                if (pathStr.includes('http')) return match;
                if (pathStr.endsWith('.min.css')) return `href="${pathStr}?v=${ts}"`;
                return `href="${pathStr.replace(/\.css$/, '.min.css')}?v=${ts}"`;
            });

            newContent = newContent.replace(/(src|href)=['"]([^'"]+\.js)(\?[^'"]*)?['"]/gi, (match, attr, pathStr) => {
                if (pathStr.includes('http')) return match;
                if (pathStr.endsWith('.min.js')) return `${attr}="${pathStr}?v=${ts}"`;
                return `${attr}="${pathStr.replace(/\.js$/, '.min.js')}?v=${ts}"`;
            });

            if (content !== newContent) {
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log(`  -> Updated CSS/JS links in ${file}`);
            }
        } catch (e) {
            console.error(`  => Failed to update HTML ${file}:`, e.message);
        }
    }

    // Special case: index.dev.html
    try {
        const devHtml = path.join(dir, 'index.dev.html');
        if (fs.existsSync(devHtml)) {
            let content = fs.readFileSync(devHtml, 'utf8');
            let newContent = content;

            // Handle inline CSS
            const tailwindCss = fs.readFileSync(path.join(dir, 'tailwind-compiled.min.css'), 'utf8');
            const styleCss = fs.readFileSync(path.join(dir, 'style.min.css'), 'utf8');
            let productDetailCss = '';
            try { productDetailCss = fs.readFileSync(path.join(dir, 'product-detail.min.css'), 'utf8'); } catch(e){}
            newContent = newContent.replace(/<style data-inline-src="tailwind-compiled\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="tailwind-compiled.min.css">${tailwindCss}</style>`);
            newContent = newContent.replace(/<style data-inline-src="style\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="style.min.css">${styleCss}</style>`);
            if (productDetailCss) {
                newContent = newContent.replace(/<style data-inline-src="product-detail\.min\.css">[\s\S]*?<\/style>/gi, `<style data-inline-src="product-detail.min.css">${productDetailCss}</style>`);
            }

            newContent = newContent.replace(/href=['"]([^'"]+\.css)(\?[^'"]*)?['"]/gi, (match, pathStr) => {
                if (pathStr.includes('http')) return match;
                if (pathStr.endsWith('.min.css')) return `href="${pathStr}?v=${BUILD_VERSION}"`;
                return `href="${pathStr.replace(/\.css$/, '.min.css')}?v=${BUILD_VERSION}"`;
            });
            newContent = newContent.replace(/(src|href)=['"]([^'"]+\.js)(\?[^'"]*)?['"]/gi, (match, attr, pathStr) => {
                if (pathStr.includes('http')) return match;
                if (pathStr.endsWith('.min.js')) return `${attr}="${pathStr}?v=${BUILD_VERSION}"`;
                return `${attr}="${pathStr.replace(/\.js$/, '.min.js')}?v=${BUILD_VERSION}"`;
            });
            if (content !== newContent) fs.writeFileSync(devHtml, newContent, 'utf8');
        }
    } catch (e) {}
} else {
    console.log(`\n⏭  No HTML update needed (no files were rebuilt).`);
}

// ── Summary ───────────────────────────────────────────────────────────────────// 🛠️ Summary 🛠️
console.log(`\n========================================`);
console.log(`Build complete!`);
console.log(`  🚀 Rebuilt : ${successCount} files`);
console.log(`  ⏭️  Skipped : ${skippedCount} files (already up-to-date)`);
if (failCount > 0) {
    console.log(`  ❌ Failed  : ${failCount} files`);
    process.exit(1);
} else {
    console.log(`  All operations completed successfully.`);
}

console.log(`\nGenerating -static.html copies for Cloud Functions...`);
['index.html', 'product-detail.html', '/shop'].forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file.replace('.html', '-static.html'), content, 'utf8');
        console.log(`  -> Copied ${file} to ${file.replace('.html', '-static.html')}`);
    }
});

console.log(`========================================\n`);
