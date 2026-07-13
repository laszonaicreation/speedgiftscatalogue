const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const fs = require("fs");

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

async function backup() {
    console.log("Starting Backup...");
    const backupData = {};
    const collectionsToBackup = ["products", "categories", "sliders", "mega_menus"];

    try {
        for (const col of collectionsToBackup) {
            console.log(`Fetching ${col}...`);
            const colRef = collection(db, "artifacts", "speed-catalogue", "public", "data", col);
            const snapshot = await getDocs(colRef);
            
            backupData[col] = [];
            snapshot.forEach(doc => {
                backupData[col].push({ id: doc.id, ...doc.data() });
            });
            console.log(`Fetched ${backupData[col].length} items from ${col}.`);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `speedgifts_backup_${timestamp}.json`;
        
        fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
        console.log(`Backup completed successfully! Saved to: ${filename}`);

    } catch (e) {
        console.error("Error during backup:", e);
    }
}

backup();
