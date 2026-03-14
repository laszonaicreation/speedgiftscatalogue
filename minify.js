const fs = require('fs');

const input = fs.readFileSync('style.css', 'utf-8');

// Basic safe minification
const minified = input
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\s*([\{\}\:\;\,])\s*/g, '$1') // Remove spaces around syntax
    .replace(/\n /g, '') // Remove newlines
    .replace(/;}/g, '}') // Remove trailing semicolon
    .trim();

fs.writeFileSync('style.min.css', minified);
console.log('CSS Minified successfully');
