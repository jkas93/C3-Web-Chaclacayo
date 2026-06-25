import { useState, useMemo } from 'react';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { EstadoEmergencia, EstadoPatrullero, SERVICIO_CONFIG } from '../types/enums';
import type { TipoEmergencia } from '../types/enums';

// M9: Cambiar estado de emergencia
const cambiarEstado = async (emergenciaId: string, nuevoEstado: string) => {
  try {
    await updateDoc(doc(db, 'emergencias', emergenciaId), { estado: nuevoEstado });
  } catch (err) {
    console.error('Error actualizando estado:', err);
  }
};

// Asignación manual de unidad — filtra por tipo de servicio compatible
const asignarManualmente = async (emergenciaId: string, unidadId: string) => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'emergencias', emergenciaId), {
      patrullaAsignadaId: unidadId,
      estado: EstadoEmergencia.DESPACHADA,
    });
    batch.update(doc(db, 'patrulleros', unidadId), {
      estado: EstadoPatrullero.EN_SERVICIO,
    });
    await batch.commit();
  } catch (err) {
    console.error('Error asignando unidad:', err);
  }
};

// P4: Cancelar emergencia y liberar unidad
const cancelarEmergencia = async (emergenciaId: string, unidadId: string | null) => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'emergencias', emergenciaId), { estado: EstadoEmergencia.CANCELADA });
    if (unidadId) {
      batch.update(doc(db, 'patrulleros', unidadId), { estado: EstadoPatrullero.DISPONIBLE });
    }
    await batch.commit();
  } catch (err) {
    console.error('Error cancelando emergencia:', err);
  }
};

const getEstadoColor = (estado: string) => {
  switch (estado) {
    case 'PENDIENTE':  return '#E02828';
    case 'DESPACHADA': return '#F6C23E';
    case 'EN_SITIO':   return '#1E88E5';
    case 'RESUELTA':   return '#43A047';
    case 'COACCION':   return '#8B0000';
    case 'CANCELADA':  return '#757575';
    default:           return '#666';
  }
};

// Badge de tipo de servicio
const TipoBadge = ({ tipo }: { tipo: string }) => {
  const cfg = SERVICIO_CONFIG[tipo as TipoEmergencia];
  if (!cfg) return <span style={{ fontSize: '0.8rem', color: '#666' }}>{tipo}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      background: cfg.bgColor, color: cfg.color,
      padding: '2px 8px', borderRadius: '10px',
      fontSize: '0.78rem', fontWeight: 'bold',
      whiteSpace: 'nowrap',
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
};

// Filtros de estado
const FILTROS = [
  { key: 'TODAS',     label: 'Todas' },
  { key: 'PENDIENTE', label: '🔴 Pendientes' },
  { key: 'COACCION',  label: '⚠️ Coacción' },
  { key: 'DESPACHADA',label: '🟡 Despachadas' },
  { key: 'EN_SITIO',  label: '🔵 En Sitio' },
  { key: 'RESUELTA',  label: '🟢 Resueltas' },
  { key: 'CANCELADA', label: '❌ Canceladas' },
];

// Helpers for sorting and relative time
const getPrioridadEstado = (estado: string) => {
  switch (estado) {
    case 'COACCION': return 1;
    case 'PENDIENTE': return 2;
    case 'DESPACHADA': return 3;
    case 'EN_SITIO': return 4;
    case 'RESUELTA': return 5;
    case 'CANCELADA': return 6;
    default: return 99;
  }
};

const getRelativeTime = (ms: number) => {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'hace instantes';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(ms).toLocaleDateString('es-PE');
};

