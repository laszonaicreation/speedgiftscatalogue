const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lh-report.json', 'utf8'));

const lcp = data.audits['largest-contentful-paint'];
console.log('largest-contentful-paint:', JSON.stringify(lcp, null, 2).substring(0, 500));

const lcpInsight = data.audits['lcp-breakdown-insight'];
console.log('\nlcp-breakdown-insight:', JSON.stringify(lcpInsight, null, 2));
