const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { REPORT_DIR, getServices, encode } = require('./runtime');

function snapshotDirectory(projectId) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const directory = path.join(REPORT_DIR, `snapshot-${projectId}-${stamp}`);
    fs.mkdirSync(directory, { recursive: false });
    return directory;
}

function writeJson(directory, name, value) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    return file;
}

async function firestoreSnapshot(db) {
    const documents = [];
    async function visitCollection(collection) {
        const snapshot = await collection.get();
        for (const document of snapshot.docs) {
            documents.push({ path: document.ref.path, data: encode(document.data()) });
        }
        for (let index = 0; index < snapshot.docs.length; index += 50) {
            const group = snapshot.docs.slice(index, index + 50);
            const children = (await Promise.all(group.map((document) =>
                document.ref.listCollections()))).flat();
            for (const child of children) await visitCollection(child);
        }
    }
    for (const collection of await db.listCollections()) await visitCollection(collection);
    return documents;
}

async function authSnapshot(auth) {
    const users = [];
    let pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        users.push(...page.users.map((user) => encode(user.toJSON())));
        pageToken = page.pageToken;
    } while (pageToken);
    return users;
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function storageSnapshot(bucket, directory) {
    const objectDirectory = path.join(directory, 'storage-objects');
    fs.mkdirSync(objectDirectory, { recursive: false });
    const [files] = await bucket.getFiles();
    console.log(`Storage: ${files.length} objetos detectados.`);
    const manifest = [];
    let completed = 0;
    for (const file of files) {
        const localName = crypto.createHash('sha256').update(file.name).digest('hex');
        const destination = path.join(objectDirectory, localName);
        await file.download({ destination });
        const metadata = file.metadata || {};
        manifest.push({
            name: file.name,
            localName,
            size: Number(metadata.size || 0),
            contentType: metadata.contentType || null,
            metadata: encode(metadata.metadata || {}),
            md5Hash: metadata.md5Hash || null,
            sha256: sha256(destination)
        });
        completed += 1;
        if (completed % 25 === 0 || completed === files.length) {
            console.log(`Storage: ${completed}/${files.length} objetos respaldados.`);
        }
    }
    return manifest;
}

async function main() {
    const { projectId, db, auth, rtdb, bucket } = getServices();
    const directory = snapshotDirectory(projectId);
    console.log('Firestore: iniciando lectura completa.');
    const firestore = await firestoreSnapshot(db);
    writeJson(directory, 'firestore.json', firestore);
    console.log(`Firestore: ${firestore.length} documentos respaldados.`);
    console.log('Auth: iniciando inventario de usuarios.');
    const users = await authSnapshot(auth);
    writeJson(directory, 'auth.json', users);
    console.log(`Auth: ${users.length} usuarios respaldados.`);
    console.log('RTDB: iniciando lectura completa.');
    const rtdbValue = encode((await rtdb.ref('/').once('value')).val());
    writeJson(directory, 'rtdb.json', rtdbValue);
    console.log('RTDB: respaldo completado.');
    console.log('Storage: iniciando copia de objetos.');
    const storage = await storageSnapshot(bucket, directory);
    writeJson(directory, 'storage-manifest.json', storage);
    const summary = {
        kind: 'C3_FULL_LOGICAL_SNAPSHOT_V1', projectId,
        createdAt: new Date().toISOString(),
        counts: {
            firestoreDocuments: firestore.length,
            authUsers: users.length,
            rtdbTopLevelNodes: rtdbValue && typeof rtdbValue === 'object' ? Object.keys(rtdbValue).length : 0,
            storageObjects: storage.length,
            storageBytes: storage.reduce((total, item) => total + item.size, 0)
        }
    };
    writeJson(directory, 'snapshot.json', summary);
    console.log(JSON.stringify({ directory, ...summary.counts }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
