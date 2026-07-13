const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, updateDoc } = require("firebase/firestore");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const axios = require("axios");
const sharp = require("sharp");
const path = require("path");

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speedgifts.net",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Simple delay for rate limiting
const delay = ms => new Promise(res => setTimeout(res, ms));

async function downloadAndOptimize(url) {
    try {
        console.log(`  Downloading: ${url.substring(0, 50)}...`);
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const buffer = Buffer.from(response.data);
        
        const metadata = await sharp(buffer).metadata();
        let sharpInstance = sharp(buffer);
        
        // Resize if width > 1200px
        if (metadata.width > 1200) {
            sharpInstance = sharpInstance.resize({ width: 1200, withoutEnlargement: true });
        }
        
        // Compress to webp
        const optimizedBuffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
        
        const oldKb = (buffer.length / 1024).toFixed(1);
        const newKb = (optimizedBuffer.length / 1024).toFixed(1);
        console.log(`  Optimized: ${oldKb}KB -> ${newKb}KB`);
        
        return optimizedBuffer;
    } catch (e) {
        console.error(`  Failed to process image ${url}:`, e.message);
        return null;
    }
}

async function uploadToFirebase(buffer, id, fieldName, index = '') {
    const filename = `migrated/${id}_${fieldName}${index}.webp`;
    const storageRef = ref(storage, filename);
    const uint8array = new Uint8Array(buffer);
    
    await uploadBytes(storageRef, uint8array, { contentType: 'image/webp' });
    return await getDownloadURL(storageRef);
}

async function migrateCollection(collectionName) {
    console.log(`\n--- Migrating Collection: ${collectionName} ---`);
    const colRef = collection(db, "artifacts", "speed-catalogue", "public", "data", collectionName);
    const snapshot = await getDocs(colRef);
    
    let processed = 0;
    let updated = 0;

    for (const document of snapshot.docs) {
        const data = document.data();
        let needsUpdate = false;
        const updates = {};
        
        processed++;

        // 1. Single Image Field
        if (data.img && data.img.includes('cloudinary.com')) {
            console.log(`[${collectionName}] Found img in ${document.id}`);
            const optimized = await downloadAndOptimize(data.img);
            if (optimized) {
                const newUrl = await uploadToFirebase(optimized, document.id, 'img');
                updates.img = newUrl;
                needsUpdate = true;
            }
        }
        
        // 2. Mobile Image Field (Sliders)
        if (data.mobileImg && data.mobileImg.includes('cloudinary.com')) {
            console.log(`[${collectionName}] Found mobileImg in ${document.id}`);
            const optimized = await downloadAndOptimize(data.mobileImg);
            if (optimized) {
                const newUrl = await uploadToFirebase(optimized, document.id, 'mobileImg');
                updates.mobileImg = newUrl;
                needsUpdate = true;
            }
        }

        // 3. Images Array (Products)
        if (data.images && Array.isArray(data.images)) {
            let updatedArray = false;
            const newImages = [];
            for (let i = 0; i < data.images.length; i++) {
                const imgUrl = data.images[i];
                if (imgUrl && imgUrl.includes('cloudinary.com')) {
                    console.log(`[${collectionName}] Found images[${i}] in ${document.id}`);
                    const optimized = await downloadAndOptimize(imgUrl);
                    if (optimized) {
                        const newUrl = await uploadToFirebase(optimized, document.id, 'images', i);
                        newImages.push(newUrl);
                        updatedArray = true;
                    } else {
                        newImages.push(imgUrl); // Keep old if fail
                    }
                } else {
                    newImages.push(imgUrl);
                }
            }
            if (updatedArray) {
                updates.images = newImages;
                needsUpdate = true;
            }
        }
        
        // 4. Variations Array (Products)
        if (data.vars && Array.isArray(data.vars)) {
            let updatedVars = false;
            const newVars = [];
            for (let i = 0; i < data.vars.length; i++) {
                const variation = data.vars[i];
                if (variation && variation.img && variation.img.includes('cloudinary.com')) {
                    console.log(`[${collectionName}] Found vars[${i}].img in ${document.id}`);
                    const optimized = await downloadAndOptimize(variation.img);
                    if (optimized) {
                        const newUrl = await uploadToFirebase(optimized, document.id, 'varImg', i);
                        variation.img = newUrl;
                        updatedVars = true;
                    }
                }
                newVars.push(variation);
            }
            if (updatedVars) {
                updates.vars = newVars;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            console.log(`  Updating Firestore for ${document.id}...`);
            await updateDoc(doc(db, "artifacts", "speed-catalogue", "public", "data", collectionName, document.id), updates);
            updated++;
            console.log(`  ✅ Update successful.`);
        }
        
        await delay(500); // Small pause between documents
    }
    
    console.log(`Collection ${collectionName} complete. Processed ${processed}, Updated ${updated}.`);
}

async function runMigration() {
    try {
        console.log("🚀 Starting Cloudinary to Firebase Storage Migration...");
        await migrateCollection("sliders");
        await migrateCollection("categories");
        await migrateCollection("products");
        console.log("🎉 All Migrations Completed Successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Migration crashed:", e);
        process.exit(1);
    }
}

runMigration();
