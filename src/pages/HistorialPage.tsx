import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Emergencia } from '../types/Emergencia';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';

export const HistorialPage = () => {
  const { rol } = useAuth();
  const [emergencias, setEmergencias] = useState<Emergencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Default: last 7 days
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  
  const [fechaFin, setFechaFin] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { patrulleros } = usePatrulleros(rol);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setHasSearched(true);
    
    try {
      // Parse dates to timestamp MS
      const startMs = new Date(fechaInicio + 'T00:00:00').getTime();
      const endMs = new Date(fechaFin + 'T23:59:59').getTime();

      let q;
      if (rol === 'ADMIN') {
        q = query(
          collection(db, 'emergencias'),
          where('timestampMs', '>=', startMs),
          where('timestampMs', '<=', endMs),
          orderBy('timestampMs', 'desc'),
          limit(200)
        );
      } else {
        q = query(
          collection(db, 'emergencias'),
          where('tipo', '==', rol),
          where('timestampMs', '>=', startMs),
          where('timestampMs', '<=', endMs),
          orderBy('timestampMs', 'desc'),
          limit(200)
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as Emergencia));
      setEmergencias(data);
    } catch (error) {
      console.error('Error fetching historial:', error);
    } finally {
      setLoading(false);
    }
  };

  // Run initial search
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (ms: number) => {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  };

  // ── Analytics Nivel 3 ──
  const calculateAnalytics = () => {
    if (emergencias.length === 0) return null;
    
    let totalDespachoMs = 0;
    let countDespacho = 0;
    
    let canceladas = 0;

    emergencias.forEach(e => {
      if (e.estado === 'CANCELADA') canceladas++;
      
      if (e.horaAsignacionMs && e.timestampMs) {
        totalDespachoMs += (e.horaAsignacionMs - e.timestampMs);
        countDespacho++;
      }
    });

    const avgDespachoSegundos = countDespacho > 0 ? Math.round(totalDespachoMs / countDespacho / 1000) : 0;
    
    return {
      total: emergencias.length,
      canceladas,
      avgDespachoSegundos
    };
  };

  const stats = calculateAnalytics();

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
        <h1 className="page-header__title" id="historial-heading">Historial de Emergencias</h1>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="fechaInicio" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Desde</label>
            <input 
              id="fechaInicio"
              type="date" 
              value={fechaInicio} 
              onChange={e => setFechaInicio(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              required
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="fechaFin" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Hasta</label>
            <input 
              id="fechaFin"
              type="date" 
              value={fechaFin} 
              onChange={e => setFechaFin(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              required
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {stats && (
          <div style={{
            display: 'flex', gap: '1rem', width: '100%', marginTop: '1rem', 
            padding: '1rem', backgroundColor: 'var(--c3-bg-secondary)', borderRadius: '8px'
          }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--c3-text-muted)', margin: 0 }}>Total Emergencias</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--c3-primary)' }}>{stats.total}</h3>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--c3-text-muted)', margin: 0 }}>Tasa de Cancelación</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--c3-warning)' }}>
                {Math.round((stats.canceladas / stats.total) * 100)}%
              </h3>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--c3-text-muted)', margin: 0 }}>SLA Promedio (Despacho)</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--c3-success)' }}>
                {stats.avgDespachoSegundos > 0 ? `${stats.avgDespachoSegundos}s` : '—'}
              </h3>
            </div>
          </div>
        )}
      </header>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }} role="region" aria-labelledby="historial-heading">
        {loading && !hasSearched ? (
          <p>Cargando historial...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">ID</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Vecino</th>
                  <th scope="col">Patrulla Asignada</th>
                  <th scope="col">Audio</th>
                </tr>
              </thead>
              <tbody>
                {emergencias.map((e) => {
                  const patInfo = patrulleros.find(p => p.uid === e.patrullaAsignadaId);
                  const patDisplay = patInfo ? `${patInfo.nombre} (${patInfo.codigo})` : (e.patrullaAsignadaId || '—');
                  const vecinoDisplay = e.vecinoNombre
                    ? `${e.vecinoNombre}${e.vecinoDni ? ` (${e.vecinoDni})` : ''}`
                    : (e.vecinoId?.substring(0, 10) || '—');

                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight: '500' }}>{formatTime(e.timestampMs)}</td>
                      <td style={{ fontFamily: 'var(--c3-font-mono)', fontSize: '0.75rem' }}>
                        {e.id.substring(0, 8)}...
                      </td>
                      <td>{e.tipo}</td>
                      <td>
                        <span className={getEstadoBadgeClass(e.estado)}>
                          {e.estado}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{vecinoDisplay}</td>
                      <td style={{ fontSize: '0.85rem' }}>{patDisplay}</td>
                      <td>
                        {e.audioUrl ? (
                          <a href={e.audioUrl} target="_blank" rel="noreferrer"
                             style={{ color: 'var(--c3-info)', textDecoration: 'none' }}>
                            🎤 Escuchar
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {emergencias.length === 0 && hasSearched && (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--c3-text-muted)' }}>
                      No se encontraron emergencias en el rango de fechas seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {emergencias.length >= 200 && (
              <p style={{ textAlign: 'center', color: 'var(--c3-text-muted)', fontSize: '0.85rem', marginTop: '1rem' }}>
                Mostrando los últimos 200 resultados. Ajuste las fechas para ver más específicos.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
