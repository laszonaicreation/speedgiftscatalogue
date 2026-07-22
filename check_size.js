import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function checkSize() {
    console.log("Fetching...");
    const p = await getDocs(collection(db, 'artifacts/speed-catalogue/public/data/products'));
    const c = await getDocs(collection(db, 'artifacts/speed-catalogue/public/data/categories'));
    const ye = {
        p: p.docs.map(d => ({id: d.id, ...d.data()})),
        c: c.docs.map(d => ({id: d.id, ...d.data()})),
        serverSyncTime: 12345
    };
    const str = JSON.stringify(ye);
    console.log("Total size:", str.length, "bytes");
    process.exit(0);
}
checkSize();
