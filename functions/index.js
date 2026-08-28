const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Tipos de servicio válidos
const TIPOS_SERVICIO_VALIDOS = ['POLICIA', 'SALUD', 'BOMBEROS'];

// Roles de operador válidos
const ROLES_OPERADOR_VALIDOS = ['ADMIN', 'POLICIA', 'SALUD', 'BOMBEROS'];

const ESTADOS_TERMINALES_RETENCION = ['RESUELTA', 'CANCELADA'];
const RETENCION_EVIDENCIA_MS = 180 * 24 * 60 * 60 * 1000;
const RETENCION_TRACKING_MS = 24 * 60 * 60 * 1000;
const UMBRALES_SLA_MS = Object.freeze({
    P1_SIN_RESPUESTA: 2 * 60 * 1000,
    COLA_SIN_UNIDAD: 10 * 60 * 1000,
    LLEGADA_DEMORADA: 20 * 60 * 1000,
    ATENCION_PROLONGADA: 120 * 60 * 1000
});
const TRACKING_PUBLICO_MAX_AGE_MS = 30 * 60 * 1000;
const ROUTE_REFRESH_MIN_MS = 30 * 1000;
const ROUTE_REFRESH_MIN_DISTANCE_M = 35;
const GOOGLE_MAPS_SERVER_API_KEY = defineSecret('GOOGLE_MAPS_SERVER_API_KEY');
const ESTADOS_CON_RUTA = ['DESPACHADA', 'COACCION'];
const PIN_HASH_ITERATIONS = 120000;

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

function hashPinLegacy(pin, dni) {
    return crypto.createHash('sha256').update(`${dni}:${pin}`, 'utf8').digest('hex');
}

function hashPin(pin, dni) {
    const salt = crypto.randomBytes(16);
    const digest = crypto.pbkdf2Sync(`${dni}:${pin}`, salt, PIN_HASH_ITERATIONS, 32, 'sha256');
    return `pbkdf2_sha256$${PIN_HASH_ITERATIONS}$${salt.toString('base64')}$${digest.toString('base64')}`;
}

function verificarPinHash(storedHash, pin, dni) {
    const stored = String(storedHash || '');
    if (/^[a-f0-9]{64}$/i.test(stored)) {
        const expected = Buffer.from(stored, 'hex');
        const actual = Buffer.from(hashPinLegacy(pin, dni), 'hex');
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }
    const [scheme, iterationsText, saltText, digestText] = stored.split('$');
    const iterations = Number(iterationsText);
    if (scheme !== 'pbkdf2_sha256' || !Number.isInteger(iterations)
        || iterations < 100000 || iterations > 1000000 || !saltText || !digestText) {
        return false;
    }
    try {
        const salt = Buffer.from(saltText, 'base64');
        const expected = Buffer.from(digestText, 'base64');
        const actual = crypto.pbkdf2Sync(`${dni}:${pin}`, salt, iterations, expected.length, 'sha256');
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    } catch (_error) {
        return false;
    }
}

function esCoordenadaValida(latitud, longitud) {
    return Number.isFinite(latitud) && latitud >= -90 && latitud <= 90
        && Number.isFinite(longitud) && longitud >= -180 && longitud <= 180
        && !(latitud === 0 && longitud === 0);
}

function calcularProgresoRuta(distanciaInicialMetros, distanciaActualMetros, progresoAnterior = 0) {
    const inicial = Number(distanciaInicialMetros);
    const actual = Number(distanciaActualMetros);
    const anterior = Number(progresoAnterior);
    if (!Number.isFinite(inicial) || inicial <= 0 || !Number.isFinite(actual) || actual < 0) {
        return Math.max(0, Math.min(99, Number.isFinite(anterior) ? Math.round(anterior) : 0));
    }
    const calculado = Math.round((1 - (actual / inicial)) * 100);
    return Math.max(
        Number.isFinite(anterior) ? Math.round(anterior) : 0,
        Math.max(0, Math.min(99, calculado))
    );
}

function debeRecalcularRuta(trackingAnterior, origen, destino, nowMs = Date.now(), force = false) {
    if (force || !trackingAnterior) return true;
    const ultima = Number(trackingAnterior.ultimaActualizacion || 0);
    if (!Number.isFinite(ultima) || nowMs - ultima >= ROUTE_REFRESH_MIN_MS) return true;
    const movimientoUnidad = calculateDistance(
        Number(trackingAnterior.patrullaLatitud), Number(trackingAnterior.patrullaLongitud),
        origen.latitud, origen.longitud
    );
    const movimientoVecino = calculateDistance(
        Number(trackingAnterior.destinoLatitud), Number(trackingAnterior.destinoLongitud),
        destino.latitud, destino.longitud
    );
    return movimientoUnidad >= ROUTE_REFRESH_MIN_DISTANCE_M
        || movimientoVecino >= ROUTE_REFRESH_MIN_DISTANCE_M;
}

