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
      background: 'linear-gradient(135deg, var(--c3-primary, #0B2046) 0%, var(--c3-primary-light, #1a3a6a) 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative background elements */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%', width: '40vw', height: '40vw',
        background: 'radial-gradient(circle, rgba(100,181,246,0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw',
        background: 'radial-gradient(circle, rgba(100,181,246,0.1) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%'
      }} />

      <form
        onSubmit={handleSubmit}
        aria-label="Formulario de inicio de sesión"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '48px',
          borderRadius: 'var(--c3-radius-xl, 16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          width: '400px',
          maxWidth: '90vw',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          animation: 'fadeSlideUp 0.6s ease-out',
          position: 'relative',
          zIndex: 1
        }}
      >
        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img 
            src="/c3_logo.png" 
            alt="C3 Chaclacayo Logo" 
            style={{ width: '80px', height: 'auto', marginBottom: '16px' }}
          />
          <h1 style={{ margin: '0 0 8px 0', color: 'var(--c3-primary, #0B2046)', fontSize: '1.8rem' }}>
            C3 Chaclacayo
          </h1>
          <p style={{ margin: 0, color: 'var(--c3-text-secondary)', fontSize: '0.9rem' }}>
            Centro de Comando y Control
          </p>
        </div>

        {/* A4 FIX: Error with role=alert for screen readers */}
        {error && (
          <div role="alert" aria-live="assertive" style={{
            background: 'var(--c3-danger-bg)',
            color: 'var(--c3-danger-text)',
            padding: '12px',
            borderRadius: 'var(--c3-radius-md)',
            marginBottom: '16px',
            fontSize: '0.85rem',
            textAlign: 'center',
            border: '1px solid var(--c3-danger)'
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
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '32px' }}>
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
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
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
            opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 12px rgba(11, 32, 70, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            if (!loading) e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            if (!loading) e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {loading ? 'VERIFICANDO...' : 'ACCEDER AL PANEL'}
        </button>
        
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--c3-text-muted)', margin: 0 }}>
            Municipalidad de Chaclacayo &copy; 2026
          </p>
        </div>
      </form>
    </div>
  );
};
