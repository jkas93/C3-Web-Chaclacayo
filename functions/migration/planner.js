const {
    planUsuario, planPatrullero, planOperador, planEmergencia
} = require('./transformations');
const { encode, getAuthUser, mergedClaims, sameClaims } = require('./runtime');

const COLLECTIONS = [
    ['usuarios', planUsuario],
    ['patrulleros', planPatrullero],
    ['operadores_c3', planOperador],
    ['emergencias', planEmergencia]
];

async function buildPlan(db, auth) {
    const documents = [];
    const claimChanges = [];
    const counts = {};
    for (const [collection, planner] of COLLECTIONS) {
        const snapshot = await db.collection(collection).get();
        counts[collection] = snapshot.size;
        for (const document of snapshot.docs) {
            const data = document.data();
            const uid = collection === 'usuarios' ? data.uid :
                (collection === 'patrulleros' || collection === 'operadores_c3' ? document.id : null);
            const authUser = uid ? await getAuthUser(auth, uid) : null;
            const result = planner(document.id, data, authUser);
            documents.push({
                collection,
                id: document.id,
                before: encode(data),
                patch: encode(result.patch || {}),
                deletes: result.deletes || [],
                issues: result.issues || []
            });
            if (result.desiredClaims) {
                const beforeClaims = authUser ? authUser.customClaims || {} : null;
                const afterClaims = authUser ? mergedClaims(beforeClaims, result.desiredClaims) : null;
                claimChanges.push({
                    uid,
                    source: `${collection}/${document.id}`,
                    authUserExists: Boolean(authUser),
                    beforeClaims,
                    afterClaims,
                    changed: Boolean(authUser && !sameClaims(beforeClaims, afterClaims))
                });
            }
        }
    }
    const profilesByUid = new Map();
    for (const item of claimChanges.filter((entry) => entry.uid && entry.afterClaims)) {
        if (!profilesByUid.has(item.uid)) profilesByUid.set(item.uid, []);
        profilesByUid.get(item.uid).push({ source: item.source, role: item.afterClaims.role });
    }
    const profileConflicts = [...profilesByUid.entries()]
        .filter(([, profiles]) => profiles.length > 1)
        .map(([uid, profiles]) => ({ uid, profiles }));
    return { counts, documents, claimChanges, profileConflicts };
}

function summarize(plan) {
    return {
        counts: plan.counts,
        documentsWithChanges: plan.documents.filter((item) =>
            Object.keys(item.patch).length || item.deletes.length).length,
        documentsWithIssues: plan.documents.filter((item) => item.issues.length).length,
        claimsWithChanges: plan.claimChanges.filter((item) => item.changed).length,
        missingAuthUsers: plan.claimChanges.filter((item) => !item.authUserExists).length,
        profileConflicts: plan.profileConflicts.length
    };
}

function blockers(plan) {
    const blockingIssues = new Set([
        'DNI_DOCUMENT_ID_INVALIDO', 'ROL_OPERADOR_INVALIDO',
        'TIPO_EMERGENCIA_DESCONOCIDO', 'ESTADO_EMERGENCIA_DESCONOCIDO'
    ]);
    return {
        profileConflicts: plan.profileConflicts,
        documents: plan.documents.filter((item) => item.issues.some((issue) => blockingIssues.has(issue))),
        authUsers: plan.claimChanges.filter((item) =>
            !item.authUserExists && !item.source.startsWith('usuarios/'))
    };
}

module.exports = { buildPlan, summarize, blockers };
