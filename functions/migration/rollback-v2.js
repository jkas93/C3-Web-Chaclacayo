const { getServices, readManifest, decode, chunks, sameClaims } = require('./runtime');

function manifestArgument() {
    const value = process.argv.find((item) => item.startsWith('--manifest='));
    if (!value) throw new Error('Indique --manifest=.migration-reports/migration-apply-....json');
    return value.slice('--manifest='.length);
}

async function main() {
    if (!process.argv.includes('--apply')) throw new Error('Rollback requiere --apply.');
    const { projectId, db, auth } = getServices();
    if (process.env.C3_ROLLBACK_CONFIRM !== `REVERTIR_${projectId}`) {
        throw new Error(`Confirmación inválida. Defina C3_ROLLBACK_CONFIRM=REVERTIR_${projectId}.`);
    }
    const { resolved, value: manifest } = readManifest(manifestArgument());
    if (manifest.kind !== 'C3_MIGRATION_MANIFEST_V2' || manifest.mode !== 'APPLY') {
        throw new Error('El archivo no es un manifiesto APPLY V2 válido.');
    }
    if (manifest.projectId !== projectId) throw new Error('El manifiesto pertenece a otro proyecto.');

    for (const group of chunks(manifest.documents)) {
        const batch = db.batch();
        for (const item of group) {
            batch.set(db.collection(item.collection).doc(item.id), decode(item.before, db));
        }
        await batch.commit();
    }
    let claimsRestored = 0;
    for (const item of manifest.claimChanges.filter((entry) => entry.authUserExists)) {
        const current = (await auth.getUser(item.uid)).customClaims || {};
        if (!sameClaims(current, item.beforeClaims || {})) {
            await auth.setCustomUserClaims(item.uid, item.beforeClaims || null);
            claimsRestored += 1;
        }
    }
    console.log(JSON.stringify({ rolledBack: true, manifest: resolved,
        documentsRestored: manifest.documents.length, claimsRestored }, null, 2));
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
