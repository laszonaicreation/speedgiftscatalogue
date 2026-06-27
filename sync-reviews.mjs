import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const app = initializeApp({
    apiKey: "AIzaSyAggNtKyGHlnjhx8vwbZFL5aM98awBt6Sw",
    projectId: "speed-catalogue",
});
const db = getFirestore(app);

async function run() {
    const revCol = collection(db, 'artifacts', '1:84589409246:web:124e25b09ba54dc9e3e34f', 'public', 'data', 'reviews');
    const snap = await getDocs(revCol);
    const productStats = {};
    
    snap.forEach(d => {
        const data = d.data();
        if (data.status === 'approved' && data.productId) {
            if (!productStats[data.productId]) productStats[data.productId] = { total: 0, count: 0 };
            productStats[data.productId].total += (data.rating || 5);
            productStats[data.productId].count += 1;
        }
    });

    for (const pid of Object.keys(productStats)) {
        const stats = productStats[pid];
        const rating = (stats.total / stats.count).toFixed(1);
        const pRef = doc(db, 'artifacts', '1:84589409246:web:124e25b09ba54dc9e3e34f', 'public', 'data', 'products', pid);
        try {
            await updateDoc(pRef, { rating: Number(rating), reviewCount: stats.count });
            console.log('Updated product', pid, rating, stats.count);
        } catch (e) {
            console.error('Failed', pid);
        }
    }
    console.log('Done!');
}
run();
