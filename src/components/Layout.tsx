import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { EmergencyAlertOverlay } from './EmergencyAlertOverlay';

export const Layout = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/', label: '🗺️ Mapa Táctico', id: 'nav-map' },
    { path: '/emergencias', label: '📋 Incidentes', id: 'nav-emergencias' },
    { path: '/patrulleros', label: '🚓 Patrulleros', id: 'nav-patrulleros' },
    { path: '/usuarios', label: '👥 Vecinos', id: 'nav-usuarios' },
    { path: '/historial', label: '📊 Historial', id: 'nav-historial' }
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
