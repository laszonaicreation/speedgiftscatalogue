const fs = require('fs');

async function run() {
    console.log("Fetching products for Google Merchant Center feed...");
    const res = await fetch("https://firestore.googleapis.com/v1/projects/speed-catalogue/databases/(default)/documents/artifacts/speed-catalogue/public/data/products?pageSize=1000");
    const data = await res.json();
    
    if(!data.documents) {
        console.error("No products found");
        return;
    }
    console.log("Fetching categories for product mapping...");
    const catRes = await fetch("https://firestore.googleapis.com/v1/projects/speed-catalogue/databases/(default)/documents/artifacts/speed-catalogue/public/data/categories?pageSize=100");
    const catData = await catRes.json();
    const catMap = {};
    if (catData.documents) {
        catData.documents.forEach(doc => {
            const id = doc.name.split('/').pop();
            const fields = doc.fields || {};
            catMap[id] = fields.name?.stringValue || 'Gifts';
        });
    }

    const products = data.documents.map(doc => {
        const id = doc.name.split('/').pop();
        const fields = doc.fields || {};
        return {
            id,
            name: fields.name?.stringValue || '',
            desc: fields.desc?.stringValue || fields.name?.stringValue || '',
            price: fields.price?.stringValue || '0',
            img: fields.img?.stringValue || '',
            inStock: fields.inStock?.booleanValue !== false,
            catId: fields.catId?.stringValue || ''
        };
    });
    
    console.log(`Fetched ${products.length} products`);
    
    const STORE_URL = "https://speedgifts.net";
    
    let xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Speed Gifts</title>
    <link>${STORE_URL}</link>
    <description>Premium Personalized Gifts in Abu Dhabi</description>
`;
    
    products.filter(p => p.id && p.name && p.price && p.img).forEach(p => {
        const price = parseFloat(p.price).toFixed(2);
        const availability = p.inStock ? 'in_stock' : 'out_of_stock';
        // HTML encode special characters
        const safeName = p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        const safeDesc = p.desc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        const safeImg = p.img.replace(/&/g, '&amp;');
        const safeProductType = (catMap[p.catId] || 'Gifts').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

        xml += `    <item>
      <g:id>${p.id}</g:id>
      <g:title>${safeName}</g:title>
      <g:description>${safeDesc}</g:description>
      <g:link>${STORE_URL}/product-detail.html?p=${p.id}</g:link>
      <g:image_link>${safeImg}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${price} AED</g:price>
      <g:brand>Speed Gifts</g:brand>
      <g:product_type>${safeProductType}</g:product_type>
      <g:identifier_exists>no</g:identifier_exists>
    </item>
`;
    });
    
    xml += `  </channel>\n</rss>`;
    
    fs.writeFileSync('feed.xml', xml);
    console.log("Updated feed.xml for Google Merchant Center");
}
run();
