const { getServices, writeReport } = require('./runtime');
const { buildPlan, summarize } = require('./planner');

async function main() {
    const { projectId, db, auth } = getServices();
    const plan = await buildPlan(db, auth);
    const report = {
        kind: 'C3_STAGING_INVENTORY_V2',
        projectId,
        createdAt: new Date().toISOString(),
        readOnly: true,
        summary: summarize(plan),
        issues: plan.documents
            .filter((item) => item.issues.length)
            .map(({ collection, id, issues }) => ({ collection, id, issues })),
        authGaps: plan.claimChanges
            .filter((item) => !item.authUserExists)
            .map(({ uid, source }) => ({ uid, source })),
        profileConflicts: plan.profileConflicts
    };
    const file = writeReport('inventory', report);
    console.log(JSON.stringify({ file, ...report.summary }, null, 2));
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
