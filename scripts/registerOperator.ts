import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
const auth = getAuth(app);

async function registerOperator() {
  const email = "javaloss@uni.pe";
  const password = "Yaquiestas2**";

  try {
    console.log(`Iniciando sesión con ${email}...`);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log(`Usuario autenticado con UID: ${user.uid}`);
    
    console.log(`Registrando como operador C3...`);
    await setDoc(doc(db, "operadores_c3", user.uid), {
      uid: user.uid,
      email: user.email,
      nombre: "Administrador C3",
      rol: "SUPER_ADMIN",
      creadoEnMs: Date.now()
    });
    
    console.log("✅ Usuario registrado exitosamente como Operador C3 en producción.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

registerOperator().then(() => process.exit(0));
