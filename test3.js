const fs = require('fs');
const data = fs.readFileSync('index.html', 'utf8');
const appStart = data.indexOf('<div id="app"');
const appEndMatch = data.substring(appStart).match(/<\/div>/); // NOT ACCURATE for nested divs, but let's see.

// Let's just find the text between <div id="app" and <div id="footer">
const footerStart = data.indexOf('<footer');
const inApp = data.substring(appStart, footerStart);
console.log('Spotlight in app region:', inApp.includes('spotlight-section'));
