const fs = require('fs');
const data = fs.readFileSync('index.html', 'utf8');
const start = data.indexOf('id="home-view-template"');
const end = data.indexOf('</template>', start);
const tmpl = data.substring(start, end);
console.log('Contains spotlight-section?:', tmpl.includes('spotlight-section'));
