import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  // A5: Mensajes de error diferenciados por tipo
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      switch (firebaseError.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          setError('Credenciales inválidas. Solo personal autorizado.');
          break;
        case 'auth/user-not-found':
          setError('Usuario no encontrado en el sistema.');
          break;
        case 'auth/too-many-requests':
          setError('Demasiados intentos fallidos. Intente en unos minutos.');
          break;
        case 'auth/network-request-failed':
          setError('Error de conexión. Verifique su red.');
          break;
        default:
          setError('Error al iniciar sesión. Intente nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--c3-primary, #0B2046) 0%, var(--c3-primary-light, #1a3a6a) 100%)'
    }}>
      <form
        onSubmit={handleSubmit}
        aria-label="Formulario de inicio de sesión"
        style={{
          background: 'white',
          padding: '48px',
          borderRadius: 'var(--c3-radius-xl, 12px)',
          boxShadow: 'var(--c3-shadow-lg)',
          width: '400px',
          maxWidth: '90vw'
        }}
      >
        <h1 style={{ margin: '0 0 8px 0', color: 'var(--c3-primary, #0B2046)', fontSize: '1.8rem', textAlign: 'center' }}>
          C3 Chaclacayo
        </h1>
        <p style={{ margin: '0 0 32px 0', color: 'var(--c3-text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>
          Centro de Comando y Control — Acceso Restringido
        </p>

        {/* A4 FIX: Error with role=alert for screen readers */}
        {error && (
          <div role="alert" aria-live="assertive" style={{
            background: 'var(--c3-danger-bg)',
            color: 'var(--c3-danger-text)',
            padding: '12px',
            borderRadius: 'var(--c3-radius-md)',
            marginBottom: '16px',
            fontSize: '0.85rem',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* A4 FIX: Proper htmlFor + id association */}
        <div className="form-group">
          <label htmlFor="email-input" className="form-label">
            Correo institucional
          </label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operador@chaclacayo.gob.pe"
            required
            className="form-input"
            autoComplete="email"
            aria-required="true"
          />
        </div>

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label htmlFor="password-input" className="form-label">
            Contraseña
          </label>
          <input
            id="password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="form-input"
            autoComplete="current-password"
            aria-required="true"
          />
        </div>

        <button
          id="login-button"
          type="submit"
          disabled={loading}
          className="btn btn--primary"
          aria-busy={loading}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '1rem',
            letterSpacing: '1px',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'VERIFICANDO...' : 'ACCEDER AL PANEL'}
        </button>
      </form>
    </div>
  );
};
