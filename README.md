# Web-C3 Chaclacayo

Centro de Comando y Control para administrar emergencias de Policía, Salud y
Bomberos. La aplicación web usa React, TypeScript, Vite y Firebase.

## Requisitos

- Node.js 22.x
- npm
- Java 21 para ejecutar Firebase Emulator Suite
- Un proyecto Firebase configurado
- Una clave de Google Maps restringida por dominio

## Desarrollo local

1. Copiar `.env.example` como `.env`.
2. Completar las variables sin versionar el archivo.
3. Instalar y validar:

```powershell
npm ci
npm run lint
npm run build
npm run preview
```

Las pruebas de reglas utilizan emuladores locales y requieren Java 21 con acceso
a puertos loopback. Las aplicaciones Android se validan por separado desde sus
respectivos proyectos y no forman parte de este repositorio.

## Validación automática

Cada push o pull request hacia `main` ejecuta en GitHub Actions:

- lint y build de React/Vite con Node.js 22;
- pruebas unitarias de Cloud Functions;
- pruebas de reglas Firestore, Realtime Database y Storage con Java 21;
- `npm audit --omit=dev` para frontend y Functions.

El workflow usa valores sintéticos únicamente para comprobar la compilación. No
incluye credenciales Firebase, llaves de servicio ni datos personales.

## Despliegue mediante GitHub y Vercel

El repositorio incluye `vercel.json` con el build de Vite, salida `dist`, rutas
SPA y cabeceras básicas de seguridad. En Vercel deben existir, para Production y
Preview, estas variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GOOGLE_MAPS_API_KEY
VITE_DEV_MODE=false
```

El build se detiene si falta una variable obligatoria. Después del primer
despliegue, el dominio asignado por Vercel debe agregarse a los dominios
autorizados de Firebase Authentication y a las restricciones HTTP de la clave de
Google Maps.

`c3-chaclacayo` es el entorno de desarrollo/staging. Un push a `main` publica el
frontend mediante Vercel, pero no despliega Functions ni reglas Firebase.

No deben subirse `.env`, llaves de servicio, reportes de migración, logs,
keystores ni datos personales. Las variables `VITE_*` forman parte del bundle del
navegador; no deben contener credenciales administrativas.

## Firebase backend

El directorio `functions/`, las reglas y los índices se despliegan mediante
Firebase CLI en una ventana controlada. Vercel publica únicamente el frontend y
no reemplaza el despliegue del backend Firebase.
