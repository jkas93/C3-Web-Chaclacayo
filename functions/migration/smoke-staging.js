const crypto = require('node:crypto');
const { getServices } = require('./runtime');

async function request(url, options = {}) {
    const response = await fetch(url, options);
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    return { status: response.status, ok: response.ok, body };
}

async function callable(projectId, region, name, data, idToken = null) {
    const headers = { 'content-type': 'application/json' };
    if (idToken) headers.authorization = `Bearer ${idToken}`;
    return request(`https://${region}-${projectId}.cloudfunctions.net/${name}`, {
        method: 'POST', headers, body: JSON.stringify({ data })
    });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const region = process.env.C3_FUNCTIONS_REGION || 'us-central1';
    const services = getServices();
    const { projectId, db, auth } = services;
    const smokeStarted = Date.now();
    let publicToken = null;
    const operators = await db.collection('operadores_c3')
        .where('rol', '==', 'ADMIN').where('activo', '==', true).limit(2).get();
    assert(operators.size === 1, `Se esperaba exactamente un ADMIN activo; encontrados ${operators.size}.`);
    const adminUid = operators.docs[0].id;

    try {
        const anonymousAdmin = await callable(projectId, region, 'crearVecino', {});
        assert(!anonymousAdmin.ok && anonymousAdmin.body?.error?.status === 'UNAUTHENTICATED',
            `La llamada administrativa anónima no fue rechazada correctamente: HTTP ${anonymousAdmin.status}.`);

        const adminUser = await auth.getUser(adminUid);
        assert(adminUser.customClaims?.role === 'ADMIN', 'La cuenta conservada no tiene claim ADMIN.');
        publicToken = crypto.randomBytes(24).toString('hex');
        await db.collection('enlaces_publicos').doc(publicToken).set({
            activo: true, createdAt: Date.now(), expiresAtMs: Date.now() + 10 * 60 * 1000,
            creadoPor: adminUid, proposito: 'SMOKE_TEST'
        });

        const publicResult = await callable(projectId, region, 'obtenerUnidadesPublicas', { token: publicToken });
        const publicData = publicResult.body?.result || publicResult.body?.data;
        assert(publicResult.ok && Array.isArray(publicData?.unidades),
            `Endpoint público inválido: HTTP ${publicResult.status}.`);
        assert(publicData.unidades.length === 0, 'El endpoint público devolvió unidades en un staging vacío.');

        await db.collection('enlaces_publicos').doc(publicToken).update({ activo: false, revocadoEnMs: Date.now() });
        const revokedPublic = await callable(projectId, region, 'obtenerUnidadesPublicas', { token: publicToken });
        assert(!revokedPublic.ok && revokedPublic.body?.error?.status === 'PERMISSION_DENIED',
            `El enlace revocado siguió disponible: HTTP ${revokedPublic.status}.`);

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/operadores_c3/${adminUid}`;
        const firestoreAnonymous = await request(firestoreUrl);
        assert([401, 403].includes(firestoreAnonymous.status),
            `Firestore permitió lectura anónima: HTTP ${firestoreAnonymous.status}.`);

        const rtdbAnonymous = await request(`https://${projectId}-default-rtdb.firebaseio.com/tracking.json`);
        assert([401, 403].includes(rtdbAnonymous.status),
            `RTDB permitió lectura anónima: HTTP ${rtdbAnonymous.status}.`);

        const bucket = process.env.C3_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
        const storageAnonymous = await request(
            `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?maxResults=1`);
        assert([401, 403].includes(storageAnonymous.status),
            `Storage permitió listado anónimo: HTTP ${storageAnonymous.status}.`);

        console.log(JSON.stringify({
            passed: true,
            checks: {
                publicLinkCreatedSanitizedRevoked: true,
                anonymousAdminCallableRejected: true,
                adminClaimVerified: true,
                adminTemporarySession: false,
                firestoreAnonymousRejected: true,
                firestoreAdminAllowed: 'PENDIENTE_PRUEBA_MANUAL',
                rtdbAnonymousRejected: true,
                storageAnonymousRejected: true
            }
        }, null, 2));
    } finally {
        if (publicToken) await db.collection('enlaces_publicos').doc(publicToken).delete().catch(() => null);
        const audit = await db.collection('auditoria')
            .where('timestamp', '>=', services.admin.firestore.Timestamp.fromMillis(smokeStarted - 1000)).get();
        const writer = db.bulkWriter();
        audit.docs.filter((document) => document.data().ejecutadoPor === adminUid &&
            ['ENLACE_PUBLICO_CREADO', 'ENLACE_PUBLICO_REVOCADO'].includes(document.data().accion))
            .forEach((document) => writer.delete(document.ref));
        await writer.close();
        await Promise.all(services.admin.apps.map((app) => app.delete()));
    }
}

main().then(() => process.exit(0)).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
