const fs = require('fs');
const data = fs.readFileSync('index.html', 'utf8');
console.log('app index:', data.indexOf('id="app"'));
console.log('spotlight index:', data.indexOf('id="spotlight-section"'));
