import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

// Storage Emulator aplica reglas al proyecto configurado por Firebase CLI.
const projectId = 'c3-chaclacayo';
let testEnv;
const audioBytes = new Uint8Array([79, 103, 103, 83]);
const imageBytes = new Uint8Array([82, 73, 70, 70]);

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'emergencias/em-1'), {
        vecinoId: 'vecino-1', tipo: 'POLICIA', patrullaAsignadaId: 'unidad-1', estado: 'DESPACHADA',
      }),
      setDoc(doc(db, 'operadores_c3/admin-1'), { rol: 'ADMIN', activo: true }),
      setDoc(doc(db, 'operadores_c3/policia-1'), { rol: 'POLICIA', activo: true }),
      setDoc(doc(db, 'operadores_c3/salud-1'), { rol: 'SALUD', activo: true }),
    ]);
    const storage = context.storage();
    await Promise.all([
      uploadBytes(ref(storage, 'emergencias_audio/em-1/evidencia.ogg'), audioBytes, { contentType: 'audio/ogg' }),
      uploadBytes(ref(storage, 'vecinos_fotos/vecino-1.webp'), imageBytes, { contentType: 'image/webp' }),
      uploadBytes(ref(storage, 'patrulleros_fotos/unidad-1.webp'), imageBytes, { contentType: 'image/webp' }),
    ]);
  });
});

describe('evidencia de emergencias', () => {
  it('el propietario puede cargar audio OGG y un tercero no', async () => {
    const ownerStorage = testEnv.authenticatedContext('vecino-1').storage();
    const otherStorage = testEnv.authenticatedContext('vecino-2').storage();
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'emergencias_audio/em-1/nueva.ogg'), audioBytes, { contentType: 'audio/ogg' },
    ));
    await assertFails(uploadBytes(
      ref(otherStorage, 'emergencias_audio/em-1/ajena.ogg'), audioBytes, { contentType: 'audio/ogg' },
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'emergencias_audio/em-1/falsa.txt'), audioBytes, { contentType: 'text/plain' },
    ));
  });

  it('la unidad asignada y la central correcta leen; anónimo y otra central no', async () => {
    const assigned = testEnv.authenticatedContext('unidad-1').storage();
    const police = testEnv.authenticatedContext('policia-1').storage();
    const health = testEnv.authenticatedContext('salud-1').storage();
    const anonymous = testEnv.unauthenticatedContext().storage();
    const path = 'emergencias_audio/em-1/evidencia.ogg';
    await assertSucceeds(getBytes(ref(assigned, path)));
    await assertSucceeds(getBytes(ref(police, path)));
    await assertFails(getBytes(ref(health, path)));
    await assertFails(getBytes(ref(anonymous, path)));
  });

  it('la evidencia no puede ser borrada ni reemplazada por el cliente', async () => {
    const owner = testEnv.authenticatedContext('vecino-1').storage();
    const path = 'emergencias_audio/em-1/evidencia.ogg';
    await assertFails(deleteObject(ref(owner, path)));
    await assertFails(uploadBytes(ref(owner, path), audioBytes, { contentType: 'audio/ogg' }));
  });
});

describe('fotografías de perfiles', () => {
  it('cada vecino escribe su propia foto y ADMIN puede leerla', async () => {
    const owner = testEnv.authenticatedContext('vecino-1').storage();
    const other = testEnv.authenticatedContext('vecino-2').storage();
    const admin = testEnv.authenticatedContext('admin-1').storage();
    const path = 'vecinos_fotos/vecino-1.webp';
    await assertSucceeds(uploadBytes(ref(owner, path), imageBytes, { contentType: 'image/webp' }));
    await assertFails(uploadBytes(ref(other, path), imageBytes, { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(ref(admin, path)));
  });

  it('cada unidad escribe su foto y los operadores pueden leerla', async () => {
    const unit = testEnv.authenticatedContext('unidad-1').storage();
    const operator = testEnv.authenticatedContext('policia-1').storage();
    const path = 'patrulleros_fotos/unidad-1.webp';
    await assertSucceeds(uploadBytes(ref(unit, path), imageBytes, { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(ref(operator, path)));
  });
});
