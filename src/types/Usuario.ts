export interface Usuario {
  uid: string;
  nombre: string;
  dni: string;
  telefono: string;
  direccion: string;
  correo?: string;
  fechaNacimiento?: string;
  contactoEmergenciaNombre?: string;
  contactoEmergenciaTelefono?: string;
  tokenFCM: string;
  deviceId?: string;          // UUID del dispositivo registrado (vacío = sin dispositivo vinculado)
  creadoEnMs: number;
}

export interface OperadorC3 {
  uid: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'POLICIA' | 'SALUD' | 'BOMBEROS';
  creadoPor?: string;
  activo: boolean;
}
