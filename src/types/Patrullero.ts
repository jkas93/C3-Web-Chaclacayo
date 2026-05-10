import { EstadoPatrullero } from './enums';

// U3: Added email field to match what Cloud Functions actually stores
export interface Patrullero {
  uid: string;
  nombre: string;
  codigo: string;
  email?: string;
  latitud: number;
  longitud: number;
  estado: EstadoPatrullero;
  tokenFCM: string;
  turno: 'DIA' | 'NOCHE';
  ultimaActualizacion: number;
}
