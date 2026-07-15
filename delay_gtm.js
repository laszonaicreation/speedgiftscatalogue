const fs = require('fs');
const path = require('path');

const gtmRegex = /<!-- Google Tag Manager -->\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-P6WMHVN6"><\/script>\s*<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*function gtag\(\) \{ dataLayer\.push\(arguments\); \}\s*gtag\('js', new Date\(\)\);\s*gtag\('config', 'AW-789546339'\);\s*gtag\('config', 'G-98ZMG3ZF7Z'\);\s*\(function \(w, d, s, l, i\) \{[\s\S]*?\}\)\(window, document, 'script', 'dataLayer', 'GTM-P6WMHVN6'\);\s*<\/script>/g;

const newGtmCode = `<!-- Google Tag Manager (Delayed) -->
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', 'AW-789546339');
        gtag('config', 'G-98ZMG3ZF7Z');

        window.addEventListener('load', function() {
            setTimeout(function() {
                var script = document.createElement('script');
                script.async = true;
                script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-P6WMHVN6';
                document.head.appendChild(script);

                (function (w, d, s, l, i) {
                    w[l] = w[l] || [];
                    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
                    var f = d.getElementsByTagName(s)[0],
                        j = d.createElement(s),
                        dl = l != 'dataLayer' ? '&l=' + l : '';
                    j.async = true;
                    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
                    f.parentNode.insertBefore(j, f);
                })(window, document, 'script', 'dataLayer', 'GTM-P6WMHVN6');
            }, 1000); // 1 second after page load
        });
    </script>`;

const files = fs.readdirSync(__dirname);
let count = 0;

files.forEach(file => {
    if (file.endsWith('.html') && !file.endsWith('.min.html')) {
        let content = fs.readFileSync(file, 'utf8');
        
        // Match the dev versions
        if (content.match(gtmRegex)) {
            content = content.replace(gtmRegex, newGtmCode);
            fs.writeFileSync(file, content, 'utf8');
            console.log(`Updated GTM in ${file}`);
            count++;
        } else {
            // Check if there's a minified GTM code in it
            const minGtmRegex = /<script async src="https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-P6WMHVN6"><\/script><script>function gtag\(\)\{dataLayer\.push\(arguments\)\}window\.dataLayer=window\.dataLayer\|\|\[\],gtag\("js",new Date\),gtag\("config","AW-789546339"\),gtag\("config","G-98ZMG3ZF7Z"\),function\(t,a,e,g\)\{t\[g\]=t\[g\]\|\|\[\],t\[g\]\.push\(\{"gtm\.start":\(new Date\)\.getTime\(\),event:"gtm\.js"\}\);var n=a\.getElementsByTagName\(e\)\[0\],o=a\.createElement\(e\);o\.async=!0,o\.src="https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-P6WMHVN6",n\.parentNode\.insertBefore\(o,n\)\}\(window,document,"script","dataLayer"\)<\/script>/g;
            
            if (content.match(minGtmRegex)) {
                // For minified files (like index.html which gets overwritten anyway, but let's be safe)
                const minNewGtmCode = `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date),gtag("config","AW-789546339"),gtag("config","G-98ZMG3ZF7Z"),window.addEventListener("load",function(){setTimeout(function(){var a=document.createElement("script");a.async=!0,a.src="https://www.googletagmanager.com/gtm.js?id=GTM-P6WMHVN6",document.head.appendChild(a),function(a,e,t,g,n){a[g]=a[g]||[],a[g].push({"gtm.start":(new Date).getTime(),event:"gtm.js"});var c=e.getElementsByTagName(t)[0],r=e.createElement(t),o="dataLayer"!=g?"&l="+g:"";r.async=!0,r.src="https://www.googletagmanager.com/gtm.js?id="+n+o,c.parentNode.insertBefore(r,c)}(window,document,"script","dataLayer","GTM-P6WMHVN6")},1e3)});</script>`;
                content = content.replace(minGtmRegex, minNewGtmCode);
                fs.writeFileSync(file, content, 'utf8');
                console.log(`Updated Minified GTM in ${file}`);
                count++;
            }
        }
    }
});

console.log(`Finished updating GTM in ${count} files.`);
