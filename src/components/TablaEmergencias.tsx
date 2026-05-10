import { useState, useMemo } from 'react';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { EstadoEmergencia, EstadoPatrullero } from '../types/enums';

// M9: Función para cambiar estado de emergencia
const cambiarEstado = async (emergenciaId: string, nuevoEstado: string) => {
  try {
    await updateDoc(doc(db, 'emergencias', emergenciaId), { estado: nuevoEstado });
  } catch (err) {
    console.error('Error actualizando estado:', err);
  }
};

// L1: Asignación manual de patrullero
const asignarManualmente = async (emergenciaId: string, patrulleroId: string) => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'emergencias', emergenciaId), {
      patrullaAsignadaId: patrulleroId,
      estado: EstadoEmergencia.DESPACHADA
    });
    batch.update(doc(db, 'patrulleros', patrulleroId), {
      estado: EstadoPatrullero.EN_SERVICIO
    });
    await batch.commit();
  } catch (err) {
    console.error('Error asignando patrullero:', err);
  }
};

// P4: Cancelar emergencia y liberar patrullero
const cancelarEmergencia = async (emergenciaId: string, patrullaId: string | null) => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'emergencias', emergenciaId), { estado: EstadoEmergencia.CANCELADA });
    if (patrullaId) {
      batch.update(doc(db, 'patrulleros', patrullaId), { estado: EstadoPatrullero.DISPONIBLE });
    }
    await batch.commit();
  } catch (err) {
    console.error('Error cancelando emergencia:', err);
  }
};

const getEstadoBadgeClass = (estado: string) => {
  switch (estado) {
    case 'PENDIENTE': return 'badge badge--pendiente';
    case 'DESPACHADA': return 'badge badge--despachada';
    case 'EN_SITIO': return 'badge badge--en-sitio';
    case 'RESUELTA': return 'badge badge--resuelta';
    case 'COACCION': return 'badge badge--coaccion';
    case 'CANCELADA': return 'badge badge--cancelada';
    default: return 'badge';
  }
};

const getEstadoColor = (estado: string) => {
  switch (estado) {
    case 'PENDIENTE': return '#E02828';
    case 'DESPACHADA': return '#F6C23E';
    case 'EN_SITIO': return '#1E88E5';
    case 'RESUELTA': return '#43A047';
    case 'COACCION': return '#8B0000';
    case 'CANCELADA': return '#757575';
    default: return '#666';
  }
};

// O1: Filtros disponibles
const FILTROS = [
  { key: 'TODAS', label: 'Todas' },
  { key: 'PENDIENTE', label: '🔴 Pendientes' },
  { key: 'COACCION', label: '⚠️ Coacción' },
  { key: 'DESPACHADA', label: '🟡 Despachadas' },
  { key: 'EN_SITIO', label: '🔵 En Sitio' },
  { key: 'RESUELTA', label: '🟢 Resueltas' },
  { key: 'CANCELADA', label: '⚪ Canceladas' },
];

