import { EstadoPatrullero, TipoServicio } from './enums';

export interface Patrullero {
  uid: string;
  nombre: string;
  codigo: string;
  email?: string;
  tipoServicio: TipoServicio;          // POLICIA | SALUD | BOMBEROS
  latitud: number;
  longitud: number;
  estado: EstadoPatrullero;
  tokenFCM: string;
  turno: 'DIA' | 'NOCHE';
  ultimaActualizacion: number;
  
  // 🚧 Geofencing
  cuadranteAsignadoId?: string;
  estaFueraDeZona?: boolean;
  
  // 🚗 Telemetría Fleet Management
  frenadasBruscasTotales?: number;
  velocidadMaximaRegistrada?: number;
}
