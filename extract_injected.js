const fs = require('fs');
const har = JSON.parse(fs.readFileSync('./speedgifts.net.har', 'utf8'));

let htmlEntry = har.log.entries.find(e => e.request.url === 'https://speedgifts.net/' && e.response.content.mimeType === 'text/html');

if (htmlEntry) {
    let htmlText = htmlEntry.response.content.text;
    if (htmlEntry.response.content.encoding === 'base64') {
        htmlText = Buffer.from(htmlText, 'base64').toString('utf8');
    }
    
    console.log("HTML length:", htmlText.length);
    
    const matches = htmlText.match(/<script.*?>.*?<\/script>/gs);
    if (matches) {
        matches.forEach(m => console.log(m.substring(0, 100)));
        
        const injected = htmlText.match(/window\.__INJECTED_HOME_DATA__\s*=\s*(.*?);(<\/script>|window\._sgSSRSliderKeys)/s);
        if (injected) {
            console.log("INJECTED DATA LENGTH:", injected[1].length);
            const data = JSON.parse(injected[1]);
            console.log("serverSyncTime:", data.serverSyncTime);
        } else {
            console.log("NO INJECTED DATA FOUND");
        }
    }
} else {
    console.log("No HTML entry found.");
}
