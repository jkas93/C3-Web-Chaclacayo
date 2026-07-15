const { getServices, writeReport, decode, chunks } = require('./runtime');
const { buildPlan, summarize, blockers } = require('./planner');

async function applyDocuments(db, documents) {
    const changed = documents.filter((item) => Object.keys(item.patch).length || item.deletes.length);
    for (const group of chunks(changed)) {
        const batch = db.batch();
        for (const item of group) {
            const patch = decode(item.patch, db);
            for (const field of item.deletes) patch[field] = require('firebase-admin').firestore.FieldValue.delete();
            batch.set(db.collection(item.collection).doc(item.id), patch, { merge: true });
        }
        await batch.commit();
    }
    return changed.length;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const { projectId, db, auth } = getServices();
    if (apply && process.env.C3_MIGRATION_CONFIRM !== `APLICAR_${projectId}`) {
        throw new Error(`Confirmación inválida. Defina C3_MIGRATION_CONFIRM=APLICAR_${projectId}.`);
    }
    const plan = await buildPlan(db, auth);
    const preflightBlockers = blockers(plan);
    const blocked = Object.values(preflightBlockers).some((items) => items.length);
    if (apply && blocked) {
        const file = writeReport('migration-blocked', {
            kind: 'C3_MIGRATION_PREFLIGHT_BLOCKED_V2', projectId,
            createdAt: new Date().toISOString(), summary: summarize(plan), blockers: preflightBlockers
        });
        throw new Error(`Preflight bloqueado. Revise ${file} antes de aplicar.`);
    }
    const changedDocuments = plan.documents.filter((item) =>
        Object.keys(item.patch).length || item.deletes.length);
    const manifest = {
        kind: 'C3_MIGRATION_MANIFEST_V2',
        projectId,
        createdAt: new Date().toISOString(),
        mode: apply ? 'APPLY' : 'DRY_RUN',
        summary: summarize(plan),
        blockers: preflightBlockers,
        documents: changedDocuments,
        claimChanges: plan.claimChanges
    };
    const file = writeReport(apply ? 'migration-apply' : 'migration-dry-run', manifest);
    if (!apply) {
        console.log(JSON.stringify({ applied: false, file, ...manifest.summary }, null, 2));
        return;
    }
    const documentsChanged = await applyDocuments(db, changedDocuments);
    let claimsChanged = 0;
    for (const item of plan.claimChanges.filter((entry) => entry.changed)) {
        await auth.setCustomUserClaims(item.uid, item.afterClaims);
        claimsChanged += 1;
    }
    console.log(JSON.stringify({ applied: true, file, documentsChanged, claimsChanged }, null, 2));
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
