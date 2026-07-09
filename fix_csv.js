const fs = require('fs');

const inputFile = 'google_contacts_filtered.csv';
const outputFile = 'google_contacts_fixed.csv';

const data = fs.readFileSync(inputFile, 'utf8');
const lines = data.split('\n');

const fixedLines = [];
// Put simple standard headers
fixedLines.push('First Name,Mobile Phone');

for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // original line: SG Customer 1,+971559215826
    const parts = line.split(',');
    if (parts.length >= 2) {
        const name = parts[0];
        const phone = parts[1];
        fixedLines.push(`${name},${phone}`);
    }
}

fs.writeFileSync(outputFile, fixedLines.join('\n'));
console.log('Fixed CSV created as google_contacts_fixed.csv');
