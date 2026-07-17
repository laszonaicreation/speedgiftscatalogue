const fs = require('fs');
let content = fs.readFileSync('product-detail-renderer.js', 'utf8');

const startStr = '<div id="recommendations-section-container"></div>';
const endStr = '</div>`;\n\n    window.scrollTo({';

const startIdx = content.indexOf(startStr) + startStr.length;
const endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    content = content.substring(0, startIdx) + '\n' + content.substring(endIdx);
    fs.writeFileSync('product-detail-renderer.js', content);
    console.log("Cleaned up remaining loop trash!");
} else {
    console.log("Could not find bounds.");
}