async function solicitarRutaGoogle(origen, destino) {
    const apiKey = GOOGLE_MAPS_SERVER_API_KEY.value();
    if (!apiKey) throw new Error('GOOGLE_MAPS_SERVER_API_KEY no configurada');

    const params = new URLSearchParams({
        origin: `${origen.latitud},${origen.longitud}`,
        destination: `${destino.latitud},${destino.longitud}`,
        mode: 'driving',
        language: 'es',
        region: 'pe',
        key: apiKey
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`, {
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Google Directions HTTP ${response.status}`);

    const body = await response.json();
    const route = body?.routes?.[0];
    const leg = route?.legs?.[0];
    const polyline = route?.overview_polyline?.points;
    if (body?.status !== 'OK' || !route || !leg || !polyline) {
        throw new Error(`Google Directions ${body?.status || 'SIN_RUTA'}`);
    }
    return {
        distanciaMetros: Number(leg.distance?.value),
        duracionSegundos: Number(leg.duration_in_traffic?.value || leg.duration?.value),
        polyline: String(polyline)
    };
}

async function actualizarRutaDespacho(emergenciaId, force = false) {
    const emergenciaRef = db.collection('emergencias').doc(emergenciaId);
    const despachoRef = admin.database().ref(`tracking/despachos/${emergenciaId}`);
    const emergenciaSnap = await emergenciaRef.get();
    if (!emergenciaSnap.exists) {
        await despachoRef.remove();
        return { actualizado: false, motivo: 'EMERGENCIA_INEXISTENTE' };
    }

    const emergencia = emergenciaSnap.data();
    const patrullaId = String(emergencia.patrullaAsignadaId || '');
    if (!patrullaId || ESTADOS_TERMINALES_RETENCION.includes(emergencia.estado)) {
        await despachoRef.remove();
        return { actualizado: false, motivo: 'SIN_DESPACHO_ACTIVO' };
    }

    const [patrullaTrackingSnap, vecinoTrackingSnap, despachoSnap] = await Promise.all([
        admin.database().ref(`tracking/patrulleros/${patrullaId}`).once('value'),
        admin.database().ref(`tracking/emergencias/${emergenciaId}`).once('value'),
        despachoRef.once('value')
    ]);
    const patrullaTracking = patrullaTrackingSnap.val() || {};
    const vecinoTracking = vecinoTrackingSnap.val() || {};
    const despachoAnterior = despachoSnap.val() || null;

    const origen = {
        latitud: Number(patrullaTracking.latitud),
        longitud: Number(patrullaTracking.longitud)
    };
    const trackingPerteneceAlVecino = vecinoTracking.vecinoId === emergencia.vecinoId;
    const destinoTrackingValido = trackingPerteneceAlVecino
        && esCoordenadaValida(Number(vecinoTracking.latitud), Number(vecinoTracking.longitud));
    const destino = {
        latitud: destinoTrackingValido ? Number(vecinoTracking.latitud) : Number(emergencia.latitud),
        longitud: destinoTrackingValido ? Number(vecinoTracking.longitud) : Number(emergencia.longitud)
    };

    if (!esCoordenadaValida(origen.latitud, origen.longitud)
        || !esCoordenadaValida(destino.latitud, destino.longitud)) {
        return { actualizado: false, motivo: 'COORDENADAS_NO_DISPONIBLES' };
    }

    const now = Date.now();
    const enSitio = emergencia.estado === 'EN_SITIO';
    if (!enSitio && !ESTADOS_CON_RUTA.includes(emergencia.estado)) {
        return { actualizado: false, motivo: 'ESTADO_SIN_RUTA' };
    }
    if (!enSitio && !debeRecalcularRuta(despachoAnterior, origen, destino, now, force)) {
        return { actualizado: false, motivo: 'THROTTLED' };
    }

    let ruta = null;
    let errorRuta = null;
    if (!enSitio) {
        try {
            ruta = await solicitarRutaGoogle(origen, destino);
        } catch (error) {
            errorRuta = error?.message || 'RUTA_NO_DISPONIBLE';
            console.warn(`Ruta ${emergenciaId}: ${errorRuta}`);
        }
    }

    const distanciaDirecta = Math.round(calculateDistance(
        origen.latitud, origen.longitud, destino.latitud, destino.longitud
    ));
    const distanciaActual = enSitio ? 0
        : (Number.isFinite(ruta?.distanciaMetros) ? Math.round(ruta.distanciaMetros) : distanciaDirecta);
    const mismaUnidad = despachoAnterior?.patrullaId === patrullaId;
    const distanciaInicialAnterior = mismaUnidad ? Number(despachoAnterior?.distanciaInicialMetros) : NaN;
    const distanciaInicial = Number.isFinite(distanciaInicialAnterior) && distanciaInicialAnterior > 0
        ? distanciaInicialAnterior
        : Math.max(1, distanciaActual);
    const progresoPct = enSitio ? 100 : calcularProgresoRuta(
        distanciaInicial, distanciaActual, mismaUnidad ? despachoAnterior?.progresoPct : 0
    );
    const duracionSegundos = enSitio ? 0 : (Number.isFinite(ruta?.duracionSegundos)
        ? Math.max(1, Math.round(ruta.duracionSegundos))
        : Math.max(60, Math.ceil(distanciaDirecta / 9.72)));
    const etaMinutos = enSitio ? 0 : Math.max(1, Math.ceil(duracionSegundos / 60));
    const payload = {
        emergenciaId,
        vecinoId: emergencia.vecinoId,
        patrullaId,
        estado: emergencia.estado,
        patrullaLatitud: origen.latitud,
        patrullaLongitud: origen.longitud,
        destinoLatitud: destino.latitud,
        destinoLongitud: destino.longitud,
        distanciaMetros: distanciaActual,
        distanciaInicialMetros: distanciaInicial,
        duracionSegundos,
        etaMinutos,
        progresoPct,
        polyline: ruta?.polyline || '',
        rutaDisponible: Boolean(ruta?.polyline) || enSitio,
        estimadoPor: enSitio ? 'LLEGADA_CONFIRMADA' : (ruta ? 'GOOGLE_DIRECTIONS' : 'LINEA_RECTA'),
        errorRuta: errorRuta || '',
        calculadoEnMs: now,
        ubicacionPatrullaEnMs: Number(patrullaTracking.ultimaActualizacion || 0),
        ubicacionDestinoEnMs: destinoTrackingValido
            ? Number(vecinoTracking.ultimaActualizacion || 0)
            : Number(emergencia.timestampMs || 0),
        ultimaActualizacion: now
    };

    await despachoRef.transaction((actual) => {
        if (Number(actual?.calculadoEnMs || 0) > now) return;
        return payload;
    });
    await emergenciaRef.update({
        etaMinutos,
        distanciaMetros: distanciaActual,
        progresoRutaPct: progresoPct,
        rutaDisponible: payload.rutaDisponible,
        rutaActualizadaEnMs: now
    });
    return { actualizado: true, rutaDisponible: payload.rutaDisponible };
}

function validarNuevaClaveVecino(clave) {
    if (typeof clave !== 'string' || clave.length < 8 || clave.length > 128) {
        throw new HttpsError('invalid-argument', 'La nueva clave debe tener entre 8 y 128 caracteres.');
    }
    if (/\s/.test(clave)) {
        throw new HttpsError('invalid-argument', 'La nueva clave no puede contener espacios.');
    }
}

function clasificarConfirmacionLlegada(emergencia, unidadUid, unidad) {
    if (!emergencia) return 'EMERGENCIA_INEXISTENTE';
    if (!unidad) return 'UNIDAD_INEXISTENTE';
    if (emergencia.patrullaAsignadaId !== unidadUid) return 'UNIDAD_NO_ASIGNADA';
    if (unidad.tipoServicio !== emergencia.tipo) return 'SERVICIO_INCOMPATIBLE';
    if (emergencia.estado === 'EN_SITIO') return 'YA_CONFIRMADA';
    if (emergencia.estado !== 'DESPACHADA') return 'ESTADO_INVALIDO';
    if (unidad.estado !== 'EN_SERVICIO') return 'UNIDAD_NO_EN_SERVICIO';
    return 'CONFIRMAR';
}

function normalizarUbicacionEmergencia(payload = {}) {
    if (payload.ubicacionDisponible === false) {
        return { valida: true, ubicacionDisponible: false };
    }

    const latitud = Number(payload.latitud);
    const longitud = Number(payload.longitud);
    const valida = Number.isFinite(latitud) && Number.isFinite(longitud)
        && latitud >= -90 && latitud <= 90
        && longitud >= -180 && longitud <= 180
        && !(latitud === 0 && longitud === 0);

    return { valida, ubicacionDisponible: true, latitud, longitud };
}

function getPrioridadEmergencia(emergencia, esCoaccion = false) {
    if (emergencia?.prioridad === 'P1' || emergencia?.esCoaccion === true || esCoaccion) return 'P1';
    if (emergencia?.prioridad === 'P3') return 'P3';
    return 'P2';
}

function getMotivoPendienteTrasCarrera(asignada) {
    return asignada ? null : 'UNIDAD_YA_NO_DISPONIBLE';
}

function clasificarVinculoDispositivo(storedDeviceId, requestedDeviceId) {
    const requested = String(requestedDeviceId || '').trim().toLowerCase();
    const stored = String(storedDeviceId || '').trim().toLowerCase();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (!uuidPattern.test(requested)) return 'INVALIDO';
    if (!stored) return 'NUEVO';
    if (stored === requested) return 'EXISTENTE';
    return 'CONFLICTO';
}

function esEmergenciaElegibleParaPurga(emergencia, nowMs = Date.now()) {
    const horaCierreMs = Number(emergencia?.horaCierreMs);
    return ESTADOS_TERMINALES_RETENCION.includes(emergencia?.estado)
        && Number.isFinite(horaCierreMs)
        && horaCierreMs > 0
        && horaCierreMs < nowMs - RETENCION_EVIDENCIA_MS;
}

function esTrackingExpirado(ultimaActualizacionMs, nowMs = Date.now()) {
    const timestamp = Number(ultimaActualizacionMs);
    return Number.isFinite(timestamp)
        && timestamp > 0
        && timestamp < nowMs - RETENCION_TRACKING_MS;
}

function clasificarAlertaSla(emergencia, nowMs = Date.now()) {
    const estado = String(emergencia?.estado || '').toUpperCase();
    const tipo = String(emergencia?.tipo || '').toUpperCase();
    if (!TIPOS_SERVICIO_VALIDOS.includes(tipo)) return null;

    const creadaEnMs = Number(emergencia?.timestampMs || emergencia?.recibidoEnMs);
    const esP1 = emergencia?.prioridad === 'P1'
        || emergencia?.esCoaccion === true
        || estado === 'COACCION';
    const estadosPendientes = ['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION'];

    if (esP1 && estadosPendientes.includes(estado) && Number.isFinite(creadaEnMs)
        && nowMs - creadaEnMs >= UMBRALES_SLA_MS.P1_SIN_RESPUESTA) {
        return {
            codigo: 'P1_SIN_RESPUESTA', severidad: 'CRITICA', tipo,
            detectadaEnMs: creadaEnMs + UMBRALES_SLA_MS.P1_SIN_RESPUESTA
        };
    }

    if (!esP1 && estadosPendientes.includes(estado) && !emergencia?.patrullaAsignadaId
        && Number.isFinite(creadaEnMs)
        && nowMs - creadaEnMs >= UMBRALES_SLA_MS.COLA_SIN_UNIDAD) {
        return {
            codigo: 'COLA_SIN_UNIDAD', severidad: 'ALTA', tipo,
            detectadaEnMs: creadaEnMs + UMBRALES_SLA_MS.COLA_SIN_UNIDAD
        };
    }

    const horaAsignacionMs = Number(emergencia?.horaAsignacionMs || creadaEnMs);
    if (estado === 'DESPACHADA' && Number.isFinite(horaAsignacionMs)
        && nowMs - horaAsignacionMs >= UMBRALES_SLA_MS.LLEGADA_DEMORADA) {
        return {
            codigo: 'LLEGADA_DEMORADA', severidad: 'ALTA', tipo,
            detectadaEnMs: horaAsignacionMs + UMBRALES_SLA_MS.LLEGADA_DEMORADA
        };
    }

    const horaLlegadaMs = Number(emergencia?.horaLlegadaMs);
    if (estado === 'EN_SITIO' && Number.isFinite(horaLlegadaMs)
        && nowMs - horaLlegadaMs >= UMBRALES_SLA_MS.ATENCION_PROLONGADA) {
        return {
            codigo: 'ATENCION_PROLONGADA', severidad: 'MEDIA', tipo,
            detectadaEnMs: horaLlegadaMs + UMBRALES_SLA_MS.ATENCION_PROLONGADA
        };
    }

    return null;
}

function esUnidadVisiblePublicamente(unidad, nowMs = Date.now()) {
    const latitud = Number(unidad?.latitud);
    const longitud = Number(unidad?.longitud);
    const ultimaActualizacion = Number(unidad?.ultimaActualizacion);
    return ['DISPONIBLE', 'EN_SERVICIO'].includes(unidad?.estado)
        && TIPOS_SERVICIO_VALIDOS.includes(unidad?.tipoServicio)
        && Number.isFinite(latitud) && latitud >= -90 && latitud <= 90
        && Number.isFinite(longitud) && longitud >= -180 && longitud <= 180
        && !(latitud === 0 && longitud === 0)
        && Number.isFinite(ultimaActualizacion) && ultimaActualizacion > 0
        && ultimaActualizacion <= nowMs + 5 * 60 * 1000
        && nowMs - ultimaActualizacion <= TRACKING_PUBLICO_MAX_AGE_MS;
}

async function aplicarOperacionesEnLotes(operaciones, tamano = 400) {
    for (let inicio = 0; inicio < operaciones.length; inicio += tamano) {
        const batch = db.batch();
        for (const operacion of operaciones.slice(inicio, inicio + tamano)) {
            batch.set(operacion.ref, operacion.data, { merge: true });
        }
        await batch.commit();
    }
}

// =============================================================================
// 1. DESPACHO AUTOMÁTICO POR TIPO DE SERVICIO — onCreate emergencias
// =============================================================================
async function asignarUnidadCercanaLegacy(event) {
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
}

// =============================================================================
// 2. NOTIFICACIÓN AL VECINO Y LIBERACIÓN DE UNIDAD — onUpdate emergencias
// =============================================================================
async function marcarSinUnidad(emergenciaId, tipoServicio, esCoaccion, motivo) {
    const emergenciaRef = db.collection('emergencias').doc(emergenciaId);
    let actualizado = false;

    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(emergenciaRef);
        if (!snap.exists) return;
        const emergencia = snap.data();
        const estadosAsignables = ['PENDIENTE', 'COACCION', 'PENDIENTE_SIN_UNIDAD'];
        if (!estadosAsignables.includes(emergencia.estado) || emergencia.patrullaAsignadaId) return;

        const coaccionActiva = Boolean(emergencia.esCoaccion || esCoaccion);
        const prioridad = getPrioridadEmergencia(emergencia, coaccionActiva);
        transaction.update(emergenciaRef, {
            estado: 'PENDIENTE_SIN_UNIDAD',
            esCoaccion: coaccionActiva,
            prioridad,
            requiereEscalamiento: prioridad === 'P1',
            motivoPendiente: motivo,
            horaSinUnidadMs: Date.now()
        });
        actualizado = true;
    });

    if (actualizado) {
        await registrarAuditoria('SIN_UNIDADES', 'system', emergenciaId,
            `Tipo: ${tipoServicio} | Motivo: ${motivo}`);
    }
    return actualizado;
}

