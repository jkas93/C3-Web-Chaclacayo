import { EstadoEmergencia, TipoEmergencia } from './enums';

// P3: Added vecinoDni/vecinoNombre for human-readable identity in tables and maps
export interface Emergencia {
  id: string;
  vecinoId: string;
  vecinoDni?: string;
  vecinoNombre?: string;
  latitud: number;
  longitud: number;
  latitudActual?: number;
  longitudActual?: number;
  estado: EstadoEmergencia;
  tipo: TipoEmergencia;
  audioUrl: string | null;
  patrullaAsignadaId: string | null;
  patrullaApoyoId?: string | null;
  alertaWebSilenciada?: boolean;
  timestampMs: number;
}
