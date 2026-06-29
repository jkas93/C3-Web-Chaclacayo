const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Tipos de servicio válidos
const TIPOS_SERVICIO_VALIDOS = ['POLICIA', 'SALUD', 'BOMBEROS'];

// Roles de operador válidos
const ROLES_OPERADOR_VALIDOS = ['ADMIN', 'POLICIA', 'SALUD', 'BOMBEROS'];

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

// Obtener etiqueta legible del tipo de servicio para notificaciones
function getLabelServicio(tipo) {
    switch (tipo) {
        case 'POLICIA':   return { emoji: '🚔', nombre: 'Patrullero' };
        case 'SALUD':     return { emoji: '🚑', nombre: 'Ambulancia' };
        case 'BOMBEROS':  return { emoji: '🚒', nombre: 'Bomberos' };
        default:          return { emoji: '🚨', nombre: 'Unidad' };
    }
}

// =============================================================================
// 1. DESPACHO AUTOMÁTICO POR TIPO DE SERVICIO — onCreate emergencias
// =============================================================================
exports.asignarUnidadCercana = onDocumentCreated('emergencias/{emergenciaId}', async (event) => {
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

    // Tipo de servicio requerido por la emergencia
    const tipoServicio = emergencia.tipo; // 'POLICIA' | 'SALUD' | 'BOMBEROS'
    if (!TIPOS_SERVICIO_VALIDOS.includes(tipoServicio)) {
        console.warn(`Tipo de servicio inválido "${tipoServicio}" en emergencia ${emergenciaId}`);
        await registrarAuditoria('TIPO_INVALIDO', 'system', emergenciaId, `Tipo recibido: ${tipoServicio}`);
        return null;
    }

    try {
        // Buscar unidades disponibles del tipo correcto
        const unidadesSnapshot = await db.collection('patrulleros')
            .where('estado', '==', 'DISPONIBLE')
            .where('tipoServicio', '==', tipoServicio)
            .get();

        if (unidadesSnapshot.empty) {
            console.log(`No hay unidades de ${tipoServicio} disponibles para: ${emergenciaId}`);
            await registrarAuditoria('SIN_UNIDADES', 'system', emergenciaId,
                `No se encontraron unidades de tipo ${tipoServicio} disponibles`);
            return null;
        }

        let unidades = [];
        unidadesSnapshot.forEach(doc => {
            const u = doc.data();
            if (u.latitud && u.longitud) {
                const dist = calculateDistance(eLat, eLon, u.latitud, u.longitud);
                unidades.push({ id: doc.id, dist, ...u });
            }
        });

        // Ordenar por distancia (la más cercana primero)
        unidades.sort((a, b) => a.dist - b.dist);

        if (unidades.length === 0) {
            console.log(`Unidades de ${tipoServicio} sin coordenadas para: ${emergenciaId}`);
            return null;
        }

        const closest = unidades[0];
        console.log(`Asignando unidad ${tipoServicio}: ${closest.id} (dist: ${(closest.dist / 1000).toFixed(2)} km)`);

        await db.runTransaction(async (transaction) => {
            const emergRef = db.collection('emergencias').doc(emergenciaId);
            const unidadRef = db.collection('patrulleros').doc(closest.id);
            transaction.update(unidadRef, { estado: 'EN_SERVICIO' });
            transaction.update(emergRef, {
                patrullaAsignadaId: closest.id,
                estado: isCoaccion ? 'COACCION' : 'DESPACHADA',
                horaAsignacionMs: Date.now()
            });
        });

        // Notificar a la unidad asignada via FCM
        if (closest.tokenFCM) {
            await messaging.send({
                token: closest.tokenFCM,
                data: {
                    emergenciaId,
                    tipo: tipoServicio,
                    coaccion: isCoaccion ? 'true' : 'false',
                    accion: 'NUEVA_EMERGENCIA'
                },
                android: { priority: 'high' }
            });
        }

        await registrarAuditoria('DESPACHO_AUTOMATICO', 'system', emergenciaId,
            `Tipo: ${tipoServicio} | Asignado: ${closest.id} | Distancia: ${(closest.dist / 1000).toFixed(2)} km`);
        return { success: true };
    } catch (error) {
        console.error("Error en despacho automático:", error);
        await registrarAuditoria('ERROR_DESPACHO', 'system', emergenciaId, error.message);
        return null;
    }
});