async function intentarAsignarUnidad(emergenciaId, emergencia) {
    const estadosAsignables = ['PENDIENTE', 'COACCION', 'PENDIENTE_SIN_UNIDAD'];
    if (!estadosAsignables.includes(emergencia.estado) || emergencia.patrullaAsignadaId) {
        return { assigned: false, reason: 'ESTADO_NO_ASIGNABLE' };
    }

    const tipoServicio = emergencia.tipo;
    const esCoaccion = emergencia.estado === 'COACCION' || emergencia.esCoaccion === true;
    if (!TIPOS_SERVICIO_VALIDOS.includes(tipoServicio)) {
        await registrarAuditoria('TIPO_INVALIDO', 'system', emergenciaId, `Tipo recibido: ${tipoServicio}`);
        return { assigned: false, reason: 'TIPO_INVALIDO' };
    }

    const eLat = emergencia.latitud;
    const eLon = emergencia.longitud;
    if (!Number.isFinite(eLat) || !Number.isFinite(eLon) || (eLat === 0 && eLon === 0)) {
        await marcarSinUnidad(emergenciaId, tipoServicio, esCoaccion, 'UBICACION_NO_DISPONIBLE');
        return { assigned: false, reason: 'UBICACION_NO_DISPONIBLE' };
    }

    try {
        const unidadesSnapshot = await db.collection('patrulleros')
            .where('estado', '==', 'DISPONIBLE')
            .where('tipoServicio', '==', tipoServicio)
            .get();

        if (unidadesSnapshot.empty) {
            await marcarSinUnidad(emergenciaId, tipoServicio, esCoaccion, 'SIN_UNIDADES_DISPONIBLES');
            return { assigned: false, reason: 'SIN_UNIDADES_DISPONIBLES' };
        }

        const unidades = unidadesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(unidad => Number.isFinite(unidad.latitud) && Number.isFinite(unidad.longitud))
            .map(unidad => ({ ...unidad, dist: calculateDistance(eLat, eLon, unidad.latitud, unidad.longitud) }))
            .sort((a, b) => a.dist - b.dist);

        if (unidades.length === 0) {
            await marcarSinUnidad(emergenciaId, tipoServicio, esCoaccion, 'UNIDADES_SIN_UBICACION');
            return { assigned: false, reason: 'UNIDADES_SIN_UBICACION' };
        }

        const candidata = unidades[0];
        const emergenciaRef = db.collection('emergencias').doc(emergenciaId);
        const unidadRef = db.collection('patrulleros').doc(candidata.id);
        let asignada = false;

        await db.runTransaction(async (transaction) => {
            const [emergenciaActual, unidadActual] = await Promise.all([
                transaction.get(emergenciaRef),
                transaction.get(unidadRef)
            ]);
            if (!emergenciaActual.exists || !unidadActual.exists) return;

            const datosEmergencia = emergenciaActual.data();
            const datosUnidad = unidadActual.data();
            if (!estadosAsignables.includes(datosEmergencia.estado)
                || datosEmergencia.patrullaAsignadaId
                || datosUnidad.estado !== 'DISPONIBLE'
                || datosUnidad.tipoServicio !== tipoServicio) return;

            transaction.update(unidadRef, { estado: 'EN_SERVICIO' });
            transaction.update(emergenciaRef, {
                patrullaAsignadaId: candidata.id,
                unidadAsignada: {
                    nombre: candidata.nombre || '',
                    unidad: candidata.unidad || '',
                    placa: candidata.placa || '',
                    telefono: candidata.telefono || '',
                    tipoServicio: candidata.tipoServicio
                },
                estado: 'DESPACHADA',
                esCoaccion,
                prioridad: getPrioridadEmergencia(datosEmergencia, esCoaccion),
                motivoPendiente: admin.firestore.FieldValue.delete(),
                requiereEscalamiento: false,
                horaAsignacionMs: Date.now()
            });
            asignada = true;
        });

        const motivoPendiente = getMotivoPendienteTrasCarrera(asignada);
        if (motivoPendiente) {
            // Otra emergencia pudo ganar la misma unidad entre la consulta y la
            // transacción. La perdedora debe entrar a la cola formal, no quedar
            // indefinidamente como PENDIENTE sin un nuevo evento que la reactive.
            await marcarSinUnidad(emergenciaId, tipoServicio, esCoaccion, motivoPendiente);
            return { assigned: false, reason: motivoPendiente };
        }

        if (candidata.tokenFCM) {
            await messaging.send({
                token: candidata.tokenFCM,
                data: {
                    emergenciaId,
                    tipo: tipoServicio,
                    coaccion: esCoaccion ? 'true' : 'false',
                    accion: 'NUEVA_EMERGENCIA'
                },
                android: { priority: 'high' }
            });
        }

        await registrarAuditoria('DESPACHO_AUTOMATICO', 'system', emergenciaId,
            `Tipo: ${tipoServicio} | Asignado: ${candidata.id} | Distancia: ${(candidata.dist / 1000).toFixed(2)} km`);
        return { assigned: true, unidadId: candidata.id };
    } catch (error) {
        console.error('Error en despacho automatico:', error);
        await registrarAuditoria('ERROR_DESPACHO', 'system', emergenciaId, error.message);
        return { assigned: false, reason: 'ERROR_DESPACHO' };
    }
}

exports.asignarUnidadCercana = onDocumentCreated('emergencias/{emergenciaId}', async (event) => {
    const emergenciaId = event.params.emergenciaId;
    const emergencia = event.data.data();
    const vecino = await findUsuarioForEmergencia(emergencia);
    if (vecino) {
        emergencia.vecinoNombre = vecino.nombre || '';
        await db.collection('emergencias').doc(emergenciaId).update({
            vecinoNombre: emergencia.vecinoNombre,
            recibidoEnMs: Date.now()
        });
    }
    return intentarAsignarUnidad(emergenciaId, emergencia);
});

exports.reintentarDespachoAlLiberarUnidad = onDocumentUpdated('patrulleros/{patrulleroId}', async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.estado === 'DISPONIBLE' || after.estado !== 'DISPONIBLE' || !TIPOS_SERVICIO_VALIDOS.includes(after.tipoServicio)) {
        return null;
    }

    const pendientes = await db.collection('emergencias')
        .where('tipo', '==', after.tipoServicio)
        .where('estado', '==', 'PENDIENTE_SIN_UNIDAD')
        .orderBy('prioridad', 'asc')
        .orderBy('timestampMs', 'asc')
        .limit(10)
        .get();

    for (const emergencia of pendientes.docs) {
        const result = await intentarAsignarUnidad(emergencia.id, emergencia.data());
        if (result.assigned) return result;
    }
    return null;
});

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
                    case 'PENDIENTE_SIN_UNIDAD':
                        titulo = 'Alerta recibida';
                        cuerpo = 'El servicio fue notificado. Aún no hay una unidad disponible; el caso permanece en atención.';
                        break;
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

exports.sincronizarRutaDespachoPorUnidad = onValueWritten({
    ref: 'tracking/patrulleros/{unidadId}',
    secrets: [GOOGLE_MAPS_SERVER_API_KEY]
}, async (event) => {
    if (!event.data.after.exists()) return null;
    const unidadId = event.params.unidadId;
    const emergencias = await db.collection('emergencias')
        .where('patrullaAsignadaId', '==', unidadId)
        .limit(20)
        .get();
    const activas = emergencias.docs.filter((doc) =>
        [...ESTADOS_CON_RUTA, 'EN_SITIO'].includes(doc.data().estado));
    return Promise.all(activas.map((doc) => actualizarRutaDespacho(doc.id)));
});

exports.sincronizarRutaDespachoPorVecino = onValueWritten({
    ref: 'tracking/emergencias/{emergenciaId}',
    secrets: [GOOGLE_MAPS_SERVER_API_KEY]
}, async (event) => {
    if (!event.data.after.exists()) return null;
    return actualizarRutaDespacho(event.params.emergenciaId);
});

