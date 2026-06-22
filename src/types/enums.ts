// Tipos de emergencia (deben coincidir con el tipo de servicio de la unidad)
export const TipoEmergencia = {
  POLICIA:  'POLICIA',
  SALUD:    'SALUD',
  BOMBEROS: 'BOMBEROS',
} as const;
export type TipoEmergencia = typeof TipoEmergencia[keyof typeof TipoEmergencia];

// Tipo de servicio de una unidad móvil
export const TipoServicio = {
  POLICIA:  'POLICIA',
  SALUD:    'SALUD',
  BOMBEROS: 'BOMBEROS',
} as const;
export type TipoServicio = typeof TipoServicio[keyof typeof TipoServicio];

// Roles de operadores del panel Web-C3
export const RolOperador = {
  ADMIN:    'ADMIN',
  POLICIA:  'POLICIA',
  SALUD:    'SALUD',
  BOMBEROS: 'BOMBEROS',
} as const;
export type RolOperador = typeof RolOperador[keyof typeof RolOperador];

// Estados de una emergencia
export const EstadoEmergencia = {
  PENDIENTE:  'PENDIENTE',
  DESPACHADA: 'DESPACHADA',
  EN_SITIO:   'EN_SITIO',
  RESUELTA:   'RESUELTA',
  COACCION:   'COACCION',
  CANCELADA:  'CANCELADA',
} as const;
export type EstadoEmergencia = typeof EstadoEmergencia[keyof typeof EstadoEmergencia];

// Estados de una unidad móvil
export const EstadoPatrullero = {
  DISPONIBLE:        'DISPONIBLE',
  EN_SERVICIO:       'EN_SERVICIO',
  FUERA_DE_SERVICIO: 'FUERA_DE_SERVICIO',
} as const;
export type EstadoPatrullero = typeof EstadoPatrullero[keyof typeof EstadoPatrullero];

// Utilidad: etiqueta y color por tipo de emergencia/servicio
export const SERVICIO_CONFIG: Record<TipoServicio | TipoEmergencia, {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
}> = {
  POLICIA: {
    label:   'Policía',
    emoji:   '🚔',
    color:   '#1565C0',
    bgColor: '#E3F2FD',
  },
  SALUD: {
    label:   'Salud',
    emoji:   '🚑',
    color:   '#2E7D32',
    bgColor: '#E8F5E9',
  },
  BOMBEROS: {
    label:   'Bomberos',
    emoji:   '🚒',
    color:   '#B71C1C',
    bgColor: '#FFEBEE',
  },
};
