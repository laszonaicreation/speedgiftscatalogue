const { initializeApp } = require("firebase/app");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");

const firebaseConfig = {
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    authDomain: "speedgifts.net",
    projectId: "speed-catalogue",
    storageBucket: "speed-catalogue.firebasestorage.app",
    messagingSenderId: "84589409246",
    appId: "1:84589409246:web:124e25b09ba54dc9e3e34f"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function testUpload() {
    try {
        const storageRef = ref(storage, 'test-upload.txt');
        const buffer = Buffer.from('Hello Firebase Storage!', 'utf8');
        const uint8array = new Uint8Array(buffer);
        
        console.log("Uploading test file...");
        await uploadBytes(storageRef, uint8array, { contentType: 'text/plain' });
        
        const url = await getDownloadURL(storageRef);
        console.log("Success! File available at:", url);
    } catch (e) {
        console.error("Upload failed. Storage rules might be blocking it:", e.message);
    }
}

testUpload();
