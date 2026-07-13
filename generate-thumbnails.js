const { initializeApp } = require("firebase/app");
const { getStorage, ref, listAll, getBytes, uploadBytes } = require("firebase/storage");
const sharp = require("sharp");

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speed-catalogue.firebaseapp.com",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "542718104868",
    appId: "1:542718104868:web:1ec41589da59dccbe5b9b8"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function processFolder(folderName) {
    console.log(`\nFetching list of images from '${folderName}' folder...`);
    const folderRef = ref(storage, folderName);
    
    let res;
    try {
         res = await listAll(folderRef);
    } catch (e) {
        console.error(`Failed to list images in ${folderName}:`, e.message);
        return { processed: 0, skipped: 0 };
    }
    
    console.log(`Found ${res.items.length} items in ${folderName}.`);
    
    const allNames = new Set(res.items.map(i => i.name));
    let processed = 0;
    let skipped = 0;
    
    for (const itemRef of res.items) {
        if (!itemRef.name.endsWith('.webp') || itemRef.name.endsWith('_thumb.webp')) continue;
        
        const thumbName = itemRef.name.replace('.webp', '_thumb.webp');
        if (allNames.has(thumbName)) {
            skipped++;
            continue; // Already has thumb
        }
        
        console.log(`Processing ${itemRef.name}...`);
        try {
            const buffer = await getBytes(itemRef);
            
            const thumbBuffer = await sharp(buffer)
                .resize({ width: 400, withoutEnlargement: true })
                .webp({ quality: 70 })
                .toBuffer();
                
            const thumbRef = ref(storage, `${folderName}/${thumbName}`);
            await uploadBytes(thumbRef, thumbBuffer, { contentType: 'image/webp' });
            console.log(`  -> Created ${thumbName} (${(thumbBuffer.length / 1024).toFixed(1)} KB)`);
            processed++;
        } catch (e) {
            console.error(`  -> Failed for ${itemRef.name}:`, e.message);
        }
    }
    return { processed, skipped };
}

async function run() {
    const stats1 = await processFolder('migrated');
    const stats2 = await processFolder('uploads');
    
    console.log(`\n--- Summary ---`);
    console.log(`Newly Created : ${stats1.processed + stats2.processed}`);
    console.log(`Already Exists: ${stats1.skipped + stats2.skipped}`);
    console.log(`Done!`);
    process.exit(0);
}

run();
