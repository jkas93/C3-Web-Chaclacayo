export const EstadoEmergencia = {
  PENDIENTE: 'PENDIENTE',
  DESPACHADA: 'DESPACHADA',
  EN_SITIO: 'EN_SITIO',
  RESUELTA: 'RESUELTA',
  COACCION: 'COACCION',
  CANCELADA: 'CANCELADA'
} as const;
export type EstadoEmergencia = typeof EstadoEmergencia[keyof typeof EstadoEmergencia];

export const TipoEmergencia = {
  SOS: 'SOS',
  SOSPECHA: 'SOSPECHA',
  MEDICA: 'MEDICA'
} as const;
export type TipoEmergencia = typeof TipoEmergencia[keyof typeof TipoEmergencia];

export const EstadoPatrullero = {
  DISPONIBLE: 'DISPONIBLE',
  EN_SERVICIO: 'EN_SERVICIO',
  FUERA_DE_SERVICIO: 'FUERA_DE_SERVICIO'
} as const;
export type EstadoPatrullero = typeof EstadoPatrullero[keyof typeof EstadoPatrullero];
