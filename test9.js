const https = require('https');
https.get('https://speed-catalogue.web.app/index-static.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Contains app.min.js?v=1784654026884?', data.includes('app.min.js?v=1784654026884'));
  });
});
