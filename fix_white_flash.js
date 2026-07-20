const fs = require('fs');
const path = require('path');

const loaderHtml = `
<!-- INITIAL LOADER (Prevents White Flash) -->
<style>
    #initial-loader {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(255, 255, 255, 0.95);
        z-index: 9999999;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        transition: opacity 0.3s;
    }
    #initial-loader svg {
        width: 30px; height: 30px;
        animation: spin 1s linear infinite;
        stroke: #9ca3af;
    }
    #initial-loader p {
        margin-top: 10px; font-weight: 500; font-size: 11px;
        color: #9ca3af; font-family: 'Outfit', sans-serif;
        letter-spacing: 0.15em; text-transform: uppercase;
    }
    @keyframes spin { 100% { transform: rotate(360deg); } }
</style>
<div id="initial-loader">
    <svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="80" stroke-dashoffset="60"></circle></svg>
    <p>Loading</p>
</div>
<script>
    // Hide initial loader when JS is ready
    window.addEventListener('load', () => {
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 300);
        }
    });
</script>
<!-- /INITIAL LOADER -->
`;

const viewTransitionMeta = '\n<meta name="view-transition" content="same-origin">\n';

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html') && !f.endsWith('-static.html'));

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Add view-transition if not present
    if (!content.includes('view-transition')) {
        content = content.replace('</head>', `${viewTransitionMeta}</head>`);
        changed = true;
    }

    // Add initial loader right after <body>
    if (!content.includes('id="initial-loader"')) {
        content = content.replace(/<body[^>]*>/i, (match) => `${match}\n${loaderHtml}`);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        console.log('Updated:', file);
    }
}
console.log('Done!');
