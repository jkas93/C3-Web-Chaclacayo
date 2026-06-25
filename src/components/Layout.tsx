import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { EmergencyAlertOverlay } from './EmergencyAlertOverlay';
import { SERVICIO_CONFIG } from '../types/enums';
import { useEmergencias } from '../hooks/useEmergencias';
import { Map, AlertTriangle, Car, Users, History, Shield, LogOut, Menu, X } from 'lucide-react';

export const Layout = () => {
  const { logout, rol, isAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { emergencias } = useEmergencias(rol);

  const pendientesCount = emergencias.filter(e => e.estado === 'PENDIENTE').length;

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

  const rolLabel = isAdmin
    ? { icon: <Shield size={14} />, label: 'Administrador', color: '#5C35C4' }
    : rol
      ? { icon: <Shield size={14} />, label: `Operador ${SERVICIO_CONFIG[rol as keyof typeof SERVICIO_CONFIG]?.label ?? rol}` }
      : null;

  const navItems = [
    { path: '/', label: 'Mapa Táctico', id: 'nav-map', icon: <Map size={20} /> },
    { path: '/emergencias', label: 'Incidentes', id: 'nav-emergencias', icon: <AlertTriangle size={20} />, count: pendientesCount },
    { path: '/patrulleros', label: 'Unidades', id: 'nav-patrulleros', icon: <Car size={20} /> },
    { path: '/usuarios', label: 'Vecinos', id: 'nav-usuarios', icon: <Users size={20} /> },
    { path: '/historial', label: 'Historial', id: 'nav-historial', icon: <History size={20} /> },
    ...(isAdmin ? [{ path: '/operadores', label: 'Operadores', id: 'nav-operadores', icon: <Shield size={20} /> }] : []),
  ];

  return (
    <>
      <EmergencyAlertOverlay />
      <div className="app-layout">
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>

        {/* Mobile menu toggle */}
        <button
          className="mobile-toggle-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Abrir menú de navegación"
          aria-expanded={sidebarOpen}
          id="mobile-menu-toggle"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Sidebar */}
        <aside
          className={`app-sidebar ${sidebarOpen ? 'app-sidebar--open' : ''}`}
          role="navigation"
          aria-label="Menú principal"
        >
          <div className="app-sidebar__header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/c3_logo.png" alt="C3 Logo" style={{ width: '40px', height: '40px' }} />
            <div>
              <h2 className="app-sidebar__title">C3 Chaclacayo</h2>
              <span className="app-sidebar__subtitle">Centro de Comando</span>
            </div>
          </div>
          
          {rolLabel && (
            <div style={{ padding: '0 var(--c3-space-lg)' }}>
              <div style={{
                marginTop: '8px',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.9)',
                padding: '4px 12px', borderRadius: '16px',
                fontSize: '0.75rem', fontWeight: 'bold',
                border: '1px solid rgba(255,255,255,0.2)'
              }}>
                {rolLabel.icon} {rolLabel.label}
              </div>
            </div>
          )}

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
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.count != null && item.count > 0 && (
                    <span style={{
                      background: 'var(--c3-danger)', color: 'white',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold'
                    }}>
                      {item.count}
                    </span>
                  )}
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <LogOut size={18} /> Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main id="main-content" className="app-main" role="main" tabIndex={-1}>
          <div key={location.pathname} className="page-transition-wrapper">
            <style>{`
              @keyframes pageFadeIn {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
              }
              .page-transition-wrapper {
                animation: pageFadeIn 0.25s ease-out both;
                height: 100%;
                display: flex;
                flex-direction: column;
              }
            `}</style>
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
};