export const TablaEmergencias = () => {
  const { emergencias, loading } = useEmergencias();
  const { patrulleros } = usePatrulleros();

  // O1: Estado del filtro activo
  const [filtroActivo, setFiltroActivo] = useState('TODAS');
  // L1: Estado para dropdown de asignación manual
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // U1: Mapa de patrulleros para resolución de nombres
  const patrulleroMap = useMemo(() => {
    const map: Record<string, { nombre: string; codigo: string }> = {};
    patrulleros.forEach(p => {
      map[p.uid] = { nombre: p.nombre, codigo: p.codigo };
    });
    return map;
  }, [patrulleros]);

  // O1: Patrulleros disponibles para asignación manual
  const patrullerosDisponibles = useMemo(
    () => patrulleros.filter(p => p.estado === EstadoPatrullero.DISPONIBLE),
    [patrulleros]
  );

  // O1: Aplicar filtro
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

  // M9: Determinar siguiente estado válido para gestión
  const getNextAction = (estado: string): { label: string; nextEstado: string } | null => {
    switch (estado) {
      case 'PENDIENTE': return { label: 'Despachar', nextEstado: EstadoEmergencia.DESPACHADA };
      case 'DESPACHADA': return { label: 'En Sitio', nextEstado: EstadoEmergencia.EN_SITIO };
      case 'EN_SITIO': return { label: 'Resolver', nextEstado: EstadoEmergencia.RESUELTA };
      case 'COACCION': return { label: 'Resolver', nextEstado: EstadoEmergencia.RESUELTA };
      default: return null;
    }
  };

  return (
    <div style={{ overflowX: 'auto' }} role="region" aria-label="Tabla de emergencias">
      {/* O1: Barra de filtros */}
      <div style={{
        display: 'flex', gap: '6px', padding: '12px 0', flexWrap: 'wrap', marginBottom: '8px'
      }}>
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltroActivo(f.key)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: filtroActivo === f.key ? '2px solid var(--c3-primary, #0B2046)' : '1px solid #ddd',
              background: filtroActivo === f.key ? 'var(--c3-primary, #0B2046)' : 'white',
              color: filtroActivo === f.key ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: filtroActivo === f.key ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            {f.label} {f.key !== 'TODAS' ? `(${emergencias.filter(e => e.estado === f.key).length})` : `(${emergencias.length})`}
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
            <th scope="col">Tipo</th>
            <th scope="col">Estado</th>
            <th scope="col">Vecino</th>
            <th scope="col">Patrulla</th>
            <th scope="col">Fecha</th>
            <th scope="col">Coordenadas</th>
            <th scope="col">Audio</th>
            <th scope="col">Acción</th>
          </tr>
        </thead>
        <tbody>
          {emergenciasFiltradas.map((e) => {
            const nextAction = getNextAction(e.estado);
            // U1: Resolver nombre del patrullero
            const patInfo = e.patrullaAsignadaId ? patrulleroMap[e.patrullaAsignadaId] : null;
            const patDisplay = patInfo ? `${patInfo.nombre} (${patInfo.codigo})` : (e.patrullaAsignadaId || '—');
            // U1/P3: Resolver nombre del vecino
            const vecinoDisplay = e.vecinoNombre
              ? `${e.vecinoNombre}${e.vecinoDni ? ` (${e.vecinoDni})` : ''}`
              : (e.vecinoId?.substring(0, 10) || '—');

            return (
              <tr
                key={e.id}
                className={e.estado === EstadoEmergencia.COACCION ? 'row--coaccion' : ''}
              >
                <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem' }}>
                  {e.id.substring(0, 8)}...
                </td>
                <td style={{ fontWeight: 'bold' }}>{e.tipo}</td>
                <td>
                  <span className={getEstadoBadgeClass(e.estado)}>
                    {e.estado}
                  </span>
                </td>
                <td style={{ fontSize: '0.8rem' }}>
                  {vecinoDisplay}
                </td>
                <td style={{ fontSize: '0.8rem' }}>
                  {/* L1: Si está PENDIENTE sin patrullero, mostrar dropdown de asignación */}
                  {e.estado === 'PENDIENTE' && !e.patrullaAsignadaId && assigningId === e.id ? (
                    <select
                      onChange={(ev) => {
                        if (ev.target.value) {
                          asignarManualmente(e.id, ev.target.value);
                          setAssigningId(null);
                        }
                      }}
                      style={{ fontSize: '0.75rem', padding: '2px', maxWidth: '140px' }}
                      autoFocus
                      onBlur={() => setAssigningId(null)}
                    >
                      <option value="">Seleccionar...</option>
                      {patrullerosDisponibles.map(p => (
                        <option key={p.uid} value={p.uid}>
                          {p.nombre} ({p.codigo})
                        </option>
                      ))}
                    </select>
                  ) : patDisplay}
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
                    {/* L1: Botón de asignación manual */}
                    {e.estado === 'PENDIENTE' && !e.patrullaAsignadaId && patrullerosDisponibles.length > 0 && (
                      <button
                        onClick={() => setAssigningId(e.id)}
                        style={{
                          padding: '3px 8px', background: '#1976d2', color: 'white',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem'
                        }}
                        aria-label="Asignar patrullero manualmente"
                      >
                        Asignar
                      </button>
                    )}
                    {/* Estado normal: siguiente acción */}
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
                      <span style={{ color: 'var(--c3-success)', fontSize: '0.75rem' }} aria-label="Emergencia resuelta">✅</span>
                    ) : e.estado === 'CANCELADA' ? (
                      <span style={{ color: '#757575', fontSize: '0.75rem' }}>❌</span>
                    ) : null}
                    {/* P4: Botón de cancelación */}
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
                {filtroActivo === 'TODAS' ? 'Sin emergencias registradas.' : `No hay emergencias con estado ${filtroActivo}.`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
