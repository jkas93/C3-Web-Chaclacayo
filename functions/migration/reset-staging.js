const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    REPORT_DIR, getServices, readManifest, writeReport, chunks
} = require('./runtime');

function argument(name) {
    const prefix = `--${name}=`;
    const value = process.argv.find((item) => item.startsWith(prefix));
    return value ? value.slice(prefix.length) : null;
}

function latestSnapshot() {
    if (!fs.existsSync(REPORT_DIR)) return null;
    return fs.readdirSync(REPORT_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('snapshot-'))
        .map((entry) => path.join(REPORT_DIR, entry.name))
        .filter((directory) => fs.existsSync(path.join(directory, 'snapshot.json')))
        .sort().at(-1) || null;
}

function loadSnapshot(input, projectId) {
    const directory = path.resolve(input || latestSnapshot() || '');
    if (!directory.startsWith(`${REPORT_DIR}${path.sep}`)) {
        throw new Error(`El snapshot debe estar dentro de ${REPORT_DIR}.`);
    }
    const summary = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8'));
    if (summary.kind !== 'C3_FULL_LOGICAL_SNAPSHOT_V1' || summary.projectId !== projectId) {
        throw new Error('El snapshot no es válido o pertenece a otro proyecto.');
    }
    for (const required of ['firestore.json', 'auth.json', 'rtdb.json', 'storage-manifest.json']) {
        if (!fs.existsSync(path.join(directory, required))) throw new Error(`Snapshot incompleto: falta ${required}.`);
    }
    const storage = JSON.parse(fs.readFileSync(path.join(directory, 'storage-manifest.json'), 'utf8'));
    for (const item of storage) {
        const file = path.join(directory, 'storage-objects', item.localName);
        if (!fs.existsSync(file)) throw new Error(`Snapshot incompleto: falta objeto ${item.localName}.`);
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if (hash !== item.sha256) throw new Error(`Snapshot corrupto: hash inválido ${item.localName}.`);
    }
    return { directory, summary };
}

async function listAllDocuments(db) {
    const documents = [];
    async function visit(collection) {
        const snapshot = await collection.get();
        documents.push(...snapshot.docs);
        for (let index = 0; index < snapshot.docs.length; index += 50) {
            const childGroups = await Promise.all(snapshot.docs.slice(index, index + 50)
                .map((document) => document.ref.listCollections()));
            for (const child of childGroups.flat()) await visit(child);
        }
    }
    for (const collection of await db.listCollections()) await visit(collection);
    return documents;
}

async function listAuthUsers(auth) {
    const users = [];
    let token;
    do {
        const page = await auth.listUsers(1000, token);
        users.push(...page.users);
        token = page.pageToken;
    } while (token);
    return users;
}

async function buildResetPlan(db, auth, bucket) {
    const documents = await listAllDocuments(db);
    const admins = documents.filter((document) => document.ref.parent.id === 'operadores_c3' &&
        document.data().rol === 'ADMIN' && document.data().activo !== false);
    if (admins.length !== 1) throw new Error(`Se requiere exactamente un ADMIN activo; encontrados: ${admins.length}.`);
    const adminDocument = admins[0];
    let adminUser;
    try {
        adminUser = await auth.getUser(adminDocument.id);
    } catch (error) {
        throw new Error(`La cuenta Auth del ADMIN conservado no está disponible: ${error.message}`);
    }
    if (adminUser.disabled) throw new Error('La cuenta Auth del ADMIN conservado está deshabilitada.');
    const users = await listAuthUsers(auth);
    const [files] = await bucket.getFiles();
    return {
        adminUid: adminDocument.id,
        adminUser,
        adminDocument,
        documentsToDelete: documents.filter((document) => document.ref.path !== adminDocument.ref.path),
        authUsersToDelete: users.filter((user) => user.uid !== adminDocument.id),
        storageFiles: files
    };
}

async function applyReset({ admin, db, auth, rtdb, bucket }, plan) {
    const writer = db.bulkWriter();
    for (const document of plan.documentsToDelete) writer.delete(document.ref);
    await writer.close();
    for (const group of chunks(plan.authUsersToDelete, 1000)) {
        const result = await auth.deleteUsers(group.map((user) => user.uid));
        if (result.failureCount) throw new Error(`No se pudieron eliminar ${result.failureCount} cuentas Auth.`);
    }
    await rtdb.ref('/').remove();
    if (plan.storageFiles.length) await bucket.deleteFiles({ force: true });
    const adminData = plan.adminDocument.data();
    await plan.adminDocument.ref.set({
        ...adminData, uid: plan.adminUid,
        nombre: adminData.nombre || plan.adminUser.displayName || 'Administrador',
        email: adminData.email || plan.adminUser.email || '',
        creadoEn: adminData.creadoEn || admin.firestore.Timestamp.fromDate(
            new Date(plan.adminUser.metadata.creationTime)),
        rol: 'ADMIN', activo: true, versionEsquema: 2
    });
    await auth.setCustomUserClaims(plan.adminUid, { role: 'ADMIN' });
    await db.collection('auditoria').add({
        accion: 'RESET_STAGING_V2', actorUid: plan.adminUid,
        timestampMs: Date.now(), detalle: 'Limpieza autorizada de datos de prueba y preparación V2.'
    });
    await Promise.all(admin.apps.map((app) => app.delete()));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const services = getServices();
    const { projectId, db, auth, bucket } = services;
    const snapshot = loadSnapshot(argument('snapshot'), projectId);
    const plan = await buildResetPlan(db, auth, bucket);
    const summary = {
        kind: 'C3_STAGING_RESET_PLAN_V1', projectId,
        createdAt: new Date().toISOString(), apply,
        snapshot: snapshot.directory,
        preserve: { activeAdmins: 1, authUsers: 1, operatorDocuments: 1 },
        delete: {
            firestoreDocuments: plan.documentsToDelete.length,
            authUsers: plan.authUsersToDelete.length,
            rtdb: 'ROOT', storageObjects: plan.storageFiles.length
        }
    };
    const report = writeReport(apply ? 'staging-reset-apply' : 'staging-reset-dry-run', summary);
    if (!apply) {
        console.log(JSON.stringify({ report, ...summary }, null, 2));
        await Promise.all(services.admin.apps.map((app) => app.delete()));
        return;
    }
    if (process.env.C3_ENVIRONMENT !== 'STAGING') {
        throw new Error('Defina C3_ENVIRONMENT=STAGING para autorizar el reset.');
    }
    if (process.env.C3_RESET_CONFIRM !== `RESETEAR_${projectId}`) {
        throw new Error(`Confirmación inválida. Defina C3_RESET_CONFIRM=RESETEAR_${projectId}.`);
    }
    await applyReset(services, plan);
    console.log(JSON.stringify({ report, resetApplied: true, ...summary.delete }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
