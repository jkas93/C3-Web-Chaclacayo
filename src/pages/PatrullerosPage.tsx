import { useState } from 'react';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

// O2: Helper para formatear tiempo relativo
const formatTimeAgo = (timestampMs: number | undefined): string => {
  if (!timestampMs) return 'Sin datos';
  const diff = Date.now() - timestampMs;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `hace ${seconds} seg`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours}h ${minutes % 60}m`;
};

// O3: Verificar si el patrullero está desactualizado (>30 min sin señal)
const isStale = (timestampMs: number | undefined): boolean => {
  if (!timestampMs) return true;
  return Date.now() - timestampMs > 30 * 60 * 1000;
};

export const PatrullerosPage = () => {
  const { patrulleros } = usePatrulleros();
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({ codigo: '', nombre: '', turno: 'DIA', email: '', password: '' });

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!formData.codigo || !formData.nombre || !formData.email || !formData.password) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }
    
    try {
      setIsSubmitting(true);
      const crearPatrulleroFn = httpsCallable(functions, 'crearPatrullero');
      await crearPatrulleroFn({
        codigo: formData.codigo,
        nombre: formData.nombre,
        turno: formData.turno,
        email: formData.email,
        password: formData.password
      });
      
      setShowModal(false);
      setFormData({ codigo: '', nombre: '', turno: 'DIA', email: '', password: '' });
    } catch (error: any) {
      const msg = error?.message || 'Error desconocido al crear patrullero';
      console.error("Error al crear patrullero:", error);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'DISPONIBLE': return 'var(--c3-success, #4CAF50)';
      case 'EN_SERVICIO': return 'var(--c3-warning-dark, #F57C00)';
      default: return '#757575';
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-header__title" id="patrulleros-heading">Gestión de Patrulleros</h1>
        <button 
          id="add-patrullero-btn"
          onClick={() => setShowModal(true)}
          className="btn btn--primary"
          aria-label="Agregar nueva unidad de patrullaje"
        >
          + Nueva Unidad
        </button>
      </header>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }} role="region" aria-labelledby="patrulleros-heading">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {patrulleros.map(p => {
            const stale = isStale(p.ultimaActualizacion);
            const shouldWarn = stale && p.estado !== 'FUERA_DE_SERVICIO';

            return (
              <article
                key={p.uid}
                className="card"
                style={{
                  borderLeft: `4px solid ${getEstadoColor(p.estado)}`,
                  opacity: shouldWarn ? 0.7 : 1,
                  position: 'relative'
                }}
                aria-label={`Patrullero ${p.nombre}, estado: ${p.estado}${shouldWarn ? ', sin señal reciente' : ''}`}
              >
                {/* O3: Badge de sin señal */}
                {shouldWarn && (
                  <div style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: '#FF5252', color: 'white', padding: '2px 8px',
                    borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold'
                  }}>
                    ⚠️ Sin señal
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>{p.nombre}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--c3-text-secondary)', background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>
                      {p.codigo} - Turno: {p.turno}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: getEstadoColor(p.estado) }} role="status">
                    {p.estado}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--c3-text-secondary)', marginTop: '12px', marginBottom: '4px' }}>
                  <span aria-hidden="true">📍</span> {p.latitud?.toFixed(4) ?? 'N/A'}, {p.longitud?.toFixed(4) ?? 'N/A'}
                </p>
                {/* O2: Última señal con tiempo relativo */}
                <p style={{
                  fontSize: '0.75rem',
                  color: shouldWarn ? '#FF5252' : 'var(--c3-text-muted)',
                  margin: '0',
                  fontWeight: shouldWarn ? 'bold' : 'normal'
                }}>
                  🕐 Última señal: {formatTimeAgo(p.ultimaActualizacion)}
                </p>
              </article>
            );
          })}
          {patrulleros.length === 0 && (
            <p style={{ color: 'var(--c3-text-muted)' }}>No hay patrulleros registrados.</p>
          )}
        </div>
      </div>

      {/* Modal de creación */}
      {showModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-content">
            <h2 id="modal-title">Nueva Unidad</h2>
            {errorMsg && (
              <div style={{ background: '#FFEBEE', color: '#C62828', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCrear} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="pat-codigo" className="form-label">Código (Ej. P-01)</label>
                <input id="pat-codigo" required value={formData.codigo} onChange={e => setFormData({...formData, codigo: e.target.value})} className="form-input" aria-required="true" />
              </div>
              <div className="form-group">
                <label htmlFor="pat-nombre" className="form-label">Nombre (Ej. Unidad Alpha)</label>
                <input id="pat-nombre" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="form-input" aria-required="true" />
              </div>
              <div className="form-group">
                <label htmlFor="pat-turno" className="form-label">Turno</label>
                <select id="pat-turno" value={formData.turno} onChange={e => setFormData({...formData, turno: e.target.value})} className="form-select">
                  <option value="DIA">Día</option>
                  <option value="NOCHE">Noche</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pat-email" className="form-label">Correo electrónico (Acceso App)</label>
                <input id="pat-email" type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="form-input" aria-required="true" />
              </div>
              <div className="form-group">
                <label htmlFor="pat-password" className="form-label">Contraseña</label>
                <input id="pat-password" type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="form-input" minLength={6} aria-required="true" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
                <button type="button" disabled={isSubmitting} onClick={() => setShowModal(false)} className="btn btn--ghost">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="btn btn--primary" aria-busy={isSubmitting} style={{ opacity: isSubmitting ? 0.7 : 1 }}>
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
