import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
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

async function initDb() {
  console.log("Iniciando creación de colecciones...");

  try {
    // 1. Colección emergencias
    await setDoc(doc(db, "emergencias", "INIT_DOC"), {
      estado: "PENDIENTE",
      tipo: "SOS",
      latitud: -11.9765,
      longitud: -76.7725,
      vecinoDni: "12345678",
      vecinoNombre: "Juan Perez",
      vecinoId: "usuario_demo_1",
      timestampMs: Date.now(),
      patrullaAsignadaId: "none",
      patrullaApoyoId: "none",
      audioUrl: null
    });
    console.log("Colección emergencias creada.");

    // 2. Colección patrulleros
    await setDoc(doc(db, "patrulleros", "patrullero_demo_1"), {
      uid: "patrullero_demo_1",
      nombre: "Sgt. Garcia",
      codigo: "PT-01",
      estado: "DISPONIBLE",
      latitud: -11.9760,
      longitud: -76.7720,
      tokenFCM: "token_temporal"
    });
    console.log("Colección patrulleros creada.");

    // 3. Colección usuarios
    await setDoc(doc(db, "usuarios", "usuario_demo_1"), {
      uid: "usuario_demo_1",
      dni: "12345678",
      nombre: "Juan Perez",
      telefono: "987654321",
      tokenFCM: "token_temporal",
      creadoEnMs: Date.now()
    });
    console.log("Colección usuarios creada.");

    // 4. Colección auditoria
    await setDoc(doc(db, "auditoria", "INIT_DOC"), {
      accion: "SISTEMA_INICIADO",
      detalles: "Configuración inicial de base de datos",
      ejecutadoPor: "system",
      emergenciaId: "n/a",
      timestamp: new Date()
    });
    console.log("Colección auditoria creada.");

    console.log("✅ Todas las colecciones han sido inicializadas correctamente.");
  } catch (error) {
    console.error("❌ Error inicializando DB:", error);
  }
}

initDb().then(() => process.exit(0));
