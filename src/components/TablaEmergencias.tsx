import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { EstadoEmergencia, EstadoPatrullero, SERVICIO_CONFIG } from '../types/enums';
import type { TipoEmergencia } from '../types/enums';
import { C3Tabs, C3Listbox, C3Combobox, C3Dialog, C3StatusBadge } from './ui';
import type { C3TabItem, C3ListboxOption } from './ui';
import {
  Ambulance, CheckCircle2, CircleSlash2, Flame, Inbox,
  ShieldAlert, ShieldCheck, Volume2
} from 'lucide-react';

// M9: Cambiar estado de emergencia
const gestionarEmergencia = httpsCallable(functions, 'gestionarEmergencia');

const marcarEnSitio = async (emergenciaId: string) => {
  try {
    await gestionarEmergencia({ emergenciaId, accion: 'MARCAR_EN_SITIO' });
  } catch (err) {
    console.error('Error actualizando estado:', err);
    alert(err instanceof Error ? err.message : 'No se pudo actualizar la emergencia.');
  }
};

// Asignación manual de unidad
const asignarManualmente = async (emergenciaId: string, unidadId: string) => {
  try {
    await gestionarEmergencia({ emergenciaId, accion: 'ASIGNAR', unidadId });
  } catch (err) {
    console.error('Error asignando unidad:', err);
    alert(err instanceof Error ? err.message : 'No se pudo asignar la unidad.');
  }
};

type OperacionEmergencia = 'RESOLVER' | 'CANCELAR' | 'ESCALAR';

const OPERACION_CONFIG: Record<OperacionEmergencia, { titulo: string; etiqueta: string; ayuda: string }> = {
  RESOLVER: {
    titulo: 'Resolver emergencia',
    etiqueta: 'Resultado de la atención',
    ayuda: 'Registre el resultado operativo y cualquier observación relevante.',
  },
  CANCELAR: {
    titulo: 'Cancelar emergencia',
    etiqueta: 'Motivo de cierre o cancelación',
    ayuda: 'Explique por qué se cancela el caso. Esta acción quedará auditada.',
  },
  ESCALAR: {
    titulo: 'Escalar emergencia',
    etiqueta: 'Central externa y motivo del escalamiento',
    ayuda: 'Indique la central contactada, la referencia de coordinación disponible y el motivo.',
  },
};

const getEstadoColor = (estado: string) => {
  switch (estado) {
    case 'PENDIENTE':  return 'var(--c3-danger)';
    case 'PENDIENTE_SIN_UNIDAD': return 'var(--c3-warning)';
    case 'DESPACHADA': return 'var(--c3-info)';
    case 'EN_SITIO':   return 'var(--c3-coaction)';
    case 'RESUELTA':   return 'var(--c3-success)';
    case 'COACCION':   return 'var(--c3-coaction)';
    case 'CANCELADA':  return 'var(--c3-text-muted)';
    case 'ESCALADA':   return 'var(--c3-coaction)';
    default:           return 'var(--c3-text-secondary)';
  }
};

// Badge de tipo de servicio
const TipoBadge = ({ tipo }: { tipo: string }) => {
  const cfg = SERVICIO_CONFIG[tipo as TipoEmergencia];
  if (!cfg) return <span className="c3-service-badge">{tipo}</span>;
  const icon = tipo === 'BOMBEROS'
    ? <Flame size={15} aria-hidden="true" />
    : tipo === 'SALUD'
      ? <Ambulance size={15} aria-hidden="true" />
      : <ShieldCheck size={15} aria-hidden="true" />;
  const color = tipo === 'BOMBEROS'
    ? 'var(--c3-service-fire)'
    : tipo === 'SALUD'
      ? 'var(--c3-service-health)'
      : 'var(--c3-service-police)';
  return (
    <span className="c3-service-badge" style={{ '--service-color': color } as React.CSSProperties}>
      {icon} {cfg.label}
    </span>
  );
};

// Definición de filtros de estado como tabs
const FILTROS_KEYS = ['TODAS', 'PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION', 'DESPACHADA', 'EN_SITIO', 'ESCALADA', 'RESUELTA', 'CANCELADA'] as const;
type FiltroKey = typeof FILTROS_KEYS[number];

