const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const REPORT_DIR = path.resolve(__dirname, '..', '.migration-reports');

function requireTargetProject() {
    const target = String(process.env.C3_TARGET_PROJECT_ID || '').trim();
    const allowed = String(process.env.C3_ALLOWED_PROJECT_ID || '').trim();
    const production = String(process.env.C3_PRODUCTION_PROJECT_ID || '').trim();
    if (!target || !allowed) {
        throw new Error('Defina C3_TARGET_PROJECT_ID y C3_ALLOWED_PROJECT_ID.');
    }
    if (target !== allowed) {
        throw new Error(`Proyecto bloqueado: TARGET=${target} no coincide con ALLOWED=${allowed}.`);
    }
    if (production && target === production) {
        throw new Error('Esta herramienta de staging se niega a operar sobre el proyecto productivo.');
    }
    return target;
}

function getServices() {
    const projectId = requireTargetProject();
    if (!admin.apps.length) {
        const options = {
            credential: admin.credential.applicationDefault(),
            projectId,
            databaseURL: process.env.C3_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
            storageBucket: process.env.C3_STORAGE_BUCKET || `${projectId}.firebasestorage.app`
        };
        if (process.env.C3_SERVICE_ACCOUNT_ID) options.serviceAccountId = process.env.C3_SERVICE_ACCOUNT_ID;
        admin.initializeApp(options);
    }
    const services = { admin, projectId, db: admin.firestore(), auth: admin.auth() };
    Object.defineProperties(services, {
        rtdb: { enumerable: true, get: () => admin.database() },
        bucket: { enumerable: true, get: () => admin.storage().bucket() }
    });
    return services;
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeReport(prefix, payload) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const file = path.join(REPORT_DIR, `${prefix}-${timestamp()}.json`);
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
    return file;
}

function readManifest(file) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(`${REPORT_DIR}${path.sep}`)) {
        throw new Error(`El manifiesto debe estar dentro de ${REPORT_DIR}.`);
    }
    return { resolved, value: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function encode(value) {
    if (value === null || value === undefined) return value;
    if (value instanceof admin.firestore.Timestamp) {
        return { __c3Type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
    }
    if (value instanceof admin.firestore.GeoPoint) {
        return { __c3Type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
    }
    if (Buffer.isBuffer(value)) return { __c3Type: 'Bytes', base64: value.toString('base64') };
    if (value && typeof value.path === 'string' && value.firestore) {
        return { __c3Type: 'DocumentReference', path: value.path };
    }
    if (Array.isArray(value)) return value.map(encode);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    }
    return value;
}

function decode(value, db) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((item) => decode(item, db));
    if (typeof value === 'object') {
        if (value.__c3Type === 'Timestamp') {
            return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
        }
        if (value.__c3Type === 'GeoPoint') {
            return new admin.firestore.GeoPoint(value.latitude, value.longitude);
        }
        if (value.__c3Type === 'Bytes') return Buffer.from(value.base64, 'base64');
        if (value.__c3Type === 'DocumentReference') return db.doc(value.path);
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item, db)]));
    }
    return value;
}

function chunks(items, size = 400) {
    const result = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

async function getAuthUser(auth, uid) {
    if (!uid) return null;
    try {
        return await auth.getUser(uid);
    } catch (error) {
        if (error.code === 'auth/user-not-found') return null;
        throw error;
    }
}

function mergedClaims(before = {}, desired = {}) {
    const result = { ...before, ...desired };
    if (desired.role !== 'PATRULLERO') delete result.tipoServicio;
    return result;
}

function sameClaims(actual = {}, desired = {}) {
    return JSON.stringify(actual) === JSON.stringify(desired);
}

module.exports = {
    REPORT_DIR, requireTargetProject, getServices, writeReport, readManifest,
    encode, decode, chunks, getAuthUser, mergedClaims, sameClaims
};
