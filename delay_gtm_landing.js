const fs = require('fs');
const file = 'landing.html';

let content = fs.readFileSync(file, 'utf8');

const regex1 = /<!-- Google Tag Manager -->\s*<script>\(function \(w, d, s, l, i\) \{\s*w\[l\] = w\[l\] \|\| \[\]; w\[l\]\.push\(\{\s*'gtm\.start':\s*new Date\(\)\.getTime\(\), event: 'gtm\.js'\s*\}\); var f = d\.getElementsByTagName\(s\)\[0\],\s*j = d\.createElement\(s\), dl = l != 'dataLayer' \? '&l=' \+ l : ''; j\.async = true; j\.src =\s*'https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=' \+ i \+ dl; f\.parentNode\.insertBefore\(j, f\);\s*\}\)\(window, document, 'script', 'dataLayer', 'GTM-P6WMHVN6'\);<\/script>\s*<!-- End Google Tag Manager -->/g;

const regex2 = /<!-- GOOGLE ADS: Global Tag \(gtag\.js\) -->\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=AW-789546339"><\/script>\s*<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*function gtag\(\) \{ dataLayer\.push\(arguments\); \}\s*gtag\('js', new Date\(\)\);\s*gtag\('config', 'AW-789546339'\);\s*gtag\('config', 'G-98ZMG3ZF7Z'\);\s*<\/script>/g;

content = content.replace(regex1, '');
content = content.replace(regex2, '');

const newGtmCode = `<!-- Google Tracking (Delayed) -->
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
                script.src = 'https://www.googletagmanager.com/gtag/js?id=AW-789546339';
                document.head.appendChild(script);

                var gtmScript = document.createElement('script');
                gtmScript.async = true;
                gtmScript.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-P6WMHVN6';
                document.head.appendChild(gtmScript);

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
            }, 1000);
        });
    </script>`;

content = content.replace(/<\/head>/, newGtmCode + '\n</head>');

fs.writeFileSync(file, content, 'utf8');
console.log('Updated landing.html');
