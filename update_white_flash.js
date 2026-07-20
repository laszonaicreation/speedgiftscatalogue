const fs = require('fs');
const path = require('path');

const newScript = `<script>
    // Hide initial loader when JS is ready and content is rendered
    const hideInitialLoader = () => {
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 300);
        }
    };
    
    // Fallback: maximum 5 seconds
    const fallbackTimer = setTimeout(hideInitialLoader, 5000);

    // Poll for content rendering
    const pollTimer = setInterval(() => {
        const hasContent = document.querySelector('.product-card:not(.skeleton-card)') || 
                           (document.querySelector('.category-item') && !document.querySelector('.product-card.skeleton-card')) || 
                           document.querySelector('.admin-container') ||
                           document.querySelector('.cart-item') ||
                           document.querySelector('.auth-container');
                           
        if (hasContent) {
            clearInterval(pollTimer);
            clearTimeout(fallbackTimer);
            hideInitialLoader();
        }
    }, 100);
</script>`;

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html') && !f.endsWith('-static.html'));

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Replace the old script block inside the INITIAL LOADER section
    const oldScriptRegex = /<script>\s*\/\/\s*Hide initial loader when JS is ready[\s\S]*?<\/script>/;
    if (oldScriptRegex.test(content)) {
        content = content.replace(oldScriptRegex, newScript);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        console.log('Updated Script in:', file);
    }
}
console.log('Done updating scripts!');
