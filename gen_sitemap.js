const fs = require('fs');

async function run() {
    console.log("Fetching products...");
    const res = await fetch("https://firestore.googleapis.com/v1/projects/speed-catalogue/databases/(default)/documents/artifacts/speed-catalogue/public/data/products?pageSize=1000");
    const data = await res.json();
    
    if(!data.documents) {
        console.error("No products found");
        return;
    }
    
    const products = data.documents.map(doc => {
        const id = doc.name.split('/').pop();
        const fields = doc.fields || {};
        return {
            id,
            name: fields.name?.stringValue || '',
            updatedAt: fields.updatedAt?.integerValue || null
        };
    });
    
    console.log(`Fetched ${products.length} products`);
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    const STORE_URL = 'https://speedgifts.net';
    const staticPages = ['index.html', 'shop.html', 'about.html', 'contact.html'];
    
    const today = new Date().toISOString().split('T')[0];
    
    staticPages.forEach(page => {
        xml += `  <url>\n    <loc>${STORE_URL}/${page}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    });
    
    products.filter(p => p.id && p.name).forEach(p => {
        let lastmod = today;
        if(p.updatedAt) {
            try { lastmod = new Date(parseInt(p.updatedAt)).toISOString().split('T')[0]; } catch(e){}
        }
        xml += `  <url>\n    <loc>${STORE_URL}/p/${p.id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    });
    
    xml += `</urlset>`;
    
    fs.writeFileSync('sitemap.xml', xml);
    console.log("Updated sitemap.xml");
}
run();
