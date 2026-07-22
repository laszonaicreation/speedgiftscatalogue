const fs = require('fs');
let app = fs.readFileSync('app.min.js', 'utf8');
app = app.replace(
    'console.log("[Sync] Local data is stale or sync time missing, fetching full updates...")',
    'console.log("[Sync DEBUG] live:", o, "local:", t, "INJECTED:", window.__INJECTED_HOME_DATA__ ? window.__INJECTED_HOME_DATA__.serverSyncTime : null, "ye.p.length:", ye.p ? ye.p.length : 0); console.log("[Sync] Local data is stale or sync time missing, fetching full updates...")'
);
fs.writeFileSync('app.min.js', app);

let shop = fs.readFileSync('shop.min.js', 'utf8');
shop = shop.replace(
    'console.log("[Sync] SSR data is stale or sync time missing, fetching full updates...");',
    'console.log("[Sync DEBUG] live:", liveSyncTime, "local:", currentSync, "INJECTED:", window.__INJECTED_SHOP_DATA__ ? window.__INJECTED_SHOP_DATA__.serverSyncTime : null, "DATA.products.length:", DATA.products ? DATA.products.length : 0); console.log("[Sync] SSR data is stale or sync time missing, fetching full updates...");'
);
fs.writeFileSync('shop.min.js', shop);
