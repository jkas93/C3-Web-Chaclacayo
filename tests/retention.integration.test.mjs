import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectId = 'demo-c3-retention';
const bucketName = `${projectId}.appspot.com`;

process.env.NODE_ENV = 'test';
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
  storageBucket: bucketName,
});

const admin = require('../functions/node_modules/firebase-admin');
const functions = require('../functions/index.js');
const db = admin.firestore();
const rtdb = admin.database();
const bucket = admin.storage().bucket();

const ids = {
  expired: 'retention-expired-terminal',
  active: 'retention-active-old',
  escalated: 'retention-escalated-old',
  recent: 'retention-recent-terminal',
};

const day = 24 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;

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
    clearCollection('usuarios'),
    clearCollection('auditoria'),
    rtdb.ref().remove(),
    bucket.deleteFiles({ prefix: 'emergencias_audio/' }),
  ]);
});

test.after(async () => {
  await Promise.all([
    clearCollection('emergencias'),
    clearCollection('usuarios'),
    clearCollection('auditoria'),
    rtdb.ref().remove(),
    bucket.deleteFiles({ prefix: 'emergencias_audio/' }),
  ]);
  await admin.app().delete();
});

test('purga evidencia vencida y conserva casos no terminales o recientes', async () => {
  const now = Date.now();
  const base = {
    tipo: 'POLICIA',
    vecinoId: 'vecino-retention',
    vecinoDni: '00000000',
    latitud: -11.975,
    longitud: -76.77,
    timestampMs: now - 400 * day,
    versionEsquema: 2,
  };
  const batch = db.batch();
  batch.set(db.collection('emergencias').doc(ids.expired), {
    ...base, id: ids.expired, estado: 'RESUELTA', horaCierreMs: now - 181 * day,
  });
  batch.set(db.collection('emergencias').doc(ids.active), {
    ...base, id: ids.active, estado: 'EN_SITIO', horaCierreMs: now - 365 * day,
  });
  batch.set(db.collection('emergencias').doc(ids.escalated), {
    ...base, id: ids.escalated, estado: 'ESCALADA', horaCierreMs: now - 365 * day,
  });
  batch.set(db.collection('emergencias').doc(ids.recent), {
    ...base, id: ids.recent, estado: 'CANCELADA', horaCierreMs: now - 179 * day,
  });
  await batch.commit();

  const expiredAudio = bucket.file(`emergencias_audio/${ids.expired}/evidencia.ogg`);
  await Promise.all([
    expiredAudio.save(Buffer.from('OggS-retention-test'), { metadata: { contentType: 'audio/ogg' } }),
    rtdb.ref(`tracking/emergencias/${ids.expired}`).set({ ultimaActualizacion: now - 25 * hour }),
    rtdb.ref('tracking/patrulleros/stale').set({ ultimaActualizacion: now - 25 * hour }),
    rtdb.ref('tracking/patrulleros/fresh').set({ ultimaActualizacion: now - 23 * hour }),
  ]);

  await functions.aplicarPoliticaRetencion.run({});

  const [expired, active, escalated, recent, audioExists, expiredTracking, staleTracking, freshTracking, audit] =
    await Promise.all([
      db.collection('emergencias').doc(ids.expired).get(),
      db.collection('emergencias').doc(ids.active).get(),
      db.collection('emergencias').doc(ids.escalated).get(),
      db.collection('emergencias').doc(ids.recent).get(),
      expiredAudio.exists(),
      rtdb.ref(`tracking/emergencias/${ids.expired}`).once('value'),
      rtdb.ref('tracking/patrulleros/stale').once('value'),
      rtdb.ref('tracking/patrulleros/fresh').once('value'),
      db.collection('auditoria').where('accion', '==', 'PURGA_RETENCION').get(),
    ]);

  assert.equal(expired.exists, false);
  assert.equal(audioExists[0], false);
  assert.equal(expiredTracking.exists(), false);
  assert.equal(active.exists, true);
  assert.equal(escalated.exists, true);
  assert.equal(recent.exists, true);
  assert.equal(staleTracking.exists(), false);
  assert.equal(freshTracking.exists(), true);
  assert.equal(audit.size, 1);
  assert.match(audit.docs[0].data().detalles, /Emergencias: 1/);
  assert.match(audit.docs[0].data().detalles, /Tracking: 2/);
});
