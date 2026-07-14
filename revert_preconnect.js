const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/<link rel="dns-prefetch" href="https:\/\/res\.cloudinary\.com">/g, '<link rel="preconnect" href="https://res.cloudinary.com">');
  content = content.replace(/<link rel="dns-prefetch" href="https:\/\/firestore\.googleapis\.com">/g, '<link rel="preconnect" href="https://firestore.googleapis.com">');
  content = content.replace(/<link rel="dns-prefetch" href="https:\/\/identitytoolkit\.googleapis\.com">/g, '<link rel="preconnect" href="https://identitytoolkit.googleapis.com">');
  fs.writeFileSync(file, content);
}
console.log("Done reverting preconnects");
