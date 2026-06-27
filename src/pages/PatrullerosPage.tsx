import { useState, useEffect } from 'react';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../services/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { SERVICIO_CONFIG, TipoServicio } from '../types/enums';

export const PublicLinkManager = ({ rol }: { rol: string }) => {
  const [activeLink, setActiveLink] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (rol !== 'ADMIN') return;
    const q = query(collection(db, 'enlaces_publicos'), where('activo', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveLink({ id: snapshot.docs[0].id });
      } else {
        setActiveLink(null);
      }
    });
    return () => unsubscribe();
  }, [rol]);

  if (rol !== 'ADMIN') return null;

  const handleGenerate = async () => {
    try {
      const docRef = await addDoc(collection(db, 'enlaces_publicos'), {
        activo: true,
        createdAt: Date.now()
      });
      const url = `${window.location.origin}/publico/${docRef.id}`;
      await navigator.clipboard.writeText(url);
      alert(`Enlace generado y copiado:\n${url}`);
    } catch (e) {
      console.error(e);
      alert('Error al generar enlace');
    }
  };

  const handleRevoke = async () => {
    if (!activeLink) return;
    try {
      await updateDoc(doc(db, 'enlaces_publicos', activeLink.id), { activo: false });
      alert('El enlace ha sido caducado. Ya no se podrá acceder al mapa público con él.');
    } catch (e) {
      console.error(e);
      alert('Error al caducar enlace');
    }
  };

  const handleCopy = () => {
    if (!activeLink) return;
    const url = `${window.location.origin}/publico/${activeLink.id}`;
    navigator.clipboard.writeText(url);
    alert('Enlace copiado al portapapeles');
  };

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
      <div>
        <h2 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#1e293b' }}>🌐 Mapa Público en Vivo</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
          {activeLink ? 'Actualmente hay un enlace público activo.' : 'No hay ningún enlace público activo en este momento.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {activeLink ? (
          <>
            <button onClick={handleCopy} className="btn" style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', fontWeight: 600 }}>📋 Copiar URL</button>
            <button onClick={handleRevoke} className="btn" style={{ background: '#fee2e2', color: '#dc2626', border: 'none', fontWeight: 600 }}>🛑 Caducar Enlace</button>
          </>
        ) : (
          <button onClick={handleGenerate} className="btn btn--primary" style={{ fontWeight: 600 }}>✨ Generar Enlace</button>
        )}
      </div>
    </div>
  );
};

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

const isStale = (timestampMs: number | undefined): boolean => {
  if (!timestampMs) return true;
  return Date.now() - timestampMs > 30 * 60 * 1000;
};

const TURNO_OPTIONS = ['DIA', 'NOCHE'] as const;

