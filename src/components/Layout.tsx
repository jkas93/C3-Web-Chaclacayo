import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { EmergencyAlertOverlay } from './EmergencyAlertOverlay';
import { SERVICIO_CONFIG } from '../types/enums';

export const Layout = () => {
  const { logout, rol, isAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isAdmin) {
      root.style.setProperty('--c3-primary', '#5C35C4'); // Morado Admin
      root.style.setProperty('--c3-primary-light', '#7b4fdb');
    } else if (rol === 'POLICIA') {
      root.style.setProperty('--c3-primary', '#1565C0'); // Azul Policía
      root.style.setProperty('--c3-primary-light', '#1e88e5');
    } else if (rol === 'SALUD') {
      root.style.setProperty('--c3-primary', '#2E7D32'); // Verde Salud
      root.style.setProperty('--c3-primary-light', '#43a047');
    } else if (rol === 'BOMBEROS') {
      root.style.setProperty('--c3-primary', '#B71C1C'); // Rojo Bomberos
      root.style.setProperty('--c3-primary-light', '#d32f2f');
    } else {
      root.style.removeProperty('--c3-primary');
      root.style.removeProperty('--c3-primary-light');
    }
  }, [rol, isAdmin]);

  // Obtener etiqueta del rol actual para mostrar en el sidebar
  const rolLabel = isAdmin
    ? { emoji: '👑', label: 'Administrador', color: '#5C35C4' }
    : rol
      ? { ...SERVICIO_CONFIG[rol as keyof typeof SERVICIO_CONFIG], label: `Operador ${SERVICIO_CONFIG[rol as keyof typeof SERVICIO_CONFIG]?.label ?? rol}` }
      : null;

  const navItems = [
    { path: '/', label: '🗺️ Mapa Táctico', id: 'nav-map' },
    { path: '/emergencias', label: '📋 Incidentes', id: 'nav-emergencias' },
    { path: '/patrulleros', label: '🚗 Unidades', id: 'nav-patrulleros' },
    { path: '/usuarios', label: '👥 Vecinos', id: 'nav-usuarios' },
    { path: '/historial', label: '📊 Historial', id: 'nav-historial' },
    // Ruta de operadores: solo visible para ADMIN
    ...(isAdmin ? [{ path: '/operadores', label: '🔐 Operadores', id: 'nav-operadores' }] : []),
  ];

  return (
    <>
      <EmergencyAlertOverlay />
      <div className="app-layout">
        {/* A6: Skip navigation link */}
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>

        {/* Mobile menu toggle */}
        <button
          className="btn btn--primary"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Abrir menú de navegación"
          aria-expanded={sidebarOpen}
          style={{
            display: 'none',
            position: 'fixed', top: 12, left: 12, zIndex: 2001,
            padding: '8px 12px', fontSize: '1.2rem'
          }}
          id="mobile-menu-toggle"
        >
          ☰
        </button>

        {/* Sidebar */}
        <aside
          className={`app-sidebar ${sidebarOpen ? 'app-sidebar--open' : ''}`}
          role="navigation"
          aria-label="Menú principal"
        >
          <div className="app-sidebar__header">
            <h2 className="app-sidebar__title">C3 Chaclacayo</h2>
            <span className="app-sidebar__subtitle">Centro de Comando</span>
            {/* Badge de rol del operador actual */}
            {rolLabel && (
              <div style={{
                marginTop: '8px',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.9)',
                padding: '3px 10px', borderRadius: '12px',
                fontSize: '0.75rem', fontWeight: 'bold',
                border: '1px solid rgba(255,255,255,0.2)'
              }}>
                {rolLabel.emoji} {rolLabel.label}
              </div>
            )}
          </div>

          <nav className="app-sidebar__nav" aria-label="Navegación principal">
            {navItems.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  id={item.id}
                  to={item.path}
                  className={`app-sidebar__link ${isActive ? 'app-sidebar__link--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="app-sidebar__footer">
            <button
              id="logout-button"
              onClick={logout}
              className="btn--logout"
              aria-label="Cerrar sesión del panel C3"
            >
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main id="main-content" className="app-main" role="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </>
  );
};
