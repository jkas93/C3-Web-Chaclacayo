import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, isOperator, rol, logout } = useAuth();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Verificando acceso al sistema"
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--c3-primary, #0B2046)',
          color: 'white',
          fontSize: '1.2rem'
        }}
      >
        <span>Verificando acceso...</span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // M7: Verificar que el usuario sea operador C3 autorizado
  if (!isOperator) {
    return (
      <div
        role="alert"
        aria-label="Acceso denegado"
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--c3-primary, #0B2046) 0%, var(--c3-primary-light, #1a3a6a) 100%)',
          color: 'white',
          textAlign: 'center',
          padding: '2rem',
          gap: '1rem'
        }}
      >
        <div style={{ fontSize: '4rem' }} aria-hidden="true">⛔</div>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Acceso Denegado</h1>
        <p style={{ color: '#ccc', maxWidth: '400px' }}>
          Su cuenta no tiene permisos de operador C3.
          Contacte al administrador del sistema para solicitar acceso.
        </p>
        <button
          id="denied-logout-button"
          onClick={logout}
          className="btn"
          style={{
            marginTop: '1rem',
            padding: '12px 32px',
            background: 'transparent',
            color: 'white',
            border: '2px solid white',
            borderRadius: '6px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Cerrar Sesión
        </button>
      </div>
    );
  }

  if (allowedRoles && rol && !allowedRoles.includes(rol)) {
    return (
      <div
        role="alert"
        aria-label="Acceso restringido"
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--c3-primary, #0B2046) 0%, var(--c3-primary-light, #1a3a6a) 100%)',
          color: 'white',
          textAlign: 'center',
          padding: '2rem',
          gap: '1rem'
        }}
      >
        <div style={{ fontSize: '4rem' }} aria-hidden="true">🔒</div>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Acceso Restringido</h1>
        <p style={{ color: '#ccc', maxWidth: '400px' }}>
          Esta sección es exclusiva para administradores.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
