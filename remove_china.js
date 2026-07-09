const fs = require('fs');

const inputFile = 'google_contacts_840.csv';
const outputFile = 'google_contacts_filtered.csv';

const data = fs.readFileSync(inputFile, 'utf8');
const lines = data.split('\n');

const filtered = lines.filter(line => {
    if (!line.trim()) return false; // Remove empty lines
    if (line.startsWith('Name')) return true; // Keep header

    const parts = line.split(',');
    if (parts.length > 1) {
        const phone = parts[1].trim();
        // China country code is +86
        if (phone.startsWith('+86')) {
            return false;
        }
    }
    return true;
});

fs.writeFileSync(outputFile, filtered.join('\n'));

console.log(`Original count: ${lines.length - 1} (including header)`);
console.log(`Filtered count: ${filtered.length - 1}`);
console.log(`Successfully removed ${lines.length - filtered.length} China numbers (+86).`);
