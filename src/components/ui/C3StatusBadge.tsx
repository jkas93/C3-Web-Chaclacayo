import type { CSSProperties, ReactNode } from 'react';

interface C3StatusBadgeProps {
  label: string;
  color?: string;
  icon?: ReactNode;
  className?: string;
}

export const C3StatusBadge = ({
  label,
  color = 'var(--c3-info)',
  icon,
  className = '',
}: C3StatusBadgeProps) => (
  <span
    className={`c3-status-badge ${className}`.trim()}
    style={{ '--status-color': color } as CSSProperties}
  >
    {icon && <span className="c3-status-badge__icon" aria-hidden="true">{icon}</span>}
    {label}
  </span>
);
