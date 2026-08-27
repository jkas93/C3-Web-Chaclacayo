import type { CSSProperties, ReactNode } from 'react';

interface C3MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: string;
}

export const C3MetricCard = ({
  label,
  value,
  icon,
  color = 'var(--c3-info)',
}: C3MetricCardProps) => (
  <div
    className="c3-metric-card"
    style={{ '--metric-color': color } as CSSProperties}
    aria-label={`${label}: ${value}`}
  >
    <span className="c3-metric-card__icon" aria-hidden="true">{icon}</span>
    <span className="c3-metric-card__label">{label}</span>
    <span className="c3-metric-card__value">{value}</span>
  </div>
);
