import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../LoginPage';

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: loginMock }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('envía las credenciales al flujo autenticado', async () => {
    loginMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText('Correo institucional'),
      'operador@example.test',
    );
    await user.type(
      screen.getByLabelText('Contraseña'),
      'clave-segura-prueba',
    );
    await user.click(screen.getByRole('button', { name: 'ACCEDER AL PANEL' }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith(
        'operador@example.test',
        'clave-segura-prueba',
      ),
    );
  });

  it('muestra un mensaje seguro cuando Firebase rechaza la credencial', async () => {
    loginMock.mockImplementation(() => {
      throw { code: 'auth/invalid-credential' };
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText('Correo institucional'),
      'operador@example.test',
    );
    await user.type(screen.getByLabelText('Contraseña'), 'clave-incorrecta');
    await user.click(screen.getByRole('button', { name: 'ACCEDER AL PANEL' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credenciales inválidas. Solo personal autorizado.',
    );
  });
});