export const PatrullerosPage = () => {
  const { rol } = useAuth();
  const { patrulleros } = usePatrulleros(rol);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    turno: 'DIA',
    tipoServicio: (rol === 'ADMIN' ? '' : rol) as TipoServicio | '',
    email: '',
    password: '',
  });

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.codigo || !formData.nombre || !formData.email || !formData.password || !formData.tipoServicio) {
      setErrorMsg('Por favor completa todos los campos, incluyendo el Tipo de Servicio.');
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      setIsSubmitting(true);
      const crearPatrulleroFn = httpsCallable(functions, 'crearPatrullero');
      await crearPatrulleroFn({
        codigo: formData.codigo.trim().toUpperCase(),
        nombre: formData.nombre.trim(),
        turno: formData.turno,
        tipoServicio: formData.tipoServicio,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      setShowModal(false);
      setFormData({ codigo: '', nombre: '', turno: 'DIA', tipoServicio: '', email: '', password: '' });
    } catch (error) {
      const msg = (error instanceof Error ? error.message : String(error)) || 'Error desconocido al crear unidad';
      console.error('Error al crear patrullero:', error);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'DISPONIBLE':        return 'var(--c3-success, #4CAF50)';
      case 'EN_SERVICIO':       return 'var(--c3-warning-dark, #F57C00)';
      default:                  return '#757575';
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-header__title" id="patrulleros-heading">Gestión de Unidades Móviles</h1>
        <button
          id="add-patrullero-btn"
          onClick={() => setShowModal(true)}
          className="btn btn--primary"
          aria-label="Agregar nueva unidad móvil"
        >
          + Nueva Unidad
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }} role="region" aria-labelledby="patrulleros-heading">
        <PublicLinkManager rol={rol!} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {patrulleros.map(p => {
            const stale = isStale(p.ultimaActualizacion);
            const shouldWarn = stale && p.estado !== 'FUERA_DE_SERVICIO';
            const servCfg = SERVICIO_CONFIG[p.tipoServicio] ?? { emoji: '❓', label: p.tipoServicio, color: '#666', bgColor: '#eee' };

            return (
              <article
                key={p.uid}
                className="card"
                style={{
                  borderLeft: `4px solid ${servCfg.color}`,
                  opacity: shouldWarn ? 0.7 : 1,
                  position: 'relative'
                }}
                aria-label={`Unidad ${p.nombre}, tipo: ${servCfg.label}, estado: ${p.estado}${shouldWarn ? ', sin señal reciente' : ''}`}
              >
                {shouldWarn && (
                  <div style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: '#FF5252', color: 'white', padding: '2px 8px',
                    borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold'
                  }}>
                    ⚠️ Sin señal
                  </div>
                )}

                {/* Badge de tipo de servicio */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: servCfg.bgColor, color: servCfg.color,
                  padding: '2px 8px', borderRadius: '12px',
                  fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '8px'
                }}>
                  {servCfg.emoji} {servCfg.label}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>{p.nombre}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--c3-text-secondary)', background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>
                      {p.codigo} — Turno: {p.turno}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: getEstadoColor(p.estado) }} role="status">
                    {p.estado}
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--c3-text-secondary)', marginTop: '12px', marginBottom: '4px' }}>
                  <span aria-hidden="true">📍</span> {p.latitud?.toFixed(4) ?? 'N/A'}, {p.longitud?.toFixed(4) ?? 'N/A'}
                </p>
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
            <p style={{ color: 'var(--c3-text-muted)' }}>No hay unidades registradas para este servicio.</p>
          )}
        </div>
      </div>

      {/* Modal de creación */}
      {showModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-content">
            <h2 id="modal-title">Nueva Unidad Móvil</h2>
            {errorMsg && (
              <div style={{ background: '#FFEBEE', color: '#C62828', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCrear} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Tipo de Servicio — Selector visual */}
              <div className="form-group">
                <label className="form-label">Tipo de Servicio <span style={{ color: '#C62828' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(Object.values(TipoServicio) as TipoServicio[])
                    .filter(tipo => rol === 'ADMIN' || tipo === rol) // Solo muestra su rol si no es admin
                    .map(tipo => {
                    const cfg = SERVICIO_CONFIG[tipo];
                    const selected = formData.tipoServicio === tipo;
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => setFormData({ ...formData, tipoServicio: tipo })}
                        disabled={rol !== 'ADMIN'} // Bloqueado si no es admin
                        style={{
                          flex: 1, minWidth: '90px',
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: selected ? `2px solid ${cfg.color}` : '2px solid #ddd',
                          background: selected ? cfg.bgColor : 'white',
                          color: selected ? cfg.color : '#555',
                          fontWeight: selected ? 'bold' : 'normal',
                          cursor: rol === 'ADMIN' ? 'pointer' : 'default',
                          fontSize: '0.85rem',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          transition: 'all 0.15s',
                        }}
                        aria-pressed={selected}
                      >
                        <span style={{ fontSize: '1.4rem' }}>{cfg.emoji}</span>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="pat-codigo" className="form-label">Código (Ej. P-01) <span style={{ color: '#C62828' }}>*</span></label>
                <input
                  id="pat-codigo" required
                  value={formData.codigo}
                  onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                  className="form-input" aria-required="true"
                  placeholder="P-01, S-01, B-01..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="pat-nombre" className="form-label">Nombre de la unidad <span style={{ color: '#C62828' }}>*</span></label>
                <input
                  id="pat-nombre" required
                  value={formData.nombre}
                  onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                  className="form-input" aria-required="true"
                  placeholder="Unidad Alpha, Ambulancia 1..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="pat-turno" className="form-label">Turno</label>
                <select
                  id="pat-turno"
                  value={formData.turno}
                  onChange={e => setFormData({ ...formData, turno: e.target.value })}
                  className="form-select"
                >
                  {TURNO_OPTIONS.map(t => (
                    <option key={t} value={t}>{t === 'DIA' ? '☀️ Día' : '🌙 Noche'}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="pat-email" className="form-label">Correo electrónico (acceso a la app) <span style={{ color: '#C62828' }}>*</span></label>
                <input
                  id="pat-email" type="email" required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="form-input" aria-required="true"
                />
              </div>

              <div className="form-group">
                <label htmlFor="pat-password" className="form-label">Contraseña <span style={{ color: '#C62828' }}>*</span></label>
                <input
                  id="pat-password" type="password" required
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="form-input" minLength={6} aria-required="true"
                />
                <small style={{ color: '#888' }}>Mínimo 6 caracteres</small>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
                <button type="button" disabled={isSubmitting} onClick={() => { setShowModal(false); setErrorMsg(null); }} className="btn btn--ghost">
                  Cancelar
                </button>
                <button
                  type="submit" disabled={isSubmitting}
                  className="btn btn--primary"
                  aria-busy={isSubmitting}
                  style={{ opacity: isSubmitting ? 0.7 : 1 }}
                >
                  {isSubmitting ? 'Guardando...' : 'Crear Unidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
