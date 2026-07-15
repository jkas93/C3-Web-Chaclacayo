import { loadEnv } from 'vite';

const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
const env = loadEnv(mode, process.cwd(), '');
const requiredVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_MAPS_API_KEY',
];

const missingVariables = requiredVariables.filter((name) => !env[name]?.trim());

if (missingVariables.length > 0) {
  console.error(`Faltan variables requeridas para compilar Web-C3: ${missingVariables.join(', ')}`);
  process.exit(1);
}

console.log(`Configuración de compilación validada para ${env.VITE_FIREBASE_PROJECT_ID}.`);
