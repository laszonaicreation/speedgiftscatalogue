const fs = require('fs');
const path = require('path');

const sharedShellPath = path.join(__dirname, 'shared-shell.js');
let sharedShell = fs.readFileSync(sharedShellPath, 'utf8');

const oldSpinner = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:22px;color:#9ca3af;"></i>';
const newSpinner = '<svg viewBox="0 0 50 50" style="width:30px;height:30px;animation:spin 1s linear infinite;stroke:#9ca3af;"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="80" stroke-dashoffset="60"></circle></svg>';

sharedShell = sharedShell.replace(oldSpinner, newSpinner);

fs.writeFileSync(sharedShellPath, sharedShell, 'utf8');
console.log('Updated spinner in shared-shell.js');