exports.sincronizarRutaDespachoPorEmergencia = onDocumentWritten({
    document: 'emergencias/{emergenciaId}',
    secrets: [GOOGLE_MAPS_SERVER_API_KEY]
}, async (event) => {
    const emergenciaId = event.params.emergenciaId;
    if (!event.data.after.exists) {
        await admin.database().ref(`tracking/despachos/${emergenciaId}`).remove();
        return null;
    }
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.data();
    const cambioRelevante = !event.data.before.exists
        || before.estado !== after.estado
        || before.patrullaAsignadaId !== after.patrullaAsignadaId
        || before.latitud !== after.latitud
        || before.longitud !== after.longitud;
    if (!cambioRelevante) return null;
    return actualizarRutaDespacho(emergenciaId, true);
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
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN' || operadorDoc.data().activo === false) {
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

    if (password.length < 8) {
        throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 8 caracteres.');
    }

    let createdUid = null;
    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nombre,
        });

        const uid = userRecord.uid;
        createdUid = uid;
        await admin.auth().setCustomUserClaims(uid, {
            role: 'PATRULLERO',
            tipoServicio
        });

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
        if (createdUid) await db.collection('patrulleros').doc(createdUid).delete().catch(() => null);
        if (createdUid) await admin.auth().deleteUser(createdUid).catch(() => null);
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
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN' || operadorDoc.data().activo === false) {
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
        const patrulleroActual = await db.collection('patrulleros').doc(uid).get();
        if (!patrulleroActual.exists) throw new HttpsError('not-found', 'La unidad no existe.');
        if (patrulleroActual.data().estado === 'EN_SERVICIO'
            && patrulleroActual.data().tipoServicio !== tipoServicio) {
            throw new HttpsError('failed-precondition', 'No se puede cambiar el servicio de una unidad durante una atención.');
        }
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
        await admin.auth().setCustomUserClaims(uid, { role: 'PATRULLERO', tipoServicio });

        await registrarAuditoria('PATRULLERO_EDITADO', request.auth.uid, null, `Editado: ${unidad} (${tipoServicio})`);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
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
    if (!solicitanteDoc.exists || solicitanteDoc.data().rol !== 'ADMIN' || solicitanteDoc.data().activo === false) {
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

    let createdUid = null;
    try {
        // Crear usuario en Firebase Auth
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nombre,
        });

        const uid = userRecord.uid;
        createdUid = uid;
        await admin.auth().setCustomUserClaims(uid, { role: rol });

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
        if (createdUid) await db.collection('operadores_c3').doc(createdUid).delete().catch(() => null);
        if (createdUid) await admin.auth().deleteUser(createdUid).catch(() => null);
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
exports.crearVecino = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como administrador C3.');
    }

    const operadorDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN' || operadorDoc.data().activo === false) {
        throw new HttpsError('permission-denied', 'Solo C3-DIOS puede registrar vecinos.');
    }

    const { nombre, dni, telefono, direccion, claveTemporal, pinNormal, pinCoaccion,
        correo = '', fechaNacimiento = '', contactoEmergenciaNombre = '', contactoEmergenciaTelefono = '' } = request.data;
    const cleanDni = String(dni || '').trim();
    const cleanPhone = String(telefono || '').trim();

    if (!nombre || !/^\d{8}$/.test(cleanDni) || !/^9\d{8}$/.test(cleanPhone) || !direccion
        || !claveTemporal || !/^\d{4}$/.test(String(pinNormal)) || !/^\d{4}$/.test(String(pinCoaccion))) {
        throw new HttpsError('invalid-argument', 'Los datos del vecino, clave temporal y PINes no son válidos.');
    }
    if (String(claveTemporal).length < 8) {
        throw new HttpsError('invalid-argument', 'La clave temporal debe tener al menos 8 caracteres.');
    }
    if (String(pinNormal) === String(pinCoaccion)) {
        throw new HttpsError('invalid-argument', 'El PIN de coacción debe ser distinto al PIN normal.');
    }

    const vecinoRef = db.collection('usuarios').doc(cleanDni);
    if ((await vecinoRef.get()).exists) {
        throw new HttpsError('already-exists', 'Ya existe un vecino registrado con ese DNI.');
    }

    const authEmail = `vecino.${cleanDni}@c3-chaclacayo.local`;
    let createdUid = null;
    try {
        const userRecord = await admin.auth().createUser({
            email: authEmail,
            password: String(claveTemporal),
            displayName: String(nombre).trim(),
            disabled: false
        });
        createdUid = userRecord.uid;
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'VECINO' });

        await vecinoRef.set({
            uid: userRecord.uid,
            nombre: String(nombre).trim(),
            dni: cleanDni,
            telefono: cleanPhone,
            direccion: String(direccion).trim(),
            correo: String(correo).trim(),
            fechaNacimiento: String(fechaNacimiento).trim(),
            contactoEmergenciaNombre: String(contactoEmergenciaNombre).trim(),
            contactoEmergenciaTelefono: String(contactoEmergenciaTelefono).trim(),
            pinNormal: hashPin(String(pinNormal), cleanDni),
            pinCoaccion: hashPin(String(pinCoaccion), cleanDni),
            deviceId: '',
            tokenFCM: '',
            creadoEnMs: Date.now(),
            creadoPor: request.auth.uid,
            activo: true,
            debeCambiarClave: true,
            requiereProvisionAcceso: false,
            versionEsquema: 2
        });

        await registrarAuditoria('VECINO_CREADO', request.auth.uid, null, `DNI: ${cleanDni}`);
        return { success: true, uid: userRecord.uid };
    } catch (error) {
        if (createdUid) await vecinoRef.delete().catch(() => null);
        if (createdUid) await admin.auth().deleteUser(createdUid).catch(() => null);
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Ya existe una cuenta para este vecino.');
        }
        console.error('Error creando vecino:', error);
        throw new HttpsError('internal', error.message);
    }
});

exports.provisionarAccesoVecino = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como administrador C3.');
    }
    const operadorDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN' || operadorDoc.data().activo === false) {
        throw new HttpsError('permission-denied', 'Solo C3-DIOS puede provisionar accesos.');
    }

    const dni = String(request.data?.dni || '').trim();
    const claveTemporal = String(request.data?.claveTemporal || '');
    if (!/^\d{8}$/.test(dni) || claveTemporal.length < 8) {
        throw new HttpsError('invalid-argument', 'DNI o clave temporal no válidos.');
    }

    const vecinoRef = db.collection('usuarios').doc(dni);
    const vecinoSnap = await vecinoRef.get();
    if (!vecinoSnap.exists) {
        throw new HttpsError('not-found', 'El vecino no existe.');
    }

    const authEmail = `vecino.${dni}@c3-chaclacayo.local`;
    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(authEmail);
        userRecord = await admin.auth().updateUser(userRecord.uid, {
            password: claveTemporal,
            disabled: false,
            displayName: vecinoSnap.data().nombre || dni
        });
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        userRecord = await admin.auth().createUser({
            email: authEmail,
            password: claveTemporal,
            disabled: false,
            displayName: vecinoSnap.data().nombre || dni
        });
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'VECINO' });
    await vecinoRef.update({
        uid: userRecord.uid,
        activo: true,
        deviceId: '',
        debeCambiarClave: true,
        requiereProvisionAcceso: false,
        versionEsquema: 2,
        accesoProvisionadoEnMs: Date.now(),
        accesoProvisionadoPor: request.auth.uid
    });
    await registrarAuditoria('ACCESO_VECINO_PROVISIONADO', request.auth.uid, null, `DNI: ${dni}`);
    return { success: true, uid: userRecord.uid };
});

async function exigirAdministradorActivo(request, mensaje) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como administrador C3.');
    }
    const operadorDoc = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorDoc.exists || operadorDoc.data().rol !== 'ADMIN' || operadorDoc.data().activo === false) {
        throw new HttpsError('permission-denied', mensaje || 'Solo C3-DIOS puede realizar esta operación.');
    }
}

exports.editarVecino = onCall(async (request) => {
    await exigirAdministradorActivo(request, 'Solo C3-DIOS puede editar vecinos.');

    const dni = String(request.data?.dni || '').trim();
    const nombre = String(request.data?.nombre || '').trim().slice(0, 120);
    const telefono = String(request.data?.telefono || '').trim();
    const direccion = String(request.data?.direccion || '').trim().slice(0, 250);
    const correo = String(request.data?.correo || '').trim().slice(0, 160);
    const fechaNacimiento = String(request.data?.fechaNacimiento || '').trim().slice(0, 10);
    const contactoEmergenciaNombre = String(request.data?.contactoEmergenciaNombre || '').trim().slice(0, 120);
    const contactoEmergenciaTelefono = String(request.data?.contactoEmergenciaTelefono || '').trim();

    if (!/^\d{8}$/.test(dni) || !nombre || !/^9\d{8}$/.test(telefono) || !direccion) {
        throw new HttpsError('invalid-argument', 'DNI, nombre, teléfono o dirección no válidos.');
    }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        throw new HttpsError('invalid-argument', 'El correo electrónico no es válido.');
    }
    if (contactoEmergenciaTelefono && !/^9\d{8}$/.test(contactoEmergenciaTelefono)) {
        throw new HttpsError('invalid-argument', 'El teléfono del contacto de emergencia no es válido.');
    }

    const vecinoRef = db.collection('usuarios').doc(dni);
    const vecinoSnap = await vecinoRef.get();
    if (!vecinoSnap.exists) throw new HttpsError('not-found', 'El vecino no existe.');

    await vecinoRef.update({
        nombre,
        telefono,
        direccion,
        correo,
        fechaNacimiento,
        contactoEmergenciaNombre,
        contactoEmergenciaTelefono,
        actualizadoEnMs: Date.now(),
        actualizadoPor: request.auth.uid
    });
    if (vecinoSnap.data().uid) {
        await admin.auth().updateUser(vecinoSnap.data().uid, { displayName: nombre }).catch(() => null);
    }
    await registrarAuditoria('VECINO_EDITADO', request.auth.uid, null, `DNI: ${dni}`);
    return { success: true };
});

