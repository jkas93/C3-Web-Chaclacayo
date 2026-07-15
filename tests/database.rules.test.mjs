import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';

const projectId = 'demo-c3-database-rules';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    database: {
      rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await set(ref(db, 'tracking'), {
      patrulleros: {
        'unidad-1': { latitud: -11.97, longitud: -76.77, ultimaActualizacion: 1_700_000_000_000 },
      },
      emergencias: {
        'em-1': {
          latitud: -11.97, longitud: -76.77, vecinoId: 'vecino-1',
          ultimaActualizacion: 1_700_000_000_000,
        },
      },
    });
  });
});

describe('tracking de unidades', () => {
  it('rechaza lectura anónima y permite lectura operativa', async () => {
    const anonDb = testEnv.unauthenticatedContext().database();
    const operatorDb = testEnv.authenticatedContext('policia-1', { role: 'POLICIA' }).database();
    await assertFails(get(ref(anonDb, 'tracking/patrulleros')));
    await assertSucceeds(get(ref(operatorDb, 'tracking/patrulleros')));
  });

  it('la unidad escribe solo su nodo con un payload válido', async () => {
    const unitDb = testEnv.authenticatedContext('unidad-1', { role: 'PATRULLERO' }).database();
    await assertSucceeds(set(ref(unitDb, 'tracking/patrulleros/unidad-1'), {
      latitud: -11.98, longitud: -76.78, ultimaActualizacion: 1_700_000_000_100,
    }));
    await assertFails(set(ref(unitDb, 'tracking/patrulleros/unidad-2'), {
      latitud: -11.98, longitud: -76.78, ultimaActualizacion: 1_700_000_000_100,
    }));
    await assertFails(set(ref(unitDb, 'tracking/patrulleros/unidad-1'), {
      latitud: 'falsa', longitud: -76.78, ultimaActualizacion: 1_700_000_000_100,
    }));
  });
});

describe('tracking de emergencias', () => {
  it('el vecino lee y actualiza solo un tracking asociado a su UID', async () => {
    const ownerDb = testEnv.authenticatedContext('vecino-1', { role: 'VECINO' }).database();
    const otherDb = testEnv.authenticatedContext('vecino-2', { role: 'VECINO' }).database();
    await assertSucceeds(get(ref(ownerDb, 'tracking/emergencias/em-1')));
    await assertFails(get(ref(otherDb, 'tracking/emergencias/em-1')));
    await assertSucceeds(set(ref(ownerDb, 'tracking/emergencias/em-1'), {
      latitud: -11.99, longitud: -76.79, vecinoId: 'vecino-1',
      ultimaActualizacion: 1_700_000_000_200,
    }));
    await assertFails(set(ref(ownerDb, 'tracking/emergencias/em-1'), {
      latitud: -11.99, longitud: -76.79, vecinoId: 'vecino-2',
      ultimaActualizacion: 1_700_000_000_200,
    }));
  });

  it('una central puede leer pero no escribir tracking vecinal', async () => {
    const adminDb = testEnv.authenticatedContext('admin-1', { role: 'ADMIN' }).database();
    await assertSucceeds(get(ref(adminDb, 'tracking/emergencias')));
    await assertFails(set(ref(adminDb, 'tracking/emergencias/em-1/latitud'), -12));
  });
});
