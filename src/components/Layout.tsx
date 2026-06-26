import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { EmergencyAlertOverlay } from './EmergencyAlertOverlay';
import { SERVICIO_CONFIG } from '../types/enums';
import { useEmergencias } from '../hooks/useEmergencias';
import {
  Map, AlertTriangle, Car, Users, History,
  Shield, LogOut, Menu, X, ChevronDown, User
} from 'lucide-react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import { C3Menu, C3Transition } from './ui';

interface NavItem {
  path: string;
  label: string;
  id: string;
  icon: React.ReactNode;
  count?: number;
}

interface SidebarContentProps {
  navItems: NavItem[];
  rolLabel: { label: string } | null;
  onNavClick: () => void;
  onClose?: () => void;
  showCloseBtn?: boolean;
  userMenuItems: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
  }>;
}

const SidebarContent = ({
  navItems,
  rolLabel,
  onNavClick,
  onClose,
  showCloseBtn = false,
  userMenuItems,
}: SidebarContentProps) => {
  const location = useLocation();
  return (
    <>
      {/* Botón cerrar (solo en mobile) */}
      {showCloseBtn && onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%', width: '32px', height: '32px',
            cursor: 'pointer', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      )}

      {/* Header */}
      <div className="app-sidebar__header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img src="/c3_logo.png" alt="C3 Logo" style={{ width: '32px', height: '32px', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }} />
        <div>
          <h2 className="app-sidebar__title" style={{ color: '#111827', fontSize: '1.125rem', fontWeight: 600 }}>C3 Chaclacayo</h2>
          <span className="app-sidebar__subtitle" style={{ color: '#6b7280', fontSize: '0.75rem' }}>Centro de Comando</span>
        </div>
      </div>

      {/* Badge de rol */}
      {rolLabel && (
        <div style={{ padding: '0 1rem' }}>
          <div style={{
            marginTop: '8px',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: '#f3f4f6',
            color: '#374151',
            padding: '4px 12px', borderRadius: '9999px',
            fontSize: '0.75rem', fontWeight: 500,
            border: '1px solid #e5e7eb'
          }}>
            <Shield size={12} style={{ color: '#6b7280' }} />
            {rolLabel.label}
          </div>
        </div>
      )}

      {/* Navigation */}
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
              onClick={onNavClick}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.count != null && item.count > 0 && (
                <span style={{
                  background: 'var(--c3-danger)', color: 'white',
                  padding: '2px 8px', borderRadius: '12px',
                  fontSize: '0.75rem', fontWeight: 'bold'
                }}>
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: User menu */}
      <div className="app-sidebar__footer">
        <C3Menu
          trigger={
            <div className="c3-user-menu-trigger" role="button" tabIndex={0} aria-label="Menú de usuario" style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
              padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
              color: '#374151', fontWeight: 500, fontSize: '0.875rem',
              transition: 'background-color 150ms ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                <User size={16} />
              </div>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {rolLabel?.label ?? 'Usuario'}
              </span>
              <ChevronDown size={16} style={{ color: '#9ca3af' }} />
            </div>
          }
          items={userMenuItems}
          anchor="top start"
        />
      </div>
    </>
  );
};

export const Layout = () => {
  const { logout, rol, isAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { emergencias } = useEmergencias(rol);

  const pendientesCount = emergencias.filter(e => e.estado === 'PENDIENTE').length;

  const rolLabel = isAdmin
    ? { label: 'Administrador' }
    : rol
      ? { label: `Operador ${SERVICIO_CONFIG[rol as keyof typeof SERVICIO_CONFIG]?.label ?? rol}` }
      : null;

  const navItems: NavItem[] = [
    { path: '/',            label: 'Mapa Táctico', id: 'nav-map',         icon: <Map size={20} /> },
    { path: '/emergencias', label: 'Incidentes',   id: 'nav-emergencias', icon: <AlertTriangle size={20} />, count: pendientesCount },
    { path: '/patrulleros', label: 'Unidades',     id: 'nav-patrulleros', icon: <Car size={20} /> },
    { path: '/usuarios',    label: 'Vecinos',      id: 'nav-usuarios',    icon: <Users size={20} /> },
    { path: '/historial',   label: 'Historial',    id: 'nav-historial',   icon: <History size={20} /> },
    ...(isAdmin ? [{ path: '/operadores', label: 'Operadores', id: 'nav-operadores', icon: <Shield size={20} /> }] : []),
  ];

  const userMenuItems = [
    {
      label: 'Cerrar Sesión',
      icon: <LogOut size={16} />,
      onClick: logout,
      danger: true,
    },
  ];

  const sidebarProps = {
    navItems,
    rolLabel,
    onNavClick: () => setSidebarOpen(false),
    userMenuItems,
  };

  return (
    <div style={{ backgroundColor: '#f9fafb' }}>
      <EmergencyAlertOverlay />
      <div className="app-layout">
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>

        {/* Mobile menu toggle button */}
        <button
          className="mobile-toggle-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú de navegación"
          aria-expanded={sidebarOpen}
          id="mobile-menu-toggle"
        >
          <Menu size={24} />
        </button>

        {/* Desktop Sidebar */}
        <aside className="app-sidebar" role="navigation" aria-label="Menú principal">
          <SidebarContent {...sidebarProps} />
        </aside>

        {/* Mobile Sidebar — Dialog con Transition de Headless UI */}
        <Transition show={sidebarOpen} as="div">
          <Dialog
            onClose={() => setSidebarOpen(false)}
            className="c3-sidebar-dialog-root"
            aria-label="Menú de navegación móvil"
          >
            {/* Backdrop */}
            <TransitionChild>
              <DialogBackdrop className="c3-sidebar-backdrop" />
            </TransitionChild>

            {/* Sidebar panel deslizante */}
            <TransitionChild>
              <DialogPanel
                className="app-sidebar"
                style={{
                  position: 'fixed',
                  top: 0, left: 0, bottom: 0,
                  zIndex: 1060,
                  transition: 'transform 250ms ease, opacity 250ms ease',
                }}
              >
                <SidebarContent
                  {...sidebarProps}
                  showCloseBtn
                  onClose={() => setSidebarOpen(false)}
                />
              </DialogPanel>
            </TransitionChild>
          </Dialog>
        </Transition>

        {/* Main Content con transición de página */}
        <main id="main-content" className="app-main" role="main" tabIndex={-1}>
          <C3Transition show key={location.pathname} preset="fadeSlideUp">
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Outlet />
            </div>
          </C3Transition>
        </main>
      </div>
    </div>
  );
};