exports.desactivarVecino = onCall(async (request) => {
    await exigirAdministradorActivo(request, 'Solo C3-DIOS puede desactivar vecinos.');

    const dni = String(request.data?.dni || '').trim();
    const motivo = String(request.data?.motivo || '').trim().slice(0, 500);
    if (!/^\d{8}$/.test(dni) || motivo.length < 5) {
        throw new HttpsError('invalid-argument', 'Se requiere un DNI válido y un motivo de al menos 5 caracteres.');
    }

    const vecinoRef = db.collection('usuarios').doc(dni);
    const [vecinoSnap, emergenciasSnap] = await Promise.all([
        vecinoRef.get(),
        db.collection('emergencias').where('vecinoDni', '==', dni).limit(50).get()
    ]);
    if (!vecinoSnap.exists) throw new HttpsError('not-found', 'El vecino no existe.');

    const estadosActivos = new Set(['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION', 'DESPACHADA', 'EN_SITIO', 'ESCALADA']);
    if (emergenciasSnap.docs.some((doc) => estadosActivos.has(doc.data().estado))) {
        throw new HttpsError('failed-precondition', 'El vecino tiene una emergencia activa. Debe cerrarse antes de desactivar su cuenta.');
    }

    const uid = vecinoSnap.data().uid;
    if (uid) await admin.auth().updateUser(uid, { disabled: true });
    await vecinoRef.update({
        activo: false,
        deviceId: '',
        tokenFCM: '',
        desactivadoEnMs: Date.now(),
        desactivadoPor: request.auth.uid,
        motivoDesactivacion: motivo
    });
    await registrarAuditoria('VECINO_DESACTIVADO', request.auth.uid, null, `DNI: ${dni} | Motivo: ${motivo}`);
    return { success: true };
});

const TRANSICIONES_OPERADOR = {
    MARCAR_EN_SITIO: { desde: ['DESPACHADA'], hacia: 'EN_SITIO' },
    RESOLVER: { desde: ['EN_SITIO', 'ESCALADA'], hacia: 'RESUELTA', requiereMotivo: true },
    CANCELAR: {
        desde: ['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION', 'DESPACHADA', 'EN_SITIO', 'ESCALADA'],
        hacia: 'CANCELADA',
        requiereMotivo: true
    },
    FALSA_ALARMA: {
        desde: ['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION', 'DESPACHADA', 'EN_SITIO'],
        hacia: 'CANCELADA',
        requiereMotivo: true
    },
    ESCALAR: {
        desde: ['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION'],
        hacia: 'ESCALADA',
        requiereMotivo: true
    }
};

exports.gestionarEmergencia = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como operador C3.');
    }

    const operadorSnap = await db.collection('operadores_c3').doc(request.auth.uid).get();
    if (!operadorSnap.exists || operadorSnap.data().activo === false) {
        throw new HttpsError('permission-denied', 'La cuenta no es un operador C3 activo.');
    }

    const operador = operadorSnap.data();
    const emergenciaId = String(request.data?.emergenciaId || '').trim();
    const accion = String(request.data?.accion || '').trim().toUpperCase();
    const unidadId = String(request.data?.unidadId || '').trim();
    const motivo = String(request.data?.motivo || '').trim().slice(0, 500);
    const etaMinutos = Number(request.data?.etaMinutos);
    if (!emergenciaId || !accion) {
        throw new HttpsError('invalid-argument', 'Se requiere emergenciaId y acción.');
    }

    const emergenciaRef = db.collection('emergencias').doc(emergenciaId);
    let tokenUnidad = null;
    let tipoEmergencia = null;
    let esCoaccion = false;
    let estadoFinal = null;

    await db.runTransaction(async (transaction) => {
        const emergenciaSnap = await transaction.get(emergenciaRef);
        if (!emergenciaSnap.exists) {
            throw new HttpsError('not-found', 'La emergencia no existe.');
        }

        const emergencia = emergenciaSnap.data();
        tipoEmergencia = emergencia.tipo;
        esCoaccion = emergencia.estado === 'COACCION' || emergencia.esCoaccion === true;
        if (operador.rol !== 'ADMIN' && operador.rol !== emergencia.tipo) {
            throw new HttpsError('permission-denied', 'El operador no pertenece al servicio de esta emergencia.');
        }

        if (accion === 'ACTUALIZAR_ETA') {
            if (!['DESPACHADA', 'EN_SITIO'].includes(emergencia.estado)
                || !Number.isInteger(etaMinutos) || etaMinutos < 1 || etaMinutos > 240) {
                throw new HttpsError('invalid-argument', 'El ETA no es válido para el estado actual.');
            }
            transaction.update(emergenciaRef, {
                etaMinutos,
                ultimaActualizacionMs: Date.now()
            });
            estadoFinal = emergencia.estado;
            return;
        }

        if (accion === 'ASIGNAR') {
            if (!unidadId) {
                throw new HttpsError('invalid-argument', 'Debe seleccionar una unidad.');
            }
            if (!['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION'].includes(emergencia.estado)
                || emergencia.patrullaAsignadaId) {
                throw new HttpsError('failed-precondition', 'La emergencia ya no admite asignación.');
            }

            const unidadRef = db.collection('patrulleros').doc(unidadId);
            const unidadSnap = await transaction.get(unidadRef);
            if (!unidadSnap.exists) {
                throw new HttpsError('not-found', 'La unidad seleccionada no existe.');
            }
            const unidad = unidadSnap.data();
            if (unidad.estado !== 'DISPONIBLE' || unidad.tipoServicio !== emergencia.tipo) {
                throw new HttpsError('failed-precondition', 'La unidad no está disponible o no corresponde al servicio.');
            }

            transaction.update(unidadRef, { estado: 'EN_SERVICIO' });
            transaction.update(emergenciaRef, {
                estado: 'DESPACHADA',
                patrullaAsignadaId: unidadId,
                unidadAsignada: {
                    nombre: unidad.nombre || '',
                    unidad: unidad.unidad || '',
                    placa: unidad.placa || '',
                    telefono: unidad.telefono || '',
                    tipoServicio: unidad.tipoServicio
                },
                esCoaccion,
                prioridad: getPrioridadEmergencia(emergencia, esCoaccion),
                horaAsignacionMs: Date.now(),
                gestionadoPor: request.auth.uid,
                ultimaActualizacionMs: Date.now(),
                motivoPendiente: admin.firestore.FieldValue.delete(),
                requiereEscalamiento: false
            });
            tokenUnidad = unidad.tokenFCM || null;
            estadoFinal = 'DESPACHADA';
            return;
        }

        const transicion = TRANSICIONES_OPERADOR[accion];
        if (!transicion) {
            throw new HttpsError('invalid-argument', 'Acción operativa no reconocida.');
        }
        if (!transicion.desde.includes(emergencia.estado)) {
            throw new HttpsError('failed-precondition',
                `No se permite ${accion} desde el estado ${emergencia.estado}.`);
        }
        if (transicion.requiereMotivo && motivo.length < 5) {
            throw new HttpsError('invalid-argument', 'Debe registrar un motivo de al menos 5 caracteres.');
        }
        if (accion === 'ESCALAR' && emergencia.patrullaAsignadaId) {
            throw new HttpsError('failed-precondition', 'Una emergencia con unidad asignada no puede escalarse con este flujo.');
        }

        const cambios = {
            estado: transicion.hacia,
            gestionadoPor: request.auth.uid,
            ultimaActualizacionMs: Date.now()
        };
        if (motivo && accion === 'ESCALAR') cambios.motivoEscalamiento = motivo;
        if (motivo && accion !== 'ESCALAR') cambios.motivoCierre = motivo;
        if (accion === 'FALSA_ALARMA') cambios.esFalsaAlarma = true;
        if (accion === 'ESCALAR') {
            cambios.horaEscalamientoMs = Date.now();
            cambios.requiereEscalamiento = false;
        }
        if (accion === 'MARCAR_EN_SITIO') cambios.horaLlegadaMs = Date.now();
        if (accion === 'RESOLVER' || accion === 'CANCELAR' || accion === 'FALSA_ALARMA') {
            cambios.horaCierreMs = Date.now();
        }
        transaction.update(emergenciaRef, cambios);
        estadoFinal = transicion.hacia;
    });

    if (accion === 'ASIGNAR' && tokenUnidad) {
        await messaging.send({
            token: tokenUnidad,
            data: {
                emergenciaId,
                tipo: tipoEmergencia || '',
                coaccion: esCoaccion ? 'true' : 'false',
                accion: 'NUEVA_EMERGENCIA'
            },
            android: { priority: 'high' }
        });
    }

    await registrarAuditoria(`EMERGENCIA_${accion}`, request.auth.uid, emergenciaId,
        `Estado final: ${estadoFinal}${motivo ? ` | Motivo: ${motivo}` : ''}`);
    return { success: true, estado: estadoFinal };
});