// =============================================================================
// 2. NOTIFICACIÓN AL VECINO Y LIBERACIÓN DE UNIDAD — onUpdate emergencias
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
    const servicioLabel = getLabelServicio(after.tipo);

    // --- PARTE A: Notificar al vecino ---
    const vecinoId = after.vecinoId;
    if (vecinoId) {
        try {
            const vecino = await findUsuarioForEmergencia(after);
            if (vecino && vecino.tokenFCM) {
                let titulo = '';
                let cuerpo = '';

                switch (after.estado) {
                    case 'DESPACHADA':
                        titulo = `${servicioLabel.emoji} ${servicioLabel.nombre} en camino`;
                        cuerpo = `Una unidad de ${servicioLabel.nombre} ha sido despachada a su ubicación. Mantenga la calma.`;
                        break;
                    case 'EN_SITIO':
                        titulo = `✅ ${servicioLabel.nombre} en el sitio`;
                        cuerpo = `La unidad de ${servicioLabel.nombre} ha llegado a su ubicación.`;
                        break;
                    case 'RESUELTA':
                        titulo = '📋 Emergencia resuelta';
                        cuerpo = 'Su emergencia ha sido atendida y cerrada. Gracias por reportar.';
                        break;
                }

                if (titulo) {
                    await messaging.send({
                        token: vecino.tokenFCM,
                        notification: { title: titulo, body: cuerpo },
                        data: { emergenciaId, estado: after.estado, tipo: after.tipo || '' },
                        android: { priority: 'high' }
                    });
                    await registrarAuditoria('NOTIFICACION_VECINO', 'system', emergenciaId,
                        `Estado: ${before.estado} → ${after.estado}`);
                    resultados.push('notificacion_enviada');
                }
            }
        } catch (error) {
            console.error("Error notificando al vecino:", error);
        }
    }

    // --- PARTE B: Liberar unidad si la emergencia fue resuelta o cancelada ---
    if (after.estado === 'RESUELTA' || after.estado === 'CANCELADA') {
        const liberarUnidad = async (unidadId) => {
            if (!unidadId) return;
            try {
                await db.collection('patrulleros').doc(unidadId).update({ estado: 'DISPONIBLE' });
                await registrarAuditoria('UNIDAD_LIBERADA', 'system', emergenciaId,
                    `Unidad ${unidadId} liberada tras ${after.estado.toLowerCase()}`);
                resultados.push(`liberada_${unidadId}`);
            } catch (error) {
                console.error("Error liberando unidad:", error);
            }
        };

        await liberarUnidad(after.patrullaAsignadaId || before.patrullaAsignadaId);
    }

    return { resultados };
});

// =============================================================================
// 3. AUDITORÍA AUTOMÁTICA — onWrite emergencias
// =============================================================================
exports.auditarEmergencia = onDocumentWritten('emergencias/{emergenciaId}', async (event) => {
    const change = event.data;
    const emergenciaId = event.params.emergenciaId;

    if (!change.before.exists) {
        const data = change.after.data();
        await registrarAuditoria('EMERGENCIA_CREADA', data.vecinoId || 'unknown', emergenciaId,
            `Tipo: ${data.tipo}, Estado: ${data.estado}`);
    } else if (!change.after.exists) {
        await registrarAuditoria('EMERGENCIA_ELIMINADA', 'admin', emergenciaId, 'Documento eliminado');
    }
    return null;
});

// =============================================================================
// 4. CREAR PATRULLERO (Unidad Móvil) — con tipoServicio obligatorio
// =============================================================================
exports.crearPatrullero = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado como operador C3.');
    }

    // Verificar que el operador es ADMIN
    const operadorDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN') {
        throw new HttpsError('permission-denied', 'Solo el ADMIN puede crear unidades móviles.');
    }

    const { email, password, nombre, turno, tipoServicio, unidad, placa, cip } = request.data;

    if (!email || !password || !nombre || !tipoServicio || !unidad) {
        throw new HttpsError('invalid-argument', 'Faltan campos obligatorios: email, password, nombre, tipoServicio, unidad.');
    }

    if (!TIPOS_SERVICIO_VALIDOS.includes(tipoServicio)) {
        throw new HttpsError('invalid-argument',
            `tipoServicio inválido. Valores permitidos: ${TIPOS_SERVICIO_VALIDOS.join(', ')}`);
    }

    if (password.length < 6) {
        throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
    }

    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nombre,
        });

        const uid = userRecord.uid;

        await db.collection('patrulleros').doc(uid).set({
            id: uid,
            nombre,
            turno: turno || 'DIA',
            email,
            tipoServicio,                   // POLICIA | SALUD | BOMBEROS
            estado: 'FUERA_DE_SERVICIO',
            latitud: -11.9765,
            longitud: -76.7725,
            ultimaActualizacion: Date.now(),
            tokenFCM: '',
            unidad: unidad,
            placa: placa || '-',
            cip: cip || '-',
            emergenciasAtendidasHoy: 0,
            frenadasBruscasTotales: 0
        });

        await registrarAuditoria('PATRULLERO_CREADO', request.auth.uid, null,
            `Creado: ${unidad} (${tipoServicio})`);

        return { success: true, uid };
    } catch (error) {
        console.error("Error creando patrullero:", error);
        throw new HttpsError('internal', error.message);
    }
});

