const fs = require('fs');

let code = fs.readFileSync('index.js', 'utf8');

if (!code.includes("zlib = require")) {
    code = code.replace("const sharp = require('sharp');", "const sharp = require('sharp');\nconst zlib = require('zlib');");
}

const compressionCode = `
        res.set('Content-Type', 'text/html; charset=utf-8');
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (acceptEncoding.includes('br')) {
            res.set('Content-Encoding', 'br');
            res.status(200).send(zlib.brotliCompressSync(htmlString));
        } else if (acceptEncoding.includes('gzip')) {
            res.set('Content-Encoding', 'gzip');
            res.status(200).send(zlib.gzipSync(htmlString));
        } else {
            res.status(200).send(htmlString);
        }`;

code = code.replace(/res\.status\(200\)\.send\(htmlString\);/g, compressionCode.trim());

fs.writeFileSync('index.js', code);
console.log('Fixed index.js successfully');
