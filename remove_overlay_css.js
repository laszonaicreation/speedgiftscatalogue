const fs = require('fs');
const path = require('path');

const styleCssPath = path.join(__dirname, 'style.css');
let styleCss = fs.readFileSync(styleCssPath, 'utf8');

// Remove the CSS rules for page-transition-overlay
styleCss = styleCss.replace(/#page-transition-overlay\{.*?\}/g, '');
styleCss = styleCss.replace(/#page-transition-overlay\.fade-out\{.*?\}/g, '');

fs.writeFileSync(styleCssPath, styleCss, 'utf8');
console.log('Removed page-transition-overlay from style.css');