// =============================================================================
// 4B. EDITAR PATRULLERO (Unidad Móvil)
// =============================================================================
exports.editarPatrullero = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado como operador C3.');
    }

    const operadorDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN') {
        throw new HttpsError('permission-denied', 'Solo el ADMIN puede editar unidades móviles.');
    }

    const { uid, nombre, turno, tipoServicio, unidad, placa, cip } = request.data;

    if (!uid || !nombre || !tipoServicio || !unidad) {
        throw new HttpsError('invalid-argument', 'Faltan campos obligatorios para editar.');
    }

    if (!TIPOS_SERVICIO_VALIDOS.includes(tipoServicio)) {
        throw new HttpsError('invalid-argument', `tipoServicio inválido.`);
    }

    try {
        await db.collection('patrulleros').doc(uid).update({
            nombre,
            turno,
            tipoServicio,
            unidad,
            placa: placa || '-',
            cip: cip || '-'
        });

        // Opcional: Actualizar el nombre en Auth
        await admin.auth().updateUser(uid, {
            displayName: nombre
        });

        await registrarAuditoria('PATRULLERO_EDITADO', request.auth.uid, null, `Editado: ${unidad} (${tipoServicio})`);
        return { success: true };
    } catch (error) {
        console.error("Error editando patrullero:", error);
        throw new HttpsError('internal', error.message);
    }
});

// =============================================================================
// 5. CREAR OPERADOR C3 — Solo ADMIN puede crear operadores con rol
// =============================================================================
exports.crearOperadorC3 = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado como operador C3.');
    }

    // Verificar que el solicitante es ADMIN
    const solicitanteDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!solicitanteDoc.exists || solicitanteDoc.data().rol !== 'ADMIN') {
        throw new HttpsError('permission-denied', 'Solo el ADMIN puede crear operadores C3.');
    }

    const { email, password, nombre, rol } = request.data;

    // Validaciones
    if (!email || !password || !nombre || !rol) {
        throw new HttpsError('invalid-argument', 'Faltan campos obligatorios: email, password, nombre, rol.');
    }

    if (!ROLES_OPERADOR_VALIDOS.includes(rol)) {
        throw new HttpsError('invalid-argument',
            `Rol inválido. Valores permitidos: ${ROLES_OPERADOR_VALIDOS.join(', ')}`);
    }

    if (password.length < 8) {
        throw new HttpsError('invalid-argument', 'La contraseña del operador debe tener al menos 8 caracteres.');
    }

    // No permitir crear otro ADMIN desde aquí (medida de seguridad)
    if (rol === 'ADMIN') {
        throw new HttpsError('permission-denied',
            'No se pueden crear operadores con rol ADMIN desde este formulario. Contacte al super-administrador.');
    }

    try {
        // Crear usuario en Firebase Auth
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nombre,
        });

        const uid = userRecord.uid;

        // Crear documento en operadores_c3
        await db.collection('operadores_c3').doc(uid).set({
            uid,
            nombre,
            email,
            rol,
            creadoPor: request.auth.uid,
            creadoEn: admin.firestore.FieldValue.serverTimestamp(),
            activo: true
        });

        await registrarAuditoria('OPERADOR_CREADO', request.auth.uid, null,
            `Operador: ${email} | Rol: ${rol}`);

        return { success: true, uid };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Ya existe un usuario con ese correo electrónico.');
        }
        console.error("Error creando operador C3:", error);
        throw new HttpsError('internal', error.message);
    }
});

// =============================================================================
// 6. RESETEAR DISPOSITIVO VECINO — Solo ADMIN puede hacerlo
// =============================================================================
exports.resetearDispositivoVecino = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
    }

    // Verificar que el solicitante es ADMIN
    const operadorDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN') {
        throw new HttpsError('permission-denied', 'Solo el ADMIN puede resetear dispositivos de vecinos.');
    }

    const { vecinoDni } = request.data;
    if (!vecinoDni) {
        throw new HttpsError('invalid-argument', 'Se requiere el DNI del vecino.');
    }

    try {
        const vecinoRef = db.collection('usuarios').doc(vecinoDni);
        const vecinoDoc = await vecinoRef.get();

        if (!vecinoDoc.exists) {
            throw new HttpsError('not-found', `No se encontró vecino con DNI: ${vecinoDni}`);
        }

        await vecinoRef.update({ deviceId: '' });

        await registrarAuditoria('DISPOSITIVO_RESETEADO', request.auth.uid, null,
            `DNI vecino: ${vecinoDni}`);

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("Error reseteando dispositivo:", error);
        throw new HttpsError('internal', error.message);
    }
});

// Exportaciones para testing
if (process.env.NODE_ENV === 'test') {
    exports.calculateDistance = calculateDistance;
    exports.getLabelServicio = getLabelServicio;
}
