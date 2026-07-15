import type { TipoServicio } from './enums';

export interface AlertaOperativa {
  id: string;
  emergenciaId: string;
  tipo: TipoServicio;
  estadoEmergencia: string;
  codigo: 'P1_SIN_RESPUESTA' | 'COLA_SIN_UNIDAD' | 'LLEGADA_DEMORADA' | 'ATENCION_PROLONGADA';
  severidad: 'CRITICA' | 'ALTA' | 'MEDIA';
  detectadaEnMs: number;
  activa: boolean;
}
