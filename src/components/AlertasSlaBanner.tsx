import { Link } from 'react-router-dom';
import { AlertOctagon, Clock3 } from 'lucide-react';
import type { AlertaOperativa } from '../types/AlertaOperativa';

const ETIQUETAS: Record<AlertaOperativa['codigo'], string> = {
  P1_SIN_RESPUESTA: 'P1 sin respuesta',
  COLA_SIN_UNIDAD: 'Sin unidad',
  LLEGADA_DEMORADA: 'Llegada demorada',
  ATENCION_PROLONGADA: 'Atención prolongada',
};

export const AlertasSlaBanner = ({
  alertas,
  error,
}: {
  alertas: AlertaOperativa[];
  error: string | null;
}) => {
  if (error) {
    return (
      <div role="status" style={{ padding: '8px 16px', background: '#FFF3E0', color: '#8A4B08' }}>
        {error}
      </div>
    );
  }
  if (alertas.length === 0) return null;

  const criticas = alertas.filter((alerta) => alerta.severidad === 'CRITICA').length;
  const fondo = criticas > 0 ? '#FFEBEE' : '#FFF3E0';
  const color = criticas > 0 ? '#B71C1C' : '#8A4B08';

  return (
    <section
      role="alert"
      aria-live="assertive"
      aria-label="Alertas operativas de SLA"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
        padding: '10px 16px', background: fondo, color,
        borderBottom: `1px solid ${criticas > 0 ? '#FFCDD2' : '#FFE0B2'}`,
      }}
    >
      <AlertOctagon size={20} aria-hidden="true" />
      <strong>{alertas.length} alerta{alertas.length === 1 ? '' : 's'} SLA activa{alertas.length === 1 ? '' : 's'}</strong>
      {alertas.slice(0, 3).map((alerta) => (
        <span key={alerta.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 8px', borderRadius: '999px',
          background: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', fontWeight: 600,
        }}>
          <Clock3 size={13} aria-hidden="true" />
          {alerta.tipo}: {ETIQUETAS[alerta.codigo]}
        </span>
      ))}
      {alertas.length > 3 && <span style={{ fontSize: '0.8rem' }}>+{alertas.length - 3} más</span>}
      <Link to="/emergencias" style={{ marginLeft: 'auto', color: 'inherit', fontWeight: 700 }}>
        Revisar incidentes
      </Link>
    </section>
  );
};