const FILTRO_LABELS: Record<FiltroKey, string> = {
  PENDIENTE_SIN_UNIDAD: 'Sin unidad',
  ESCALADA: 'Escaladas',
  TODAS:     'Todas',
  PENDIENTE: 'Pendientes',
  COACCION:  'Coacción',
  DESPACHADA: 'Despachadas',
  EN_SITIO:  'En Sitio',
  RESUELTA:  'Resueltas',
  CANCELADA: 'Canceladas',
};

// Helpers
const getPrioridadEstado = (estado: string, prioridad?: string, esCoaccion?: boolean) => {
  if (prioridad === 'P1' || esCoaccion) return 1;
  if (prioridad === 'P2') return 2;
  switch (estado) {
    case 'COACCION':   return 1;
    case 'PENDIENTE_SIN_UNIDAD': return 2;
    case 'PENDIENTE':  return 3;
    case 'ESCALADA':   return 4;
    case 'DESPACHADA': return 5;
    case 'EN_SITIO':   return 6;
    case 'RESUELTA':   return 7;
    case 'CANCELADA':  return 8;
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

  const [filtroIndex, setFiltroIndex] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [operacion, setOperacion] = useState<{ emergenciaId: string; tipo: OperacionEmergencia } | null>(null);
  const [motivoOperacion, setMotivoOperacion] = useState('');
  const [esFalsaAlarma, setEsFalsaAlarma] = useState(false);
  const [operacionError, setOperacionError] = useState('');
  const [operacionEnCurso, setOperacionEnCurso] = useState(false);

  const abrirOperacion = (emergenciaId: string, tipo: OperacionEmergencia) => {
    setOperacion({ emergenciaId, tipo });
    setMotivoOperacion('');
    setEsFalsaAlarma(false);
    setOperacionError('');
  };

  const cerrarOperacion = () => {
    if (operacionEnCurso) return;
    setOperacion(null);
    setMotivoOperacion('');
    setEsFalsaAlarma(false);
    setOperacionError('');
  };

  const ejecutarOperacion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!operacion) return;

    const motivo = motivoOperacion.trim();
    if (motivo.length < 5) {
      setOperacionError('Registre un motivo de al menos 5 caracteres.');
      return;
    }

    const accion = operacion.tipo === 'CANCELAR' && esFalsaAlarma
      ? 'FALSA_ALARMA'
      : operacion.tipo;

    setOperacionEnCurso(true);
    setOperacionError('');
    try {
      await gestionarEmergencia({ emergenciaId: operacion.emergenciaId, accion, motivo });
      setOperacion(null);
      setMotivoOperacion('');
      setEsFalsaAlarma(false);
    } catch (err) {
      console.error('Error gestionando emergencia:', err);
      setOperacionError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setOperacionEnCurso(false);
    }
  };

  const filtroActivo: FiltroKey = FILTROS_KEYS[filtroIndex];

  // Mapa de unidades para resolución de nombres
  const unidadMap = useMemo(() => {
    const map: Record<string, { nombre: string; tipoServicio: string }> = {};
    patrulleros.forEach(p => {
      map[p.uid] = { nombre: p.nombre, tipoServicio: p.tipoServicio };
    });
    return map;
  }, [patrulleros]);

  // Opciones del combobox de búsqueda: vecinos únicos de las emergencias
  const searchOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; subLabel?: string }[] = [];
    emergencias.forEach(e => {
      if (e.vecinoNombre && !seen.has(e.vecinoId ?? e.vecinoNombre)) {
        seen.add(e.vecinoId ?? e.vecinoNombre);
        opts.push({
          value: e.vecinoId ?? e.vecinoNombre,
          label: e.vecinoNombre,
          subLabel: e.vecinoDni ?? undefined,
        });
      }
    });
    return opts;
  }, [emergencias]);

  // Aplicar filtro, búsqueda y ordenamiento
  const emergenciasFiltradas = useMemo(() => {
    let result = emergencias;

    if (filtroActivo !== 'TODAS') {
      result = result.filter(e => e.estado === filtroActivo);
    }

    if (searchValue.trim() !== '') {
      const term = searchValue.toLowerCase();
      result = result.filter(e =>
        (e.vecinoNombre && e.vecinoNombre.toLowerCase().includes(term)) ||
        (e.vecinoDni && e.vecinoDni.includes(term)) ||
        e.id.toLowerCase().includes(term)
      );
    }

    return result.sort((a, b) => {
      const pA = getPrioridadEstado(a.estado, a.prioridad, a.esCoaccion);
      const pB = getPrioridadEstado(b.estado, b.prioridad, b.esCoaccion);
      if (pA !== pB) return pA - pB;
      return b.timestampMs - a.timestampMs;
    });
  }, [emergencias, filtroActivo, searchValue]);

  // Construir tabs dinámicos con conteo
  const tabs: C3TabItem[] = FILTROS_KEYS.map(key => ({
    key,
    label: FILTRO_LABELS[key],
    count: key === 'TODAS'
      ? emergencias.length
      : emergencias.filter(e => e.estado === key).length,
  }));

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
      case 'DESPACHADA': return { label: 'En Sitio',  nextEstado: EstadoEmergencia.EN_SITIO };
      case 'EN_SITIO':   return { label: 'Resolver',  nextEstado: EstadoEmergencia.RESUELTA };
      default: return null;
    }
  };

  return (
    <div
      className="c3-incidents-table"
      role="region"
      aria-label="Tabla de emergencias"
    >
      <style>{`
        @keyframes fadeInRow {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animated-row { animation: fadeInRow 0.3s ease-out forwards; }
      `}</style>

      {/* Barra de filtros (C3Tabs) + búsqueda (C3Combobox) */}
      <div className="c3-table-toolbar">

        {/* Filtros de estado → C3Tabs en filterMode */}
        <C3Tabs
          tabs={tabs}
          selectedIndex={filtroIndex}
          onChange={setFiltroIndex}
          filterMode
        />

        {/* Búsqueda → C3Combobox */}
        <div className="c3-table-search">
          <C3Combobox
            value={searchValue}
            onChange={setSearchValue}
            options={searchOptions}
            placeholder="Buscar vecino, DNI o ID..."
            filterFn={(query, opt) =>
              opt.label.toLowerCase().includes(query.toLowerCase()) ||
              (opt.subLabel?.toLowerCase().includes(query.toLowerCase()) ?? false)
            }
            displayValue={val => {
              const opt = searchOptions.find(o => o.value === val);
              return opt?.label ?? val;
            }}
          />
        </div>
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
              ? `${unidadInfo.nombre}` 
              : (e.patrullaAsignadaId || '—');
            const vecinoDisplay = e.vecinoNombre
              ? `${e.vecinoNombre}${e.vecinoDni ? ` (${e.vecinoDni})` : ''}`
              : (e.vecinoId?.substring(0, 10) || '—');

            const unidadesCompatibles = patrulleros.filter(
              p => p.estado === EstadoPatrullero.DISPONIBLE && p.tipoServicio === e.tipo
            );
            const tipoServicioLabel = SERVICIO_CONFIG[e.tipo as TipoEmergencia];

            // Opciones del Listbox de asignación de unidad
            const listboxOptions: C3ListboxOption[] = unidadesCompatibles.map(p => ({
              value: p.uid,
              label: p.nombre,
              description: '',
            }));

            return (
              <tr
                key={e.id}
                className={`animated-row ${(e.estado === EstadoEmergencia.COACCION || e.prioridad === 'P1') ? 'row--coaccion' : ''}`}
                style={{ animationDelay: `${index * 0.03}s`, outline: e.requiereEscalamiento ? '2px solid #C62828' : undefined }}
              >
                <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem', color: '#666' }}>
                  {e.id.substring(0, 8)}...
                </td>

                <td>
                  <TipoBadge tipo={e.tipo} />
                  {e.prioridad && (
                    <span style={{
                      display: 'block', fontSize: '0.65rem', marginTop: '4px', fontWeight: 800,
                      color: e.prioridad === 'P1' ? '#8B0000' : '#E65100'
                    }}>
                      {e.prioridad} {e.requiereEscalamiento ? '• ESCALAR AHORA' : ''}
                    </span>
                  )}
                  {e.estado === EstadoEmergencia.COACCION && (
                    <span style={{
                      display: 'block', fontSize: '0.65rem',
                      color: '#8B0000', fontWeight: 'bold', marginTop: '4px'
                    }}>
                      <ShieldAlert size={13} aria-hidden="true" /> COACCIÓN
                    </span>
                  )}
                </td>

                <td>
                  <C3StatusBadge label={e.estado} color={getEstadoColor(e.estado)} />
                </td>

                <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>{vecinoDisplay}</td>

                {/* Asignación de unidad → C3Listbox */}
                <td style={{ fontSize: '0.8rem', color: '#555' }}>
                  {['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION'].includes(e.estado) && !e.patrullaAsignadaId ? (
                    <div style={{ minWidth: '160px' }}>
                      <C3Listbox
                        value=""
                        onChange={(uid) => {
                          if (uid) asignarManualmente(e.id, uid);
                        }}
                        options={listboxOptions}
                        placeholder={
                          unidadesCompatibles.length === 0
                            ? `Sin unidades de ${tipoServicioLabel?.label ?? e.tipo}`
                            : 'Asignar unidad...'
                        }
                        disabled={unidadesCompatibles.length === 0}
                      />
                    </div>
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
                       className="c3-audio-link"
                       aria-label="Escuchar audio del incidente">
                       <Volume2 size={15} aria-hidden="true" /> Escuchar
                    </a>
                  ) : <span aria-label="Sin audio disponible" style={{ color: '#ccc' }}>—</span>}
                </td>

                <td>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {nextAction ? (
                      <button
                        onClick={() => {
                          if (nextAction.nextEstado === EstadoEmergencia.EN_SITIO) {
                            void marcarEnSitio(e.id);
                          } else {
                            abrirOperacion(e.id, 'RESOLVER');
                          }
                        }}
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
                      <CheckCircle2 color="var(--c3-success)" size={18} aria-label="Resuelta" />
                    ) : e.estado === 'CANCELADA' ? (
                      <CircleSlash2 color="var(--c3-text-muted)" size={18} aria-label="Cancelada" />
                    ) : null}

                    {['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION', 'DESPACHADA', 'EN_SITIO', 'ESCALADA'].includes(e.estado) && (
                      <button
                        onClick={() => abrirOperacion(e.id, 'CANCELAR')}
                        style={{
                          padding: '4px 10px', background: '#f5f5f5', color: '#555',
                          border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer',
                          fontSize: '0.7rem', fontWeight: 500
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                    {['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'COACCION'].includes(e.estado) && !e.patrullaAsignadaId && (
                      <button
                        onClick={() => abrirOperacion(e.id, 'ESCALAR')}
                        style={{
                          padding: '4px 10px', background: '#F3E5F5', color: '#6A1B9A',
                          border: '1px solid #CE93D8', borderRadius: '6px', cursor: 'pointer',
                          fontSize: '0.7rem', fontWeight: 600
                        }}
                      >
                        Escalar
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
                <Inbox size={34} aria-hidden="true" style={{ marginBottom: '8px' }} />
                {filtroActivo === 'TODAS' && searchValue === ''
                  ? 'Sin emergencias registradas.'
                  : 'No se encontraron emergencias con los filtros actuales.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <C3Dialog
        open={operacion !== null}
        onClose={cerrarOperacion}
        title={operacion ? OPERACION_CONFIG[operacion.tipo].titulo : undefined}
        maxWidth="560px"
      >
        {operacion && (
          <form onSubmit={ejecutarOperacion}>
            <p id="operacion-emergencia-ayuda" style={{ color: 'var(--c3-text-muted)', marginTop: 0 }}>
              {OPERACION_CONFIG[operacion.tipo].ayuda}
            </p>

            {operacionError && (
              <div
                role="alert"
                style={{ background: '#FFEBEE', color: '#C62828', padding: '10px', borderRadius: '6px', marginBottom: '14px' }}
              >
                {operacionError}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="operacion-emergencia-motivo">
                {OPERACION_CONFIG[operacion.tipo].etiqueta}
              </label>
              <textarea
                id="operacion-emergencia-motivo"
                className="form-input"
                rows={4}
                minLength={5}
                maxLength={500}
                value={motivoOperacion}
                onChange={(event) => setMotivoOperacion(event.target.value)}
                aria-describedby="operacion-emergencia-ayuda"
                required
                autoFocus
                disabled={operacionEnCurso}
                style={{ resize: 'vertical' }}
              />
              <small>{motivoOperacion.trim().length}/500 caracteres</small>
            </div>

            {operacion.tipo === 'CANCELAR' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={esFalsaAlarma}
                  onChange={(event) => setEsFalsaAlarma(event.target.checked)}
                  disabled={operacionEnCurso}
                />
                Declarar como falsa alarma
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <button type="button" className="btn btn--ghost" onClick={cerrarOperacion} disabled={operacionEnCurso}>
                Volver
              </button>
              <button type="submit" className="btn btn--primary" disabled={operacionEnCurso || motivoOperacion.trim().length < 5}>
                {operacionEnCurso ? 'Procesando...' : 'Confirmar operación'}
              </button>
            </div>
          </form>
        )}
      </C3Dialog>
    </div>
  );
};