exports.confirmarLlegadaUnidad = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión como unidad.');

    const emergenciaId = String(request.data?.emergenciaId || '').trim();
    if (!emergenciaId || emergenciaId.length > 160) {
        throw new HttpsError('invalid-argument', 'Se requiere un identificador de emergencia válido.');
    }

    const unidadUid = request.auth.uid;
    const unidadRef = db.collection('patrulleros').doc(unidadUid);
    const emergenciaRef = db.collection('emergencias').doc(emergenciaId);
    const auditoriaRef = db.collection('auditoria').doc();
    let yaConfirmada = false;

    await db.runTransaction(async (transaction) => {
        const unidadSnap = await transaction.get(unidadRef);
        const emergenciaSnap = await transaction.get(emergenciaRef);
        const clasificacion = clasificarConfirmacionLlegada(
            emergenciaSnap.exists ? emergenciaSnap.data() : null,
            unidadUid,
            unidadSnap.exists ? unidadSnap.data() : null
        );

        if (clasificacion === 'EMERGENCIA_INEXISTENTE') {
            throw new HttpsError('not-found', 'La emergencia no existe.');
        }
        if (clasificacion === 'UNIDAD_INEXISTENTE') {
            throw new HttpsError('permission-denied', 'La cuenta no corresponde a una unidad.');
        }
        if (clasificacion === 'UNIDAD_NO_ASIGNADA' || clasificacion === 'SERVICIO_INCOMPATIBLE') {
            throw new HttpsError('permission-denied', 'La unidad no está asignada a esta emergencia.');
        }
        if (clasificacion === 'ESTADO_INVALIDO' || clasificacion === 'UNIDAD_NO_EN_SERVICIO') {
            throw new HttpsError('failed-precondition', 'La emergencia o la unidad ya no admite confirmar llegada.');
        }
        if (clasificacion === 'YA_CONFIRMADA') {
            yaConfirmada = true;
            return;
        }

        const now = Date.now();
        transaction.update(emergenciaRef, {
            estado: 'EN_SITIO',
            horaLlegadaMs: now,
            ultimaActualizacionMs: now,
            gestionadoPor: unidadUid
        });
        transaction.set(auditoriaRef, {
            accion: 'UNIDAD_EN_SITIO',
            ejecutadoPor: unidadUid,
            emergenciaId,
            detalles: 'Estado final: EN_SITIO',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    return { success: true, estado: 'EN_SITIO', idempotente: yaConfirmada };
});

exports.actualizarDisponibilidadUnidad = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión como unidad.');
    const unidadRef = db.collection('patrulleros').doc(request.auth.uid);
    const unidadSnap = await unidadRef.get();
    if (!unidadSnap.exists) throw new HttpsError('permission-denied', 'La cuenta no corresponde a una unidad.');

    const nuevoEstado = String(request.data?.estado || '').trim().toUpperCase();
    const motivo = String(request.data?.motivo || '').trim().slice(0, 250);
    if (!['DISPONIBLE', 'FUERA_DE_SERVICIO'].includes(nuevoEstado)) {
        throw new HttpsError('invalid-argument', 'La unidad solo puede declararse disponible o fuera de servicio.');
    }
    if (nuevoEstado === 'FUERA_DE_SERVICIO' && motivo.length < 5) {
        throw new HttpsError('invalid-argument', 'Debe indicar el motivo de salida de servicio.');
    }

    const asignadasSnap = await db.collection('emergencias')
        .where('patrullaAsignadaId', '==', request.auth.uid).limit(20).get();
    const emergenciaActiva = asignadasSnap.docs.find((doc) =>
        ['DESPACHADA', 'EN_SITIO'].includes(doc.data().estado));
    if (nuevoEstado === 'DISPONIBLE' && emergenciaActiva) {
        throw new HttpsError('failed-precondition', 'La unidad no puede quedar disponible mientras atiende una emergencia.');
    }

    let emergenciaLiberada = null;
    await db.runTransaction(async (transaction) => {
        const unidadActual = await transaction.get(unidadRef);
        if (!unidadActual.exists) throw new HttpsError('not-found', 'La unidad ya no existe.');

        if (emergenciaActiva && nuevoEstado === 'FUERA_DE_SERVICIO') {
            const emergenciaActual = await transaction.get(emergenciaActiva.ref);
            if (emergenciaActual.exists
                && emergenciaActual.data().patrullaAsignadaId === request.auth.uid
                && ['DESPACHADA', 'EN_SITIO'].includes(emergenciaActual.data().estado)) {
                const data = emergenciaActual.data();
                transaction.update(emergenciaActiva.ref, {
                    estado: 'PENDIENTE_SIN_UNIDAD',
                    patrullaAsignadaId: admin.firestore.FieldValue.delete(),
                    unidadAsignada: admin.firestore.FieldValue.delete(),
                    motivoPendiente: 'UNIDAD_FUERA_DE_SERVICIO',
                    detalleMotivoPendiente: motivo,
                    horaSinUnidadMs: Date.now(),
                    requiereEscalamiento: getPrioridadEmergencia(data) === 'P1',
                    ultimaActualizacionMs: Date.now()
                });
                emergenciaLiberada = {
                    id: emergenciaActiva.id,
                    data: { ...data, estado: 'PENDIENTE_SIN_UNIDAD', patrullaAsignadaId: null }
                };
            }
        }
        transaction.update(unidadRef, { estado: nuevoEstado, ultimaActualizacion: Date.now() });
    });

    await registrarAuditoria('DISPONIBILIDAD_UNIDAD', request.auth.uid,
        emergenciaLiberada?.id || null, `Estado: ${nuevoEstado}${motivo ? ` | Motivo: ${motivo}` : ''}`);
    if (emergenciaLiberada) await intentarAsignarUnidad(emergenciaLiberada.id, emergenciaLiberada.data);
    return { success: true, estado: nuevoEstado, emergenciaLiberada: emergenciaLiberada?.id || null };
});

exports.obtenerUnidadesPublicas = onCall(async (request) => {
    const token = String(request.data?.token || '').trim();
    if (token.length < 10 || token.length > 128) {
        throw new HttpsError('invalid-argument', 'El enlace público no es válido.');
    }

    const enlaceSnap = await db.collection('enlaces_publicos').doc(token).get();
    if (!enlaceSnap.exists) {
        throw new HttpsError('not-found', 'El enlace público no existe.');
    }
    const enlace = enlaceSnap.data();
    const createdAtMs = Number(enlace.createdAt || 0);
    const expiresAtMs = Number(enlace.expiresAtMs || (createdAtMs + 8 * 60 * 60 * 1000));
    if (enlace.activo === false || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        throw new HttpsError('permission-denied', 'El enlace público expiró o fue revocado.');
    }

    const [unidadesSnap, trackingSnap] = await Promise.all([
        db.collection('patrulleros').get(),
        admin.database().ref('tracking/patrulleros').once('value')
    ]);
    const tracking = trackingSnap.val() || {};
    const unidades = unidadesSnap.docs
        .map((doc) => {
            const unidad = doc.data();
            const ubicacion = tracking[doc.id] || unidad;
            return {
                id: crypto.createHash('sha256').update(`${token}:${doc.id}`).digest('hex').slice(0, 16),
                tipoServicio: unidad.tipoServicio,
                estado: unidad.estado,
                latitud: Number(ubicacion.latitud),
                longitud: Number(ubicacion.longitud),
                ultimaActualizacion: Number(ubicacion.ultimaActualizacion || unidad.ultimaActualizacion || 0)
            };
        })
        .filter((unidad) => esUnidadVisiblePublicamente(unidad));

    return { unidades, expiresAtMs };
});

exports.gestionarEnlacePublico = onCall(async (request) => {
    await exigirAdministradorActivo(request, 'Solo C3-DIOS puede administrar enlaces públicos.');
    const accion = String(request.data?.accion || '').trim().toUpperCase();

    if (accion === 'CREAR') {
        const token = crypto.randomBytes(24).toString('hex');
        const createdAt = Date.now();
        const expiresAtMs = createdAt + 8 * 60 * 60 * 1000;
        const nuevoEnlaceRef = db.collection('enlaces_publicos').doc(token);
        await db.runTransaction(async (transaction) => {
            const activos = await transaction.get(
                db.collection('enlaces_publicos').where('activo', '==', true).limit(100));
            for (const enlaceActivo of activos.docs) {
                transaction.update(enlaceActivo.ref, {
                    activo: false,
                    revocadoEnMs: createdAt,
                    revocadoPor: request.auth.uid,
                    motivoRevocacion: 'REEMPLAZADO_POR_NUEVO_ENLACE'
                });
            }
            transaction.set(nuevoEnlaceRef, {
                activo: true,
                createdAt,
                expiresAtMs,
                creadoPor: request.auth.uid
            });
        });
        await registrarAuditoria('ENLACE_PUBLICO_CREADO', request.auth.uid, null,
            `Token: ${token.slice(0, 8)}... | Expira: ${expiresAtMs}`);
        return { success: true, token, expiresAtMs };
    }

    if (accion === 'REVOCAR') {
        const token = String(request.data?.token || '').trim();
        if (token.length < 10 || token.length > 128) {
            throw new HttpsError('invalid-argument', 'El token no es válido.');
        }
        const enlaceRef = db.collection('enlaces_publicos').doc(token);
        if (!(await enlaceRef.get()).exists) throw new HttpsError('not-found', 'El enlace no existe.');
        await enlaceRef.update({
            activo: false,
            revocadoEnMs: Date.now(),
            revocadoPor: request.auth.uid
        });
        await registrarAuditoria('ENLACE_PUBLICO_REVOCADO', request.auth.uid, null,
            `Token: ${token.slice(0, 8)}...`);
        return { success: true };
    }

    throw new HttpsError('invalid-argument', 'Acción de enlace público no reconocida.');
});

