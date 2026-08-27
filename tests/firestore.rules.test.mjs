import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-c3-reglas';
let testEnv;

const emergency = (overrides = {}) => ({
  id: 'em-1',
  vecinoId: 'vecino-1',
  vecinoDni: '12345678',
  vecinoNombre: 'Vecino Uno',
  tipo: 'POLICIA',
  estado: 'DESPACHADA',
  latitud: -11.9765,
  longitud: -76.7725,
  timestampMs: 1_700_000_000_000,
  patrullaAsignadaId: 'unidad-1',
  ...overrides,
});

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'usuarios/12345678'), {
        uid: 'vecino-1', dni: '12345678', nombre: 'Vecino Uno', activo: true,
      }),
      setDoc(doc(db, 'usuarios/87654321'), {
        uid: 'vecino-2', dni: '87654321', nombre: 'Vecino Dos', activo: true,
      }),
      setDoc(doc(db, 'operadores_c3/admin-1'), { uid: 'admin-1', rol: 'ADMIN', activo: true }),
      setDoc(doc(db, 'operadores_c3/policia-1'), { uid: 'policia-1', rol: 'POLICIA', activo: true }),
      setDoc(doc(db, 'operadores_c3/salud-1'), { uid: 'salud-1', rol: 'SALUD', activo: true }),
      setDoc(doc(db, 'patrulleros/unidad-1'), {
        uid: 'unidad-1', tipoServicio: 'POLICIA', estado: 'EN_SERVICIO', tokenFCM: '',
      }),
      setDoc(doc(db, 'emergencias/em-1'), emergency()),
      setDoc(doc(db, 'emergencias/em-salud'), emergency({
        id: 'em-salud', tipo: 'SALUD', patrullaAsignadaId: 'unidad-salud',
      })),
      setDoc(doc(db, 'alertas_operativas/P1_em-1'), {
        emergenciaId: 'em-1', tipo: 'POLICIA', codigo: 'P1_SIN_RESPUESTA',
        severidad: 'CRITICA', activa: true,
      }),
      setDoc(doc(db, 'alertas_operativas/COLA_em-salud'), {
        emergenciaId: 'em-salud', tipo: 'SALUD', codigo: 'COLA_SIN_UNIDAD',
        severidad: 'ALTA', activa: true,
      }),
    ]);
  });
});

describe('aislamiento de lectura', () => {
  it('rechaza a un usuario anónimo', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'emergencias/em-1')));
    await assertFails(getDoc(doc(db, 'patrulleros/unidad-1')));
  });

  it('permite al vecino leer solo su propia emergencia', async () => {
    const ownDb = testEnv.authenticatedContext('vecino-1').firestore();
    const otherDb = testEnv.authenticatedContext('vecino-2').firestore();
    await assertSucceeds(getDoc(doc(ownDb, 'emergencias/em-1')));
    await assertFails(getDoc(doc(otherDb, 'emergencias/em-1')));
  });

  it('limita a la central por servicio y da alcance transversal a ADMIN', async () => {
    const policeDb = testEnv.authenticatedContext('policia-1').firestore();
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertSucceeds(getDoc(doc(policeDb, 'emergencias/em-1')));
    await assertFails(getDoc(doc(policeDb, 'emergencias/em-salud')));
    await assertSucceeds(getDoc(doc(adminDb, 'emergencias/em-salud')));
  });

  it('aísla alertas SLA por servicio y bloquea sus escrituras directas', async () => {
    const policeDb = testEnv.authenticatedContext('policia-1').firestore();
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    const neighborDb = testEnv.authenticatedContext('vecino-1').firestore();
    await assertSucceeds(getDoc(doc(policeDb, 'alertas_operativas/P1_em-1')));
    await assertFails(getDoc(doc(policeDb, 'alertas_operativas/COLA_em-salud')));
    await assertSucceeds(getDoc(doc(adminDb, 'alertas_operativas/COLA_em-salud')));
    await assertFails(getDoc(doc(neighborDb, 'alertas_operativas/P1_em-1')));
    await assertFails(updateDoc(doc(adminDb, 'alertas_operativas/P1_em-1'), { activa: false }));
  });
});

describe('creación vecinal gobernada por backend', () => {
  const validPayload = {
    id: 'em-new',
    vecinoId: 'vecino-1',
    vecinoDni: '12345678',
    tipo: 'POLICIA',
    estado: 'PENDIENTE',
    latitud: -11.9765,
    longitud: -76.7725,
    timestampMs: 1_700_000_000_001,
  };

  it('rechaza incluso el payload mínimo del propietario', async () => {
    const db = testEnv.authenticatedContext('vecino-1').firestore();
    await assertFails(setDoc(doc(db, 'emergencias/em-new'), validPayload));
  });

  it('rechaza inyección de unidad, prioridad o identificador inconsistente', async () => {
    const db = testEnv.authenticatedContext('vecino-1').firestore();
    await assertFails(setDoc(doc(db, 'emergencias/em-new'), {
      ...validPayload, patrullaAsignadaId: 'unidad-1', prioridad: 'P1',
    }));
    await assertFails(setDoc(doc(db, 'emergencias/otro-id'), validPayload));
  });

  it('solo acepta coacción para Policía', async () => {
    const db = testEnv.authenticatedContext('vecino-1').firestore();
    await assertFails(setDoc(doc(db, 'emergencias/em-new'), {
      ...validPayload, estado: 'COACCION', tipo: 'SALUD',
    }));
  });
});

describe('transiciones y mutaciones', () => {
  it('permite al vecino adjuntar audio pero no cambiar el estado', async () => {
    const db = testEnv.authenticatedContext('vecino-1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'emergencias/em-1'), { audioUrl: 'https://evidencia.local/audio.ogg' }));
    await assertFails(updateDoc(doc(db, 'emergencias/em-1'), { estado: 'RESUELTA' }));
  });

  it('obliga a la unidad a confirmar llegada mediante backend', async () => {
    const db = testEnv.authenticatedContext('unidad-1').firestore();
    await assertFails(updateDoc(doc(db, 'emergencias/em-1'), {
      estado: 'EN_SITIO', horaLlegadaMs: 1_700_000_001_000, ultimaActualizacionMs: 1_700_000_001_000,
    }));
    await assertFails(updateDoc(doc(db, 'emergencias/em-1'), { estado: 'RESUELTA' }));
  });

  it('impide que la unidad cambie directamente su disponibilidad', async () => {
    const db = testEnv.authenticatedContext('unidad-1').firestore();
    await assertFails(updateDoc(doc(db, 'patrulleros/unidad-1'), { estado: 'DISPONIBLE' }));
    await assertSucceeds(updateDoc(doc(db, 'patrulleros/unidad-1'), { tokenFCM: 'token-renovado' }));
  });

  it('impide que el vecino reemplace directamente el dispositivo vinculado', async () => {
    const db = testEnv.authenticatedContext('vecino-1').firestore();
    await assertFails(updateDoc(doc(db, 'usuarios/12345678'), {
      deviceId: '123e4567-e89b-42d3-a456-426614174000',
    }));
    await assertSucceeds(updateDoc(doc(db, 'usuarios/12345678'), { tokenFCM: 'token-vecino-renovado' }));
  });

  it('impide escrituras operativas directas incluso a ADMIN', async () => {
    const db = testEnv.authenticatedContext('admin-1').firestore();
    await assertFails(updateDoc(doc(db, 'emergencias/em-1'), { estado: 'CANCELADA' }));
    await assertFails(setDoc(doc(db, 'cuadrantes/q-1'), { nombre: 'Q1', path: [] }));
  });
});