export const TablaEmergencias = () => {
  const { rol } = useAuth();
  const { emergencias, loading } = useEmergencias(rol);
  const { patrulleros } = usePatrulleros(rol);

  const [filtroActivo, setFiltroActivo] = useState('TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Mapa de unidades para resolución de nombres
  const unidadMap = useMemo(() => {
    const map: Record<string, { nombre: string; codigo: string; tipoServicio: string }> = {};
    patrulleros.forEach(p => {
      map[p.uid] = { nombre: p.nombre, codigo: p.codigo, tipoServicio: p.tipoServicio };
    });
    return map;
  }, [patrulleros]);

  // Aplicar filtro, búsqueda y ordenamiento
  const emergenciasFiltradas = useMemo(() => {
    let result = emergencias;
    
    // Filtro por estado
    if (filtroActivo !== 'TODAS') {
      result = result.filter(e => e.estado === filtroActivo);
    }
    
    // Búsqueda por nombre o DNI o ID
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      result = result.filter(e => 
        (e.vecinoNombre && e.vecinoNombre.toLowerCase().includes(term)) ||
        (e.vecinoDni && e.vecinoDni.includes(term)) ||
        e.id.toLowerCase().includes(term)
      );
    }
    
    // Ordenar: primero por prioridad de estado, luego por más reciente
    return result.sort((a, b) => {
      const pA = getPrioridadEstado(a.estado);
      const pB = getPrioridadEstado(b.estado);
      if (pA !== pB) return pA - pB;
      return b.timestampMs - a.timestampMs;
    });
  }, [emergencias, filtroActivo, searchTerm]);

  if (loading) return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[1,2,3,4,5].map(i => <div key={i} style={{ width: '80px', height: '30px', background: '#e0e0e0', borderRadius: '15px', animation: 'pulse 1.5s infinite' }} />)}
      </div>
      <table className="data-table" style={{ opacity: 0.5 }}>
        <thead><tr><th>ID</th><th>Servicio</th><th>Estado</th><th>Vecino</th><th>Unidad</th><th>Fecha</th></tr></thead>
        <tbody>
          {[1,2,3,4,5].map(i => (
            <tr key={i}>
              <td colSpan={6}><div style={{ height: '24px', background: '#e0e0e0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>
    </div>
  );

  const getNextAction = (estado: string): { label: string; nextEstado: string } | null => {
    switch (estado) {
      case 'PENDIENTE':  return { label: 'Despachar', nextEstado: EstadoEmergencia.DESPACHADA };
      case 'DESPACHADA': return { label: 'En Sitio',  nextEstado: EstadoEmergencia.EN_SITIO };
      case 'EN_SITIO':   return { label: 'Resolver',  nextEstado: EstadoEmergencia.RESUELTA };
      case 'COACCION':   return { label: 'Resolver',  nextEstado: EstadoEmergencia.RESUELTA };
      default: return null;
    }
  };

  return (
    <div style={{ overflowX: 'auto', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} role="region" aria-label="Tabla de emergencias">
      <style>{`
        @keyframes fadeInRow {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animated-row {
          animation: fadeInRow 0.3s ease-out forwards;
        }
      `}</style>
      
      {/* Barra de filtros y búsqueda */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltroActivo(f.key)}
              style={{
                padding: '6px 14px', borderRadius: '20px',
                border: filtroActivo === f.key ? '2px solid var(--c3-primary, #0B2046)' : '1px solid #e0e0e0',
                background: filtroActivo === f.key ? 'var(--c3-primary, #0B2046)' : 'white',
                color: filtroActivo === f.key ? 'white' : '#555',
                cursor: 'pointer', fontSize: '0.8rem',
                fontWeight: filtroActivo === f.key ? 'bold' : 'normal',
                transition: 'all 0.2s',
              }}
            >
              {f.label} {f.key !== 'TODAS'
                ? `(${emergencias.filter(e => e.estado === f.key).length})`
                : `(${emergencias.length})`}
            </button>
          ))}
        </div>
        
        <div>
          <input 
            type="search" 
            placeholder="Buscar vecino, DNI o ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: '1px solid #ccc',
              fontSize: '0.85rem',
              width: '250px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      <table className="data-table" aria-describedby="emergencias-caption">
        <caption id="emergencias-caption" className="sr-only">
          Registro de emergencias activas y resueltas del distrito de Chaclacayo
        </caption>
        <thead>
          <tr style={{ background: '#f5f7fa' }}>
            <th scope="col">ID</th>
            <th scope="col">Servicio</th>
            <th scope="col">Estado</th>
            <th scope="col">Vecino</th>
            <th scope="col">Unidad Asignada</th>
            <th scope="col">Tiempo</th>
            <th scope="col">Coordenadas</th>
            <th scope="col">Audio</th>
            <th scope="col">Acción</th>
          </tr>
        </thead>
        <tbody>
          {emergenciasFiltradas.map((e, index) => {
            const nextAction = getNextAction(e.estado);
            const unidadInfo = e.patrullaAsignadaId ? unidadMap[e.patrullaAsignadaId] : null;
            const unidadDisplay = unidadInfo
              ? `${unidadInfo.nombre} (${unidadInfo.codigo})`
              : (e.patrullaAsignadaId || '—');
            const vecinoDisplay = e.vecinoNombre
              ? `${e.vecinoNombre}${e.vecinoDni ? ` (${e.vecinoDni})` : ''}`
              : (e.vecinoId?.substring(0, 10) || '—');

            const unidadesCompatibles = patrulleros.filter(
              p => p.estado === EstadoPatrullero.DISPONIBLE && p.tipoServicio === e.tipo
            );

            const tipoServicioLabel = SERVICIO_CONFIG[e.tipo as TipoEmergencia];

            return (
              <tr
                key={e.id}
                className={`animated-row ${e.estado === EstadoEmergencia.COACCION ? 'row--coaccion' : ''}`}
                style={{ animationDelay: `${index * 0.03}s` }}
              >
                <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem', color: '#666' }}>
                  {e.id.substring(0, 8)}...
                </td>

                <td>
                  <TipoBadge tipo={e.tipo} />
                  {e.estado === EstadoEmergencia.COACCION && (
                    <span style={{
                      display: 'block', fontSize: '0.65rem',
                      color: '#8B0000', fontWeight: 'bold', marginTop: '4px'
                    }}>
                      ⚠️ COACCIÓN
                    </span>
                  )}
                </td>

                <td>
                  <span
                    className="badge"
                    style={{
                      background: getEstadoColor(e.estado),
                      color: 'white', padding: '4px 10px',
                      borderRadius: '12px', fontSize: '0.7rem',
                      fontWeight: 'bold', letterSpacing: '0.5px'
                    }}
                  >
                    {e.estado}
                  </span>
                </td>

                <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>{vecinoDisplay}</td>

                <td style={{ fontSize: '0.8rem', color: '#555' }}>
                  {e.estado === 'PENDIENTE' && !e.patrullaAsignadaId && assigningId === e.id ? (
                    <select
                      onChange={(ev) => {
                        if (ev.target.value) {
                          asignarManualmente(e.id, ev.target.value);
                          setAssigningId(null);
                        }
                      }}
                      style={{ fontSize: '0.75rem', padding: '4px', maxWidth: '150px', borderRadius: '4px' }}
                      autoFocus
                      onBlur={() => setAssigningId(null)}
                    >
                      <option value="">
                        {unidadesCompatibles.length === 0
                          ? `Sin unidades de ${tipoServicioLabel?.label ?? e.tipo}`
                          : 'Seleccionar...'}
                      </option>
                      {unidadesCompatibles.map(p => (
                        <option key={p.uid} value={p.uid}>
                          {tipoServicioLabel?.emoji} {p.nombre} ({p.codigo})
                        </option>
                      ))}
                    </select>
                  ) : unidadDisplay}
                </td>

                <td style={{ fontSize: '0.8rem', color: '#666' }}>
                  <div title={new Date(e.timestampMs).toLocaleString('es-PE')}>
                    {getRelativeTime(e.timestampMs)}
                  </div>
                </td>

                <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem', color: '#888' }}>
                  {e.latitud?.toFixed(4)}, {e.longitud?.toFixed(4)}
                </td>

                <td>
                  {e.audioUrl ? (
                    <a href={e.audioUrl} target="_blank" rel="noreferrer"
                       style={{ color: '#0288D1', textDecoration: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                       aria-label={`Escuchar audio`}>
                       ▶ Escuchar
                    </a>
                  ) : <span aria-label="Sin audio disponible" style={{ color: '#ccc' }}>—</span>}
                </td>

                <td>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {e.estado === 'PENDIENTE' && !e.patrullaAsignadaId && (
                      <button
                        onClick={() => setAssigningId(e.id)}
                        disabled={unidadesCompatibles.length === 0}
                        title={unidadesCompatibles.length === 0
                          ? `No hay unidades disponibles`
                          : 'Asignar unidad manualmente'}
                        style={{
                          padding: '4px 10px',
                          background: unidadesCompatibles.length > 0 ? '#1976d2' : '#ccc',
                          color: 'white', border: 'none',
                          borderRadius: '6px', cursor: unidadesCompatibles.length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: '0.7rem', fontWeight: 600
                        }}
                      >
                        Asignar
                      </button>
                    )}
                    {nextAction ? (
                      <button
                        onClick={() => cambiarEstado(e.id, nextAction.nextEstado)}
                        className="btn"
                        style={{
                          padding: '4px 12px',
                          backgroundColor: getEstadoColor(nextAction.nextEstado),
                          color: 'white', border: 'none', borderRadius: '6px',
                          cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      >
                        {nextAction.label}
                      </button>
                    ) : e.estado === 'RESUELTA' ? (
                      <span style={{ color: '#43A047', fontSize: '0.9rem' }} aria-label="Resuelta">✅</span>
                    ) : e.estado === 'CANCELADA' ? (
                      <span style={{ color: '#9E9E9E', fontSize: '0.9rem' }}>❌</span>
                    ) : null}
                    
                    {(e.estado === 'PENDIENTE' || e.estado === 'DESPACHADA') && (
                      <button
                        onClick={() => cancelarEmergencia(e.id, e.patrullaAsignadaId)}
                        style={{
                          padding: '4px 10px', background: '#f5f5f5', color: '#555',
                          border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem',
                          fontWeight: 500
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {emergenciasFiltradas.length === 0 && (
            <tr>
              <td colSpan={9} style={{ padding: '60px', textAlign: 'center', color: '#999' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
                {filtroActivo === 'TODAS' && searchTerm === ''
                  ? 'Sin emergencias registradas.'
                  : 'No se encontraron emergencias con los filtros actuales.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