exports.crearCuadrante = onCall(async (request) => {
    await exigirAdministradorActivo(request, 'Solo C3-DIOS puede crear cuadrantes.');
    const nombre = String(request.data?.nombre || '').trim().slice(0, 80);
    const path = request.data?.path;
    if (!nombre || !Array.isArray(path) || path.length < 3 || path.length > 100) {
        throw new HttpsError('invalid-argument', 'El cuadrante requiere nombre y entre 3 y 100 puntos.');
    }
    const puntos = path.map((punto) => ({ lat: Number(punto?.lat), lng: Number(punto?.lng) }));
    if (puntos.some((punto) => !Number.isFinite(punto.lat) || !Number.isFinite(punto.lng)
        || punto.lat < -90 || punto.lat > 90 || punto.lng < -180 || punto.lng > 180)) {
        throw new HttpsError('invalid-argument', 'El cuadrante contiene coordenadas no válidas.');
    }
    const ref = await db.collection('cuadrantes').add({
        nombre,
        path: puntos,
        creadoEnMs: Date.now(),
        creadoPor: request.auth.uid
    });
    await registrarAuditoria('CUADRANTE_CREADO', request.auth.uid, null,
        `Cuadrante: ${ref.id} | Nombre: ${nombre} | Puntos: ${puntos.length}`);
    return { success: true, id: ref.id };
});

exports.sincronizarClaimsSesion = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión.');
    }
    const uid = request.auth.uid;
    const [operadorSnap, patrulleroSnap, vecinoQuery] = await Promise.all([
        db.collection('operadores_c3').doc(uid).get(),
        db.collection('patrulleros').doc(uid).get(),
        db.collection('usuarios').where('uid', '==', uid).limit(1).get()
    ]);

    let claims = null;
    if (operadorSnap.exists && operadorSnap.data().activo !== false) {
        claims = { role: operadorSnap.data().rol };
    } else if (patrulleroSnap.exists) {
        claims = { role: 'PATRULLERO', tipoServicio: patrulleroSnap.data().tipoServicio };
    } else if (!vecinoQuery.empty && vecinoQuery.docs[0].data().activo !== false) {
        claims = { role: 'VECINO' };
    }

    if (!claims) {
        throw new HttpsError('permission-denied', 'La cuenta no tiene un perfil activo.');
    }
    await admin.auth().setCustomUserClaims(uid, claims);
    return { success: true, ...claims };
});

exports.vincularDispositivoVecino = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como vecino.');
    }

    const deviceId = String(request.data?.deviceId || '').trim().toLowerCase();
    if (clasificarVinculoDispositivo('', deviceId) === 'INVALIDO') {
        throw new HttpsError('invalid-argument', 'El identificador del dispositivo no es válido.');
    }

    const vecinoQuery = await db.collection('usuarios')
        .where('uid', '==', request.auth.uid)
        .limit(1)
        .get();
    if (vecinoQuery.empty) {
        throw new HttpsError('permission-denied', 'La sesión no pertenece a un vecino registrado.');
    }

    const vecinoRef = vecinoQuery.docs[0].ref;
    let nuevoVinculo = false;
    await db.runTransaction(async (transaction) => {
        const vecinoSnap = await transaction.get(vecinoRef);
        if (!vecinoSnap.exists || vecinoSnap.data().activo === false) {
            throw new HttpsError('permission-denied', 'La cuenta vecinal no está activa.');
        }

        const estadoVinculo = clasificarVinculoDispositivo(vecinoSnap.data().deviceId, deviceId);
        if (estadoVinculo === 'CONFLICTO') {
            throw new HttpsError('failed-precondition',
                'Esta cuenta ya está vinculada a otro dispositivo. Contacte a la central.');
        }
        if (estadoVinculo === 'NUEVO') {
            transaction.update(vecinoRef, {
                deviceId,
                dispositivoVinculadoEnMs: Date.now(),
                dispositivoVinculadoPor: request.auth.uid
            });
            nuevoVinculo = true;
        }
    });

    if (nuevoVinculo) {
        await registrarAuditoria('DISPOSITIVO_VECINO_VINCULADO', request.auth.uid, null,
            `DNI: ${vecinoRef.id}`);
    }
    return { success: true, nuevoVinculo };
});

exports.crearEmergenciaVecino = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como vecino.');
    }

    const emergenciaId = String(request.data?.id || '').trim().toLowerCase();
    const deviceId = String(request.data?.deviceId || '').trim().toLowerCase();
    const tipo = String(request.data?.tipo || '').trim().toUpperCase();
    const estado = String(request.data?.estado || '').trim().toUpperCase();
    const ubicacion = normalizarUbicacionEmergencia(request.data);
    const timestampClienteMs = Number(request.data?.timestampMs);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    if (!uuidPattern.test(emergenciaId)) {
        throw new HttpsError('invalid-argument', 'El identificador de emergencia no es válido.');
    }
    if (clasificarVinculoDispositivo('', deviceId) === 'INVALIDO') {
        throw new HttpsError('invalid-argument', 'El identificador del dispositivo no es válido.');
    }
    if (!TIPOS_SERVICIO_VALIDOS.includes(tipo)
        || !['PENDIENTE', 'COACCION'].includes(estado)
        || (estado === 'COACCION' && tipo !== 'POLICIA')) {
        throw new HttpsError('invalid-argument', 'El tipo o estado inicial no es válido.');
    }
    if (!ubicacion.valida) {
        throw new HttpsError('invalid-argument', 'La ubicación de la emergencia no es válida.');
    }

    const vecinoQuery = await db.collection('usuarios')
        .where('uid', '==', request.auth.uid)
        .limit(1)
        .get();
    if (vecinoQuery.empty) {
        throw new HttpsError('permission-denied', 'La sesión no pertenece a un vecino registrado.');
    }

    const vecinoRef = vecinoQuery.docs[0].ref;
    const emergenciaRef = db.collection('emergencias').doc(emergenciaId);
    let idempotente = false;
    await db.runTransaction(async (transaction) => {
        const [vecinoSnap, emergenciaSnap] = await Promise.all([
            transaction.get(vecinoRef),
            transaction.get(emergenciaRef)
        ]);
        if (!vecinoSnap.exists || vecinoSnap.data().activo === false) {
            throw new HttpsError('permission-denied', 'La cuenta vecinal no está activa.');
        }

        const estadoVinculo = clasificarVinculoDispositivo(vecinoSnap.data().deviceId, deviceId);
        if (estadoVinculo !== 'EXISTENTE') {
            throw new HttpsError('failed-precondition',
                'El dispositivo no está vinculado a esta cuenta. Contacte a la central.');
        }

        if (emergenciaSnap.exists) {
            if (emergenciaSnap.data().vecinoId !== request.auth.uid) {
                throw new HttpsError('already-exists', 'El identificador de emergencia ya está en uso.');
            }
            idempotente = true;
            return;
        }

        const datosEmergencia = {
            id: emergenciaId,
            vecinoId: request.auth.uid,
            vecinoDni: vecinoRef.id,
            ubicacionDisponible: ubicacion.ubicacionDisponible,
            estado,
            tipo,
            timestampMs: Date.now(),
            timestampClienteMs: Number.isFinite(timestampClienteMs) ? timestampClienteMs : null,
            creadoDesdeDispositivoVinculado: true
        };
        if (ubicacion.ubicacionDisponible) {
            datosEmergencia.latitud = ubicacion.latitud;
            datosEmergencia.longitud = ubicacion.longitud;
        }
        transaction.set(emergenciaRef, datosEmergencia);
    });

    return { success: true, id: emergenciaId, idempotente };
});

exports.cambiarClaveInicialVecino = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como vecino.');
    }

    const nuevaClave = request.data?.nuevaClave;
    validarNuevaClaveVecino(nuevaClave);

    const uid = request.auth.uid;
    const vecinoQuery = await db.collection('usuarios')
        .where('uid', '==', uid)
        .limit(1)
        .get();
    if (vecinoQuery.empty) {
        throw new HttpsError('permission-denied', 'La sesión no pertenece a un vecino registrado.');
    }

    const vecinoDoc = vecinoQuery.docs[0];
    const vecino = vecinoDoc.data();
    if (vecino.activo === false) {
        throw new HttpsError('permission-denied', 'La cuenta del vecino está inactiva.');
    }
    if (vecino.debeCambiarClave !== true) {
        throw new HttpsError('failed-precondition', 'La clave temporal ya fue reemplazada.');
    }

    // La actualización de Auth se hace primero. Si Firestore falla, la llamada es
    // reintentable con la misma clave mientras debeCambiarClave continúe en true.
    await admin.auth().updateUser(uid, { password: nuevaClave });
    await vecinoDoc.ref.update({
        debeCambiarClave: false,
        claveCambiadaEnMs: Date.now(),
        claveCambiadaPor: uid
    });
    await registrarAuditoria('CLAVE_INICIAL_VECINO_CAMBIADA', uid, null,
        `DNI: ${vecinoDoc.id}`);

    return { success: true };
});

