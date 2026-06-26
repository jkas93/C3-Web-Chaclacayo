import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { functions, db } from '../services/firebase';
import { RolOperador, SERVICIO_CONFIG } from '../types/enums';
import type { OperadorC3 } from '../types/Usuario';
import { C3Dialog, C3RadioGroup } from '../components/ui';
import type { C3RadioOption } from '../components/ui';

// Roles disponibles para creación (sin ADMIN por seguridad)
const ROLES_CREABLES: Array<Exclude<RolOperador, 'ADMIN'>> = ['POLICIA', 'SALUD', 'BOMBEROS'];

export const OperadoresPage = () => {
  const { isAdmin } = useAuth();
  const [operadores, setOperadores] = useState<OperadorC3[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    confirmPassword: '',
    rol: '' as Exclude<RolOperador, 'ADMIN'> | '',
  });

  // Cargar operadores en tiempo real
  useEffect(() => {
    const q = query(collection(db, 'operadores_c3'), orderBy('creadoEn', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setOperadores(snap.docs.map(d => ({ uid: d.id, ...d.data() } as OperadorC3)));
      setLoading(false);
    });
    return unsub;
  }, []);

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--c3-text-muted)' }}>
        Solo el Administrador puede acceder a esta sección.
      </div>
    );
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.nombre.trim() || !formData.email.trim() || !formData.password || !formData.rol) {
      setErrorMsg('Todos los campos son obligatorios.');
      return;
    }
    if (formData.password.length < 8) {
      setErrorMsg('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setErrorMsg('El correo electrónico no tiene un formato válido.');
      return;
    }

    try {
      setIsSubmitting(true);
      const crearFn = httpsCallable(functions, 'crearOperadorC3');
      await crearFn({
        nombre: formData.nombre.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        rol: formData.rol,
      });
      setShowModal(false);
      setFormData({ nombre: '', email: '', password: '', confirmPassword: '', rol: '' });
    } catch (error) {
      setErrorMsg((error instanceof Error ? error.message : String(error)) || 'Error desconocido al crear el operador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRolConfig = (rol: string) => {
    if (rol === 'ADMIN') return { emoji: '👑', label: 'Administrador', color: '#5C35C4', bgColor: '#EDE7F6' };
    return SERVICIO_CONFIG[rol as keyof typeof SERVICIO_CONFIG] ?? { emoji: '❓', label: rol, color: '#666', bgColor: '#eee' };
  };

  // Opciones del RadioGroup de selección de rol
  const rolOptions: C3RadioOption[] = ROLES_CREABLES.map(r => {
    const cfg = SERVICIO_CONFIG[r];
    return {
      value: r,
      label: cfg.label,
      icon: cfg.emoji,
      color: cfg.color,
      bgColor: cfg.bgColor,
    };
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-header__title" id="operadores-heading">Operadores C3</h1>
        <button
          id="add-operador-btn"
          onClick={() => setShowModal(true)}
          className="btn btn--primary"
          aria-label="Agregar nuevo operador C3"
        >
          + Nuevo Operador
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        {/* Aviso informativo */}
        <div style={{
          background: '#FFF8E1', borderLeft: '4px solid #F9A825',
          padding: '10px 14px', borderRadius: '6px',
          fontSize: '0.85rem', color: '#5D4037', marginBottom: '1.5rem'
        }}>
          <strong>Nota de seguridad:</strong> Los operadores de servicio (Policía, Salud, Bomberos) solo podrán ver las
          emergencias y unidades de su propio servicio. Los operadores ADMIN no se pueden crear desde aquí.
        </div>

        {loading ? (
          <p role="status">Cargando operadores...</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol / Servicio</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {operadores.map(op => {
                  const cfg = getRolConfig(op.rol);
                  return (
                    <tr key={op.uid}>
                      <td style={{ fontWeight: 'bold' }}>{op.nombre}</td>
                      <td style={{ color: 'var(--c3-text-secondary)', fontSize: '0.9em' }}>{op.email}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          background: cfg.bgColor, color: cfg.color,
                          padding: '2px 10px', borderRadius: '12px',
                          fontSize: '0.8rem', fontWeight: 'bold'
                        }}>
                          {cfg.emoji} {cfg.label}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.8rem',
                          color: op.activo ? '#2E7D32' : '#C62828',
                          fontWeight: 'bold'
                        }}>
                          {op.activo ? '● Activo' : '○ Inactivo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {operadores.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--c3-text-muted)' }}>
                      No hay operadores registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de creación — ahora usa C3Dialog con focus trap y animaciones */}
      <C3Dialog
        open={showModal}
        onClose={() => { setShowModal(false); setErrorMsg(null); }}
        title="Nuevo Operador C3"
        maxWidth="480px"
      >
        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              background: '#FFEBEE', color: '#C62828',
              padding: '10px 14px', borderRadius: '6px',
              marginBottom: '1rem', fontSize: '0.85rem',
              border: '1px solid #FFCDD2',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleCrear} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Selector de Rol — ahora usa C3RadioGroup con teclado navigable */}
          <div className="form-group">
            <C3RadioGroup
              label="Servicio / Rol *"
              value={formData.rol}
              onChange={(val) => setFormData({ ...formData, rol: val as Exclude<RolOperador, 'ADMIN'> })}
              options={rolOptions}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op-nombre" className="form-label">
              Nombre completo <span style={{ color: '#C62828' }}>*</span>
            </label>
            <input
              id="op-nombre" required
              value={formData.nombre}
              onChange={e => setFormData({ ...formData, nombre: e.target.value })}
              className="form-input"
              placeholder="Ej. Carlos Mendoza"
            />
          </div>

          <div className="form-group">
            <label htmlFor="op-email" className="form-label">
              Correo electrónico <span style={{ color: '#C62828' }}>*</span>
            </label>
            <input
              id="op-email" type="email" required
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="form-input"
              placeholder="operador@chaclacayo.gob.pe"
            />
          </div>

          <div className="form-group">
            <label htmlFor="op-password" className="form-label">
              Contraseña <span style={{ color: '#C62828' }}>*</span>
            </label>
            <input
              id="op-password" type="password" required
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              className="form-input" minLength={8}
            />
            <small style={{ color: '#888' }}>Mínimo 8 caracteres</small>
          </div>

          <div className="form-group">
            <label htmlFor="op-confirm-password" className="form-label">
              Confirmar contraseña <span style={{ color: '#C62828' }}>*</span>
            </label>
            <input
              id="op-confirm-password" type="password" required
              value={formData.confirmPassword}
              onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="form-input"
              style={formData.confirmPassword && formData.password !== formData.confirmPassword
                ? { borderColor: '#C62828' } : {}}
            />
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <small style={{ color: '#C62828' }}>Las contraseñas no coinciden</small>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
            <button
              type="button" disabled={isSubmitting}
              onClick={() => { setShowModal(false); setErrorMsg(null); }}
              className="btn btn--ghost"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={isSubmitting}
              className="btn btn--primary"
              aria-busy={isSubmitting}
              style={{ opacity: isSubmitting ? 0.7 : 1 }}
            >
              {isSubmitting ? 'Creando operador...' : 'Crear Operador'}
            </button>
          </div>
        </form>
      </C3Dialog>
    </div>
  );
};
