import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

async function checkSync() {
    const d = await getDoc(doc(db, 'artifacts/speed-catalogue/public/data/config/sync_status'));
    if (d.exists()) {
        console.log("SYNC DOC:", d.data());
        console.log("lastUpdated:", d.data().lastUpdated?.toMillis());
    } else {
        console.log("NO SYNC DOC");
    }
    process.exit(0);
}
checkSync();
