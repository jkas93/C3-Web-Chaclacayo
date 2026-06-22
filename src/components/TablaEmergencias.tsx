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
  { key: 'CANCELADA', label: '⚪ Canceladas' },
];

export const TablaEmergencias = () => {
  const { rol } = useAuth();
  const { emergencias, loading } = useEmergencias(rol);
  const { patrulleros } = usePatrulleros(rol);

  const [filtroActivo, setFiltroActivo] = useState('TODAS');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Mapa de unidades para resolución de nombres
  const unidadMap = useMemo(() => {
    const map: Record<string, { nombre: string; codigo: string; tipoServicio: string }> = {};
    patrulleros.forEach(p => {
      map[p.uid] = { nombre: p.nombre, codigo: p.codigo, tipoServicio: p.tipoServicio };
    });
    return map;
  }, [patrulleros]);

  // Aplicar filtro de estado
  const emergenciasFiltradas = useMemo(() => {
    if (filtroActivo === 'TODAS') return emergencias;
    return emergencias.filter(e => e.estado === filtroActivo);
  }, [emergencias, filtroActivo]);

  if (loading) return (
    <div role="status" aria-live="polite" style={{ padding: '20px', color: '#666' }}>
      Cargando emergencias...
    </div>
  );

  const formatTime = (ms: number) => {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  };

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
    <div style={{ overflowX: 'auto' }} role="region" aria-label="Tabla de emergencias">
      {/* Barra de filtros de estado */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 0', flexWrap: 'wrap', marginBottom: '8px' }}>
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltroActivo(f.key)}
            style={{
              padding: '6px 14px', borderRadius: '20px',
              border: filtroActivo === f.key ? '2px solid var(--c3-primary, #0B2046)' : '1px solid #ddd',
              background: filtroActivo === f.key ? 'var(--c3-primary, #0B2046)' : 'white',
              color: filtroActivo === f.key ? 'white' : '#333',
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

      <table className="data-table" aria-describedby="emergencias-caption">
        <caption id="emergencias-caption" className="sr-only">
          Registro de emergencias activas y resueltas del distrito de Chaclacayo
        </caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Servicio</th>
            <th scope="col">Estado</th>
            <th scope="col">Vecino</th>
            <th scope="col">Unidad Asignada</th>
            <th scope="col">Fecha</th>
            <th scope="col">Coordenadas</th>
            <th scope="col">Audio</th>
            <th scope="col">Acción</th>
          </tr>
        </thead>
        <tbody>
          {emergenciasFiltradas.map((e) => {
            const nextAction = getNextAction(e.estado);
            const unidadInfo = e.patrullaAsignadaId ? unidadMap[e.patrullaAsignadaId] : null;
            const unidadDisplay = unidadInfo
              ? `${unidadInfo.nombre} (${unidadInfo.codigo})`
              : (e.patrullaAsignadaId || '—');
            const vecinoDisplay = e.vecinoNombre
              ? `${e.vecinoNombre}${e.vecinoDni ? ` (${e.vecinoDni})` : ''}`
              : (e.vecinoId?.substring(0, 10) || '—');

            // Unidades disponibles filtradas por tipo de emergencia
            const unidadesCompatibles = patrulleros.filter(
              p => p.estado === EstadoPatrullero.DISPONIBLE && p.tipoServicio === e.tipo
            );

            const tipoServicioLabel = SERVICIO_CONFIG[e.tipo as TipoEmergencia];

            return (
              <tr
                key={e.id}
                className={e.estado === EstadoEmergencia.COACCION ? 'row--coaccion' : ''}
              >
                <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem' }}>
                  {e.id.substring(0, 8)}...
                </td>

                {/* Tipo de servicio con badge visual */}
                <td>
                  <TipoBadge tipo={e.tipo} />
                  {e.estado === EstadoEmergencia.COACCION && (
                    <span style={{
                      display: 'block', fontSize: '0.65rem',
                      color: '#8B0000', fontWeight: 'bold', marginTop: '2px'
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
                      color: 'white', padding: '3px 8px',
                      borderRadius: '10px', fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}
                  >
                    {e.estado}
                  </span>
                </td>

                <td style={{ fontSize: '0.8rem' }}>{vecinoDisplay}</td>

                <td style={{ fontSize: '0.8rem' }}>
                  {/* Asignación manual — solo unidades del mismo tipo de servicio */}
                  {e.estado === 'PENDIENTE' && !e.patrullaAsignadaId && assigningId === e.id ? (
                    <select
                      onChange={(ev) => {
                        if (ev.target.value) {
                          asignarManualmente(e.id, ev.target.value);
                          setAssigningId(null);
                        }
                      }}
                      style={{ fontSize: '0.75rem', padding: '2px', maxWidth: '150px' }}
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

                <td>{formatTime(e.timestampMs)}</td>

                <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem' }}>
                  {e.latitud?.toFixed(4)}, {e.longitud?.toFixed(4)}
                </td>

                <td>
                  {e.audioUrl ? (
                    <a href={e.audioUrl} target="_blank" rel="noreferrer"
                       style={{ color: 'var(--c3-info)', textDecoration: 'none' }}
                       aria-label={`Escuchar audio de emergencia ${e.id.substring(0, 8)}`}>
                      🎤 Escuchar
                    </a>
                  ) : <span aria-label="Sin audio disponible">—</span>}
                </td>

                <td>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {/* Asignar manualmente — solo si hay unidades del tipo correcto */}
                    {e.estado === 'PENDIENTE' && !e.patrullaAsignadaId && (
                      <button
                        onClick={() => setAssigningId(e.id)}
                        disabled={unidadesCompatibles.length === 0}
                        title={unidadesCompatibles.length === 0
                          ? `No hay unidades de ${tipoServicioLabel?.label ?? e.tipo} disponibles`
                          : 'Asignar unidad manualmente'}
                        style={{
                          padding: '3px 8px',
                          background: unidadesCompatibles.length > 0 ? '#1976d2' : '#ccc',
                          color: 'white', border: 'none',
                          borderRadius: '4px', cursor: unidadesCompatibles.length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: '0.7rem'
                        }}
                        aria-label="Asignar unidad manualmente"
                      >
                        Asignar
                      </button>
                    )}
                    {/* Siguiente estado */}
                    {nextAction ? (
                      <button
                        onClick={() => cambiarEstado(e.id, nextAction.nextEstado)}
                        className="btn"
                        style={{
                          padding: '4px 10px',
                          backgroundColor: getEstadoColor(nextAction.nextEstado),
                          color: 'white', border: 'none', borderRadius: '4px',
                          cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold'
                        }}
                        aria-label={`${nextAction.label} emergencia ${e.id.substring(0, 8)}`}
                      >
                        {nextAction.label}
                      </button>
                    ) : e.estado === 'RESUELTA' ? (
                      <span style={{ color: 'var(--c3-success)', fontSize: '0.75rem' }} aria-label="Resuelta">✅</span>
                    ) : e.estado === 'CANCELADA' ? (
                      <span style={{ color: '#757575', fontSize: '0.75rem' }}>❌</span>
                    ) : null}
                    {/* Cancelar */}
                    {(e.estado === 'PENDIENTE' || e.estado === 'DESPACHADA') && (
                      <button
                        onClick={() => cancelarEmergencia(e.id, e.patrullaAsignadaId)}
                        style={{
                          padding: '3px 8px', background: '#757575', color: 'white',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem'
                        }}
                        aria-label={`Cancelar emergencia ${e.id.substring(0, 8)}`}
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
              <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--c3-text-muted)' }}>
                {filtroActivo === 'TODAS'
                  ? 'Sin emergencias registradas.'
                  : `No hay emergencias con estado ${filtroActivo}.`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
