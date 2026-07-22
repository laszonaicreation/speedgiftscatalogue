const https = require('https');
https.get('https://speedgifts.net/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    let count = 0;
    const regex = /src=['"]([^'"]*)['"]/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      if (match[1] === '' || match[1] === 'null' || match[1] === 'undefined' || match[1].includes('undefined')) {
         console.log('Bad src:', match[1]);
         count++;
      }
    }
    console.log('Total bad srcs:', count);
  });
});
