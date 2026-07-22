const fs = require('fs');
const data = fs.readFileSync('index.html', 'utf8');
const start = data.indexOf('id="home-view-template"');
console.log(data.substring(start, start + 300));
