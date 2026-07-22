const https = require('https');
https.get('https://speedgifts.net/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Contains spotlight-section?', data.includes('id="spotlight-section"'));
    console.log('Contains app.min.js?v=1784654026884?', data.includes('app.min.js?v=1784654026884'));
  });
});
