const fs = require('fs');
const data = fs.readFileSync('index.html', 'utf8');
console.log('shop:', data.indexOf('id="shop-section"'));
console.log('spotlight:', data.indexOf('id="spotlight-section"'));
