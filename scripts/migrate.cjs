/**
 * SCRIPT DE MIGRACIÓN — Ecosistema Seguridad Ciudadana Chaclacayo
 *
 * Ejecutar SOLO UNA VEZ con:
 *   node migrate.js
 *
 * Requiere: npm install firebase-admin
 * Requiere: variable de entorno GOOGLE_APPLICATION_CREDENTIALS apuntando al service account JSON
 * o colocar el archivo serviceAccountKey.json en el mismo directorio.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// --- Inicialización ---
const serviceAccount = require('./serviceAccountKey.json'); // Coloca aquí tu service account
const app = initializeApp({
    credential: cert(serviceAccount)
});
const db = getFirestore(app);

// --- Mapa de tipos de emergencia (anterior → nuevo) ---
const TIPO_MAP = {
    'SOS': 'POLICIA',
    'SOSPECHA': 'POLICIA',
    'MEDICA': 'SALUD',
    // Por si acaso existen variaciones
    'POLICIA': 'POLICIA',
    'SALUD': 'SALUD',
    'BOMBEROS': 'BOMBEROS',
};

// =============================================================================
// MIGRACIÓN 1: Colección "emergencias" → campo "tipo"
// =============================================================================
async function migrarEmergencias() {
    console.log('\n====================================');
    console.log('MIGRACIÓN 1: emergencias.tipo');
    console.log('====================================');

    const snapshot = await db.collection('emergencias').get();
    const total = snapshot.size;
    console.log(`Total de emergencias encontradas: ${total}`);

    if (total === 0) {
        console.log('No hay emergencias para migrar.');
        return;
    }

    const batch = db.batch();
    let count = 0;
    let skipped = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const tipoActual = data.tipo || '';
        const tipoNuevo = TIPO_MAP[tipoActual];

        if (!tipoNuevo) {
            console.warn(`  ⚠ emergencia ${doc.id}: tipo desconocido "${tipoActual}" — SKIPPED`);
            skipped++;
            return;
        }

        if (tipoActual === tipoNuevo) {
            // Ya tiene el valor correcto
            skipped++;
            return;
        }

        console.log(`  ✔ emergencia ${doc.id}: "${tipoActual}" → "${tipoNuevo}"`);
        batch.update(doc.ref, { tipo: tipoNuevo });
        count++;
    });

    if (count > 0) {
        await batch.commit();
        console.log(`\n✅ ${count} emergencias migradas correctamente.`);
    } else {
        console.log('\n✅ Todas las emergencias ya tenían el tipo correcto. Sin cambios.');
    }
    if (skipped > 0) {
        console.log(`ℹ️  ${skipped} documentos saltados (ya correctos o tipo desconocido).`);
    }
}

// =============================================================================
// MIGRACIÓN 2: Colección "patrulleros" → campo "tipoServicio"
// =============================================================================
async function migrarPatrulleros() {
    console.log('\n====================================');
    console.log('MIGRACIÓN 2: patrulleros.tipoServicio');
    console.log('====================================');

    const snapshot = await db.collection('patrulleros').get();
    const total = snapshot.size;
    console.log(`Total de patrulleros encontrados: ${total}`);

    if (total === 0) {
        console.log('No hay patrulleros para migrar.');
        return;
    }

    const batch = db.batch();
    let count = 0;
    let skipped = 0;

    snapshot.forEach(doc => {
        const data = doc.data();

        // Si ya tiene tipoServicio válido, no tocar
        if (['POLICIA', 'SALUD', 'BOMBEROS'].includes(data.tipoServicio)) {
            console.log(`  ℹ patrullero ${doc.id} (${data.nombre || '?'}): ya tiene tipoServicio="${data.tipoServicio}"`);
            skipped++;
            return;
        }

        // Sin tipoServicio o valor inválido → asignar POLICIA (todos eran policías antes)
        console.log(`  ✔ patrullero ${doc.id} (${data.nombre || '?'}): sin tipoServicio → "POLICIA"`);
        batch.update(doc.ref, { tipoServicio: 'POLICIA' });
        count++;
    });

    if (count > 0) {
        await batch.commit();
        console.log(`\n✅ ${count} patrulleros actualizados con tipoServicio="POLICIA".`);
    } else {
        console.log('\n✅ Todos los patrulleros ya tenían tipoServicio. Sin cambios.');
    }
    if (skipped > 0) {
        console.log(`ℹ️  ${skipped} documentos saltados (ya tenían tipoServicio válido).`);
    }
}

// =============================================================================
// EJECUCIÓN PRINCIPAL
// =============================================================================
async function main() {
    console.log('🚀 Iniciando migración del ecosistema de seguridad...');
    console.log('Proyecto Firebase:', app.options.projectId || '(usando credenciales del entorno)');

    try {
        await migrarEmergencias();
        await migrarPatrulleros();
        console.log('\n🎉 Migración completada exitosamente.');
    } catch (error) {
        console.error('\n❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

main();
