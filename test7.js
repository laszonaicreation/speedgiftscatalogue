const fs = require('fs');
const data = fs.readFileSync('index.html', 'utf8');
const spotlightIndex = data.indexOf('id="spotlight-section"');
const start = Math.max(0, spotlightIndex - 150);
console.log(data.substring(start, spotlightIndex + 150));
