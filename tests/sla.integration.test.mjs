import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectId = 'demo-c3-sla';
process.env.NODE_ENV = 'test';
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });

const admin = require('../functions/node_modules/firebase-admin');
const functions = require('../functions/index.js');
const db = admin.firestore();
const minute = 60 * 1000;

async function clearCollection(name) {
  const snapshot = await db.collection(name).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  for (const document of snapshot.docs) batch.delete(document.ref);
  await batch.commit();
}

test.beforeEach(async () => {
  await Promise.all([
    clearCollection('emergencias'),
    clearCollection('alertas_operativas'),
    clearCollection('auditoria'),
  ]);
});

test.after(async () => {
  await Promise.all([
    clearCollection('emergencias'),
    clearCollection('alertas_operativas'),
    clearCollection('auditoria'),
  ]);
  await admin.app().delete();
});

test('activa, deduplica y resuelve automáticamente alertas SLA', async () => {
  const now = Date.now();
  const batch = db.batch();
  batch.set(db.collection('emergencias').doc('p1'), {
    tipo: 'POLICIA', estado: 'COACCION', prioridad: 'P1', timestampMs: now - 3 * minute,
  });
  batch.set(db.collection('emergencias').doc('p2'), {
    tipo: 'SALUD', estado: 'PENDIENTE_SIN_UNIDAD', prioridad: 'P2', timestampMs: now - 11 * minute,
  });
  batch.set(db.collection('emergencias').doc('a-tiempo'), {
    tipo: 'BOMBEROS', estado: 'DESPACHADA', horaAsignacionMs: now - 5 * minute,
  });
  batch.set(db.collection('alertas_operativas').doc('LLEGADA_DEMORADA_caso-cerrado'), {
    emergenciaId: 'caso-cerrado', tipo: 'POLICIA', codigo: 'LLEGADA_DEMORADA',
    severidad: 'ALTA', activa: true,
  });
  await batch.commit();

  await functions.vigilarSlaOperativo.run({});
  const [p1Alert, p2Alert, staleAlert, firstAudits] = await Promise.all([
    db.collection('alertas_operativas').doc('P1_SIN_RESPUESTA_p1').get(),
    db.collection('alertas_operativas').doc('COLA_SIN_UNIDAD_p2').get(),
    db.collection('alertas_operativas').doc('LLEGADA_DEMORADA_caso-cerrado').get(),
    db.collection('auditoria').where('accion', '==', 'VIGILANCIA_SLA').get(),
  ]);
  assert.equal(p1Alert.data().activa, true);
  assert.equal(p2Alert.data().activa, true);
  assert.equal(staleAlert.data().activa, false);
  assert.equal(firstAudits.size, 1);
  assert.match(firstAudits.docs[0].data().detalles, /Activadas: 2/);
  assert.match(firstAudits.docs[0].data().detalles, /Resueltas: 1/);

  await functions.vigilarSlaOperativo.run({});
  const secondAudits = await db.collection('auditoria').where('accion', '==', 'VIGILANCIA_SLA').get();
  assert.equal(secondAudits.size, 1, 'la segunda evaluación estable no debe duplicar auditoría');

  await db.collection('emergencias').doc('p1').update({ estado: 'RESUELTA', horaCierreMs: Date.now() });
  await functions.vigilarSlaOperativo.run({});
  const [resolvedP1, activeP2, finalAudits] = await Promise.all([
    db.collection('alertas_operativas').doc('P1_SIN_RESPUESTA_p1').get(),
    db.collection('alertas_operativas').doc('COLA_SIN_UNIDAD_p2').get(),
    db.collection('auditoria').where('accion', '==', 'VIGILANCIA_SLA').get(),
  ]);
  assert.equal(resolvedP1.data().activa, false);
  assert.equal(activeP2.data().activa, true);
  assert.equal(finalAudits.size, 2);
});
