const { getServices, writeReport } = require('./runtime');
const { buildPlan, summarize } = require('./planner');

async function main() {
    const { projectId, db, auth } = getServices();
    const plan = await buildPlan(db, auth);
    const summary = summarize(plan);
    const passed = summary.documentsWithChanges === 0 &&
        summary.claimsWithChanges === 0 && summary.documentsWithIssues === 0 &&
        summary.missingAuthUsers === 0 && summary.profileConflicts === 0;
    const report = {
        kind: 'C3_MIGRATION_VERIFICATION_V2', projectId,
        createdAt: new Date().toISOString(), passed, summary,
        remaining: plan.documents.filter((item) =>
            Object.keys(item.patch).length || item.deletes.length || item.issues.length),
        authGaps: plan.claimChanges.filter((item) => !item.authUserExists || item.changed),
        profileConflicts: plan.profileConflicts
    };
    const file = writeReport('migration-verification', report);
    console.log(JSON.stringify({ file, passed, ...summary }, null, 2));
    if (!passed) process.exitCode = 2;
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
