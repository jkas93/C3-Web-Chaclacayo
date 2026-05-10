const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// =============================================================================
// UTILIDADES
// =============================================================================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

async function registrarAuditoria(accion, ejecutadoPor, emergenciaId, detalles) {
    await db.collection('auditoria').add({
        accion,
        ejecutadoPor,
        emergenciaId: emergenciaId || null,
        detalles,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
}

// U2: Búsqueda robusta de usuario, priorizando DNI
async function findUsuarioForEmergencia(emergencia) {
    if (emergencia.vecinoDni) {
        const doc = await db.collection('usuarios').doc(emergencia.vecinoDni).get();
        if (doc.exists) return doc.data();
    }
    return await findUsuarioByUid(emergencia.vecinoId);
}

async function findUsuarioByUid(uid) {
    const userQuery = await db.collection('usuarios')
        .where('uid', '==', uid)
        .limit(1)
        .get();

    if (!userQuery.empty) {
        return userQuery.docs[0].data();
    }

    const vecinoDoc = await db.collection('usuarios').doc(uid).get();
    if (vecinoDoc.exists) {
        return vecinoDoc.data();
    }

    return null;
}

// =============================================================================
// 1. DESPACHO AUTOMÁTICO — onCreate emergencias (GEN 2)
// =============================================================================
exports.asignarPatrulleroCercano = onDocumentCreated('emergencias/{emergenciaId}', async (event) => {
    const snap = event.data;
    const emergencia = snap.data();
    const emergenciaId = event.params.emergenciaId;

    const estadosDespacho = ['PENDIENTE', 'COACCION'];
    if (!estadosDespacho.includes(emergencia.estado)) {
        return null;
    }

    const eLat = emergencia.latitud;
    const eLon = emergencia.longitud;
    const isCoaccion = emergencia.estado === 'COACCION';

    try {
        const patrullerosSnapshot = await db.collection('patrulleros')
            .where('estado', '==', 'DISPONIBLE')
            .get();

        if (patrullerosSnapshot.empty) {
            console.log('No hay patrulleros disponibles para:', emergenciaId);
            await registrarAuditoria('SIN_PATRULLEROS', 'system', emergenciaId, 'No se encontraron unidades disponibles');
            return null;
        }

        let patrols = [];

        patrullerosSnapshot.forEach(doc => {
            const pat = doc.data();
            if (pat.latitud && pat.longitud) {
                const dist = calculateDistance(eLat, eLon, pat.latitud, pat.longitud);
                patrols.push({ id: doc.id, dist, ...pat });
            }
        });

        // Ordenar por distancia
        patrols.sort((a, b) => a.dist - b.dist);

        if (patrols.length === 0) {
            return null;
        }

        const closest = patrols[0];

        console.log(`Asignando patrulla: ${closest.id}`);

        await db.runTransaction(async (transaction) => {
            const emergRef = db.collection('emergencias').doc(emergenciaId);
            const updates = {
                patrullaAsignadaId: closest.id,
                estado: isCoaccion ? 'COACCION' : 'DESPACHADA'
            };
            const patRef = db.collection('patrulleros').doc(closest.id);
            transaction.update(patRef, { estado: 'EN_SERVICIO' });
            transaction.update(emergRef, updates);
        });

        const notifyPatrol = async (pat) => {
            if (!pat.tokenFCM) return;
            // DATA ONLY payload para despertar la app vía Full-Screen Intent en background
            await messaging.send({
                token: pat.tokenFCM,
                data: {
                    emergenciaId,
                    tipo: emergencia.tipo || 'SOS',
                    coaccion: isCoaccion ? 'true' : 'false',
                    accion: 'NUEVA_EMERGENCIA'
                },
                android: { priority: 'high' }
            });
        };

        await notifyPatrol(closest);

        await registrarAuditoria('DESPACHO_UNICO', 'system', emergenciaId, `Asignado: ${closest.id}`);
        return { success: true };
    } catch (error) {
        console.error("Error asignando patrullero:", error);
        await registrarAuditoria('ERROR_DESPACHO', 'system', emergenciaId, error.message);
        return null;
    }
});

// =============================================================================
// 2. B1 FIX: CONSOLIDADO — onUpdate emergencias
//    Maneja notificación al vecino Y liberación de patrullero en un solo trigger
// =============================================================================
exports.procesarCambioEmergencia = onDocumentUpdated('emergencias/{emergenciaId}', async (event) => {
    const change = event.data;
    const before = change.before.data();
    const after = change.after.data();
    const emergenciaId = event.params.emergenciaId;

    // Solo procesar si cambió el estado
    if (before.estado === after.estado) {
        return null;
    }

    const resultados = [];

    // --- PARTE A: Notificar al vecino ---
    const vecinoId = after.vecinoId;
    if (vecinoId) {
        try {
            // U2: Usar función de búsqueda robusta
            const vecino = await findUsuarioForEmergencia(after);
            if (vecino && vecino.tokenFCM) {
                let titulo = '';
                let cuerpo = '';

                switch (after.estado) {
                    case 'DESPACHADA':
                        titulo = '🚔 Patrullero en camino';
                        cuerpo = 'Una unidad ha sido despachada a su ubicación. Mantenga la calma.';
                        break;
                    case 'EN_SITIO':
                        titulo = '✅ Patrullero en el sitio';
                        cuerpo = 'La unidad ha llegado a su ubicación.';
                        break;
                    case 'RESUELTA':
                        titulo = '📋 Emergencia resuelta';
                        cuerpo = 'Su emergencia ha sido atendida y cerrada.';
                        break;
                }

                if (titulo) {
                    await messaging.send({
                        token: vecino.tokenFCM,
                        notification: { title: titulo, body: cuerpo },
                        data: { emergenciaId, estado: after.estado },
                        android: { priority: 'high' }
                    });
                    await registrarAuditoria('NOTIFICACION_VECINO', 'system', emergenciaId, `Estado cambió de ${before.estado} a ${after.estado}`);
                    resultados.push('notificacion_enviada');
                }
            }
        } catch (error) {
            console.error("Error notificando al vecino:", error);
        }
    }

    // --- PARTE B: Liberar patrulleros si la emergencia fue resuelta o cancelada ---
    if (after.estado === 'RESUELTA' || after.estado === 'CANCELADA') {
        const liberarPatrulla = async (patId) => {
            if (!patId) return;
            try {
                await db.collection('patrulleros').doc(patId).update({ estado: 'DISPONIBLE' });
                await registrarAuditoria('PATRULLERO_LIBERADO', 'system', emergenciaId, `Patrullero ${patId} liberado tras ${after.estado.toLowerCase()} de emergencia`);
                resultados.push(`liberado_${patId}`);
            } catch (error) {
                console.error("Error liberando patrullero:", error);
            }
        };

        await liberarPatrulla(after.patrullaAsignadaId || before.patrullaAsignadaId);
    }

    return { resultados };
});

// =============================================================================
// 3. AUDITORÍA AUTOMÁTICA — onWrite emergencias (GEN 2)
// =============================================================================
exports.auditarEmergencia = onDocumentWritten('emergencias/{emergenciaId}', async (event) => {
    const change = event.data;
    const emergenciaId = event.params.emergenciaId;

    if (!change.before.exists) {
        const data = change.after.data();
        await registrarAuditoria('EMERGENCIA_CREADA', data.vecinoId || 'unknown', emergenciaId, `Tipo: ${data.tipo}, Estado: ${data.estado}`);
    } else if (!change.after.exists) {
        await registrarAuditoria('EMERGENCIA_ELIMINADA', 'admin', emergenciaId, 'Documento eliminado');
    }
    return null;
});

// =============================================================================
// 4. CREACIÓN DE PATRULLEROS (AUTH + FIRESTORE)
// S3 FIX: Autenticación obligatoria habilitada
// =============================================================================
exports.crearPatrullero = onCall(async (request) => {
    // S3 FIX: Validar autenticación — obligatorio
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado como operador C3.');
    }

    const { email, password, codigo, nombre, turno } = request.data;

    if (!email || !password || !codigo || !nombre) {
        throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.');
    }

    try {
        // 1. Crear usuario en Firebase Auth
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nombre,
        });

        const uid = userRecord.uid;

        // 2. Crear documento en Firestore usando el UID
        await db.collection('patrulleros').doc(uid).set({
            id: uid,
            codigo,
            nombre,
            turno,
            email,
            estado: 'FUERA_DE_SERVICIO',
            latitud: -11.9765, // Centro Chaclacayo
            longitud: -76.7725,
            ultimaActualizacion: Date.now(),
            tokenFCM: ''
        });

        await registrarAuditoria('PATRULLERO_CREADO', request.auth.uid, null, `Patrullero creado: ${codigo}`);

        return { success: true, uid };
    } catch (error) {
        console.error("Error creando patrullero:", error);
        throw new HttpsError('internal', error.message);
    }
});
