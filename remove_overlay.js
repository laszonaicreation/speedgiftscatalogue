const fs = require('fs');
const path = require('path');

const shopHtmlPath = path.join(__dirname, 'shop.html');
let shopHtml = fs.readFileSync(shopHtmlPath, 'utf8');

// Remove the div
shopHtml = shopHtml.replace(/<div id="page-transition-overlay".*?<\/div>\s*/g, '');

// Remove the script block
const scriptRegex = /<script>\s*\/\/ Remove transition veil quickly after first paint\.\s*window\.addEventListener\('load', function \(\) \{[\s\S]*?var overlay = document\.getElementById\('page-transition-overlay'\);[\s\S]*?\}\);\s*<\/script>\s*/g;
shopHtml = shopHtml.replace(scriptRegex, '');

fs.writeFileSync(shopHtmlPath, shopHtml, 'utf8');
console.log('Removed page-transition-overlay from shop.html');
