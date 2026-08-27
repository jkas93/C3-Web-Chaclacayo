import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistorialPage } from '../HistorialPage';

const { getDocsMock } = vi.hoisted(() => ({ getDocsMock: vi.fn() }));

vi.mock('../../services/firebase', () => ({ db: {} }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ rol: 'ADMIN' }),
}));
vi.mock('../../hooks/usePatrulleros', () => ({
  usePatrulleros: () => ({
    loading: false,
    patrulleros: [
      { nombre: 'Agente Sintético E2E', uid: 'unidad-e2e' },
    ],
  }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args) => ({ args, kind: 'collection' })),
  getDocs: getDocsMock,
  limit: vi.fn((...args) => ({ args, kind: 'limit' })),
  orderBy: vi.fn((...args) => ({ args, kind: 'orderBy' })),
  query: vi.fn((...args) => ({ args, kind: 'query' })),
  where: vi.fn((...args) => ({ args, kind: 'where' })),
}));

describe('HistorialPage', () => {
  beforeEach(() => {
    const now = Date.now();
    getDocsMock.mockResolvedValue({
      docs: [
        {
          data: () => ({
            estado: 'RESUELTA',
            horaAsignacionMs: now + 30_000,
            patrullaAsignadaId: 'unidad-e2e',
            timestampMs: now,
            tipo: 'POLICIA',
            vecinoDni: '70000027',
            vecinoId: 'vecino-e2e',
            vecinoNombre: 'Vecino Sintético E2E',
          }),
          id: '7e5d3943-b0d9-4627-8757-72d6c9fb8995',
        },
      ],
    });
  });

  it('presenta una emergencia resuelta con participantes y métricas', async () => {
    render(<HistorialPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('RESUELTA')).toHaveClass('badge--resuelta');
    expect(
      within(table).getByText('Vecino Sintético E2E (70000027)'),
    ).toBeInTheDocument();
    expect(
      within(table).getByText('Agente Sintético E2E'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Total Emergencias').nextElementSibling,
    ).toHaveTextContent('1');
    expect(
      screen.getByText('SLA Promedio (Despacho)').nextElementSibling,
    ).toHaveTextContent('30s');
  });
});
