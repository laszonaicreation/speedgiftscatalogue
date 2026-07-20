const fs = require('fs');
const path = require('path');

const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html') && !f.endsWith('-static.html'));

for (const file of htmlFiles) {
    let content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    
    // Regex to match the existing initial-loader style and div
    const loaderRegex = /<style>\s*#initial-loader\s*\{[\s\S]*?<\/style>\s*<div id="initial-loader">[\s\S]*?<\/div>/;
    
    if (loaderRegex.test(content)) {
        const newLoaderStr = `<style>
    #initial-loader {
        all: initial;
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: #ffffff;
        z-index: 9999999;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        transition: opacity 0.2s ease-out;
        box-sizing: border-box;
    }
    #initial-loader-spinner {
        display: flex; flex-direction: column; align-items: center;
        opacity: 0; transition: opacity 0.3s ease-in;
    }
    #initial-loader svg {
        all: initial;
        width: 42px; height: 42px;
        animation: spin 0.8s linear infinite;
        stroke: #6b7280;
        display: block;
        box-sizing: border-box;
    }
    @keyframes spin { 100% { transform: rotate(360deg); } }
</style>
<div id="initial-loader">
    <div id="initial-loader-spinner">
        <svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="90, 150" stroke-dashoffset="0"></circle></svg>
    </div>
</div>
<script>
    (function(){
        var st = setTimeout(function(){
            var el = document.getElementById('initial-loader-spinner');
            if(el) el.style.opacity = '1';
        }, 300);
        window.__loaderTimeout = st;
    })();
</script>`;
        content = content.replace(loaderRegex, newLoaderStr);
        fs.writeFileSync(path.join(__dirname, file), content, 'utf8');
        console.log(`Updated initial-loader in ${file}`);
    }
}

// Now update shared-shell.js
const sharedShellPath = path.join(__dirname, 'shared-shell.js');
let shellContent = fs.readFileSync(sharedShellPath, 'utf8');

const oldGlobalRegex = /window\.showGlobalLoading = \(\) => \{[\s\S]*?document\.body\.appendChild\(overlay\);\s*\};/;

const newGlobalLoaderStr = `window.showGlobalLoading = () => {
    if(document.getElementById('global-loader')) return;
    const overlay = document.createElement('div');
    overlay.id = 'global-loader';
    overlay.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.4);z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:opacity 0.2s;box-sizing:border-box;';
    
    overlay.innerHTML = '<svg viewBox="0 0 50 50" style="all:initial;width:42px;height:42px;animation:custom-spin 0.8s linear infinite;stroke:#6b7280;display:block;box-sizing:border-box;"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="90, 150" stroke-dashoffset="0"></circle></svg>';
    
    if (!document.getElementById('custom-spin-style')) {
        const style = document.createElement('style');
        style.id = 'custom-spin-style';
        style.innerHTML = '@keyframes custom-spin { 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
};`;

if (oldGlobalRegex.test(shellContent)) {
    shellContent = shellContent.replace(oldGlobalRegex, newGlobalLoaderStr);
    fs.writeFileSync(sharedShellPath, shellContent, 'utf8');
    console.log('Updated global-loader in shared-shell.js');
}
