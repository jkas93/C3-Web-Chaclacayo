import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEmergencias } from '../useEmergencias';

const { databaseUnsubscribe, firestoreUnsubscribe } = vi.hoisted(() => ({
  databaseUnsubscribe: vi.fn(),
  firestoreUnsubscribe: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({ db: {}, database: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((_query, callback) => {
    callback({
      docs: [
        {
          id: 'emergencia-e2e',
          data: () => ({
            estado: 'DESPACHADA',
            timestampMs: 1,
            tipo: 'POLICIA',
          }),
        },
      ],
    });
    return firestoreUnsubscribe;
  }),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  onValue: vi.fn((_ref, callback) => {
    callback({
      val: () => ({
        'emergencia-e2e': {
          latitud: -11.9765,
          longitud: -76.7725,
        },
      }),
    });
    return databaseUnsubscribe;
  }),
  ref: vi.fn(),
}));

describe('useEmergencias', () => {
  it('combina el documento operativo con el tracking en tiempo real', async () => {
    const { result, unmount } = renderHook(() => useEmergencias('ADMIN'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.emergencias).toEqual([
      expect.objectContaining({
        estado: 'DESPACHADA',
        id: 'emergencia-e2e',
        latitudActual: -11.9765,
        longitudActual: -76.7725,
      }),
    ]);

    unmount();
    expect(firestoreUnsubscribe).toHaveBeenCalledOnce();
    expect(databaseUnsubscribe).toHaveBeenCalledOnce();
  });
});
