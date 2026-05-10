import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || "1:170902566269:web:placeholder"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fix() {
  const snapshot = await getDocs(collection(db, 'patrulleros'));
  for (const d of snapshot.docs) {
    const data = d.data();
    if (data.ultimaActualizacion && typeof data.ultimaActualizacion === 'object' && data.ultimaActualizacion.toMillis) {
      console.log(`Fixing patrullero ${d.id}`);
      await updateDoc(doc(db, 'patrulleros', d.id), {
        ultimaActualizacion: data.ultimaActualizacion.toMillis()
      });
    }
  }
  console.log("Fixed!");
}

fix().then(() => process.exit(0));