exports.cambiarPinVecino = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe iniciar sesión como vecino.');
    }
    const pinActual = String(request.data?.pinActual || '').trim();
    const pinNuevo = String(request.data?.pinNuevo || '').trim();
    if (!/^\d{4}$/.test(pinActual) || !/^\d{4}$/.test(pinNuevo)) {
        throw new HttpsError('invalid-argument', 'Los PIN deben contener exactamente cuatro dígitos.');
    }
    if (pinActual === pinNuevo) {
        throw new HttpsError('invalid-argument', 'El nuevo PIN debe ser diferente del actual.');
    }

    const vecinoQuery = await db.collection('usuarios')
        .where('uid', '==', request.auth.uid)
        .limit(1)
        .get();
    if (vecinoQuery.empty || vecinoQuery.docs[0].data().activo === false) {
        throw new HttpsError('permission-denied', 'La sesión no pertenece a un vecino activo.');
    }
    const vecinoDoc = vecinoQuery.docs[0];
    const vecino = vecinoDoc.data();
    if (!verificarPinHash(vecino.pinNormal, pinActual, vecinoDoc.id)) {
        throw new HttpsError('permission-denied', 'El PIN actual es incorrecto.');
    }
    if (verificarPinHash(vecino.pinCoaccion, pinNuevo, vecinoDoc.id)) {
        throw new HttpsError('invalid-argument', 'El PIN normal no puede coincidir con el PIN de coacción.');
    }

    await vecinoDoc.ref.update({
        pinNormal: hashPin(pinNuevo, vecinoDoc.id),
        pinCambiadoEnMs: Date.now(),
        pinCambiadoPor: request.auth.uid
    });
    await registrarAuditoria('PIN_VECINO_CAMBIADO', request.auth.uid, null, `DNI: ${vecinoDoc.id}`);
    return { success: true };
});

exports.vigilarSlaOperativo = onSchedule({
    schedule: 'every 1 minutes',
    timeZone: 'America/Lima'
}, async () => {
    const now = Date.now();
    const [emergenciasSnap, alertasActivasSnap] = await Promise.all([
        db.collection('emergencias')
            .where('estado', 'in', [
                'PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION',
                'DESPACHADA', 'EN_SITIO'
            ])
            .limit(1000)
            .get(),
        db.collection('alertas_operativas').where('activa', '==', true).limit(1000).get()
    ]);

    const alertasActuales = new Map();
    for (const emergenciaDoc of emergenciasSnap.docs) {
        const clasificacion = clasificarAlertaSla(emergenciaDoc.data(), now);
        if (!clasificacion) continue;
        const alertaId = `${clasificacion.codigo}_${emergenciaDoc.id}`;
        alertasActuales.set(alertaId, {
            ref: db.collection('alertas_operativas').doc(alertaId),
            data: {
                emergenciaId: emergenciaDoc.id,
                tipo: clasificacion.tipo,
                estadoEmergencia: emergenciaDoc.data().estado,
                codigo: clasificacion.codigo,
                severidad: clasificacion.severidad,
                detectadaEnMs: clasificacion.detectadaEnMs,
                activa: true,
                versionEsquema: 2
            }
        });
    }

    const alertasActivas = new Map(alertasActivasSnap.docs.map((doc) => [doc.id, doc]));
    const operaciones = [];
    let activadas = 0;
    let resueltas = 0;

    for (const [alertaId, alerta] of alertasActuales) {
        if (!alertasActivas.has(alertaId)) {
            operaciones.push(alerta);
            activadas += 1;
        }
    }
    for (const [alertaId, alertaDoc] of alertasActivas) {
        if (!alertasActuales.has(alertaId)) {
            operaciones.push({
                ref: alertaDoc.ref,
                data: { activa: false, resueltaEnMs: now, resueltaPor: 'system' }
            });
            resueltas += 1;
        }
    }

    if (operaciones.length > 0) {
        await aplicarOperacionesEnLotes(operaciones);
        await registrarAuditoria('VIGILANCIA_SLA', 'system', null,
            `Activadas: ${activadas} | Resueltas: ${resueltas}`);
    }
});

exports.aplicarPoliticaRetencion = onSchedule({
    schedule: 'every day 03:00',
    timeZone: 'America/Lima'
}, async () => {
    const now = Date.now();
    const cutoffSixMonths = now - RETENCION_EVIDENCIA_MS;
    const bucket = admin.storage().bucket();

    // Solo los estados realmente terminales pueden purgarse. ESCALADA sigue
    // siendo un caso operativo y nunca se elimina por antigüedad de creación.
    const expiradasPorEstado = await Promise.all(ESTADOS_TERMINALES_RETENCION.map((estado) =>
        db.collection('emergencias')
            .where('estado', '==', estado)
            .where('horaCierreMs', '<', cutoffSixMonths)
            .orderBy('horaCierreMs', 'asc')
            .limit(100)
            .get()));
    const expiradas = expiradasPorEstado.flatMap((snapshot) => snapshot.docs)
        .filter((doc) => esEmergenciaElegibleParaPurga(doc.data(), now));

    const batch = db.batch();
    let emergenciasEliminadas = 0;
    let emergenciasFallidas = 0;
    let trackingEmergenciasEliminados = 0;
    let trackingDespachosEliminados = 0;
    for (const emergencia of expiradas) {
        try {
            // El documento se conserva si una dependencia falla; la próxima
            // ejecución reintentará la purga y no dejará evidencia huérfana.
            const trackingEmergenciaRef = admin.database().ref(`tracking/emergencias/${emergencia.id}`);
            const trackingDespachoRef = admin.database().ref(`tracking/despachos/${emergencia.id}`);
            const [trackingEmergenciaSnap, trackingDespachoSnap] = await Promise.all([
                trackingEmergenciaRef.once('value'),
                trackingDespachoRef.once('value')
            ]);
            await Promise.all([
                bucket.deleteFiles({ prefix: `emergencias_audio/${emergencia.id}/` }),
                trackingEmergenciaRef.remove(),
                trackingDespachoRef.remove()
            ]);
            if (trackingEmergenciaSnap.exists()) trackingEmergenciasEliminados += 1;
            if (trackingDespachoSnap.exists()) trackingDespachosEliminados += 1;
            batch.delete(emergencia.ref);
            emergenciasEliminadas += 1;
        } catch (error) {
            emergenciasFallidas += 1;
            console.error(`No se pudo purgar la emergencia ${emergencia.id}:`, error);
        }
    }
    if (emergenciasEliminadas > 0) await batch.commit();

    const trackingRoot = admin.database().ref('tracking');
    const trackingSnap = await trackingRoot.once('value');
    const updates = {};
    for (const grupo of ['patrulleros', 'emergencias', 'despachos']) {
        const items = trackingSnap.child(grupo);
        items.forEach((item) => {
            const ultimaActualizacion = Number(item.child('ultimaActualizacion').val() || 0);
            if (esTrackingExpirado(ultimaActualizacion, now)) {
                updates[`${grupo}/${item.key}`] = null;
            }
        });
    }
    if (Object.keys(updates).length > 0) await trackingRoot.update(updates);

    const usuariosInactivos = await db.collection('usuarios')
        .where('activo', '==', false)
        .where('desactivadoEnMs', '<', cutoffSixMonths)
        .limit(100)
        .get();
    let usuariosEliminados = 0;
    let usuariosFallidos = 0;
    for (const usuario of usuariosInactivos.docs) {
        const data = usuario.data();
        try {
            if (data.uid) {
                try {
                    await admin.auth().deleteUser(data.uid);
                } catch (error) {
                    if (error?.code !== 'auth/user-not-found') throw error;
                }
                await bucket.deleteFiles({ prefix: `vecinos_fotos/${data.uid}.webp` });
            }
            await usuario.ref.delete();
            usuariosEliminados += 1;
        } catch (error) {
            usuariosFallidos += 1;
            console.error(`No se pudo purgar el perfil inactivo ${usuario.id}:`, error);
        }
    }

    await registrarAuditoria('PURGA_RETENCION', 'system', null,
        `Emergencias: ${emergenciasEliminadas} | Emergencias fallidas: ${emergenciasFallidas}`
        + ` | Tracking: ${Object.keys(updates).length + trackingEmergenciasEliminados + trackingDespachosEliminados}`
        + ` | Usuarios: ${usuariosEliminados}`
        + ` | Usuarios fallidos: ${usuariosFallidos}`);
});

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

        await vecinoRef.update({
            deviceId: '',
            dispositivoReseteadoEnMs: Date.now(),
            dispositivoReseteadoPor: request.auth.uid
        });
        if (vecinoDoc.data().uid) {
            await admin.auth().revokeRefreshTokens(vecinoDoc.data().uid);
        }

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
    exports.getPrioridadEmergencia = getPrioridadEmergencia;
    exports.getMotivoPendienteTrasCarrera = getMotivoPendienteTrasCarrera;
    exports.clasificarVinculoDispositivo = clasificarVinculoDispositivo;
    exports.esEmergenciaElegibleParaPurga = esEmergenciaElegibleParaPurga;
    exports.esTrackingExpirado = esTrackingExpirado;
    exports.clasificarAlertaSla = clasificarAlertaSla;
    exports.esUnidadVisiblePublicamente = esUnidadVisiblePublicamente;
    exports.validarNuevaClaveVecino = validarNuevaClaveVecino;
    exports.clasificarConfirmacionLlegada = clasificarConfirmacionLlegada;
    exports.normalizarUbicacionEmergencia = normalizarUbicacionEmergencia;
    exports.hashPin = hashPin;
    exports.verificarPinHash = verificarPinHash;
    exports.calcularProgresoRuta = calcularProgresoRuta;
    exports.debeRecalcularRuta = debeRecalcularRuta;
}
