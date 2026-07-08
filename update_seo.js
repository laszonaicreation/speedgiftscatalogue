const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const newDescription = "Speed Gifts is the UAE's premier personalized gift shop with fast delivery across Abu Dhabi, Dubai, Sharjah, Ajman, and all Emirates. Shop custom gifts, photo frames, mug printing, wood engraving, bottle & t-shirt printing, keychains, and corporate gifts.";
const newKeywords = "personalized gifts UAE, customized gifts Dubai, custom gift delivery Abu Dhabi, personalized gifts Sharjah, custom gifts Ajman, photo frames UAE, mug printing UAE, wood engraving frames, bottles printing Dubai, t-shirt printing Abu Dhabi, hoodie printing UAE, keychains printing UAE, office colleagues gift items, customized gifts near me UAE, unique gifts UAE, corporate gifts UAE, birthday gifts UAE, anniversary gifts delivery UAE, custom gifts all over UAE, personalized gifts Ras Al Khaimah, custom gifts Fujairah, Speed Gifts";

let updatedCount = 0;

for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Replace description
    const descRegex = /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/gi;
    if (descRegex.test(content)) {
        content = content.replace(descRegex, `<meta name="description" content="${newDescription}">`);
        changed = true;
    }

    // Replace keywords
    const keywordRegex = /<meta\s+name=["']keywords["']\s+content=["'][^"']*["']\s*\/?>/gi;
    if (keywordRegex.test(content)) {
        content = content.replace(keywordRegex, `<meta name="keywords" content="${newKeywords}">`);
        changed = true;
    }

    // Replace og:description
    const ogDescRegex = /<meta\s+property=["']og:description["']\s+content=["'][^"']*["']\s*\/?>/gi;
    if (ogDescRegex.test(content)) {
        content = content.replace(ogDescRegex, `<meta property="og:description" content="${newDescription}">`);
        changed = true;
    }

    // Replace twitter:description
    const twDescRegex = /<meta\s+name=["']twitter:description["']\s+content=["'][^"']*["']\s*\/?>/gi;
    if (twDescRegex.test(content)) {
        content = content.replace(twDescRegex, `<meta name="twitter:description" content="${newDescription}">`);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        updatedCount++;
    }
}

console.log(`Successfully updated SEO tags for all UAE delivery in ${updatedCount} HTML files.`);
