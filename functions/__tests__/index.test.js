const test = require('firebase-functions-test')();
const myFunctions = require('../index.js');

describe('Cloud Functions Utilities', () => {
  it('calculateDistance should compute correct distance', () => {
    // Lima coordinates roughly
    const lat1 = -12.0464;
    const lon1 = -77.0428;
    const lat2 = -11.9765; // Chaclacayo roughly
    const lon2 = -76.7725;
    
    const distance = myFunctions.calculateDistance(lat1, lon1, lat2, lon2);
    expect(distance).toBeGreaterThan(0);
    expect(typeof distance).toBe('number');
  });

  it('getLabelServicio should return correct labels', () => {
    expect(myFunctions.getLabelServicio('POLICIA').emoji).toBe('🚔');
    expect(myFunctions.getLabelServicio('BOMBEROS').emoji).toBe('🚒');
    expect(myFunctions.getLabelServicio('SALUD').emoji).toBe('🚑');
    expect(myFunctions.getLabelServicio('UNKNOWN').emoji).toBe('🚨');
  });
  it('uses salted PBKDF2 PIN hashes while accepting legacy hashes during migration', () => {
    const first = myFunctions.hashPin('1234', '77777777');
    const second = myFunctions.hashPin('1234', '77777777');
    expect(first).toMatch(/^pbkdf2_sha256\$120000\$/);
    expect(first).not.toBe(second);
    expect(myFunctions.verificarPinHash(first, '1234', '77777777')).toBe(true);
    expect(myFunctions.verificarPinHash(first, '4321', '77777777')).toBe(false);
    expect(myFunctions.verificarPinHash(
      'cd1ac2fcb4c1785eae78207bb92155a2abac621564f360add2893c0c91d66d6d',
      '1234', '77777777',
    )).toBe(true);
  });
  it('calculates monotonic route progress and never exposes 100 before arrival', () => {
    expect(myFunctions.calcularProgresoRuta(2000, 1500, 0)).toBe(25);
    expect(myFunctions.calcularProgresoRuta(2000, 1700, 25)).toBe(25);
    expect(myFunctions.calcularProgresoRuta(2000, 0, 25)).toBe(99);
  });
  it('prioritizes coercion as P1 and preserves an explicit P3', () => {
    expect(myFunctions.getPrioridadEmergencia({ estado: 'COACCION' }, true)).toBe('P1');
    expect(myFunctions.getPrioridadEmergencia({ esCoaccion: true })).toBe('P1');
    expect(myFunctions.getPrioridadEmergencia({ prioridad: 'P3' })).toBe('P3');
    expect(myFunctions.getPrioridadEmergencia({ estado: 'PENDIENTE' })).toBe('P2');
  });
  it('queues the loser when two emergencies compete for the same unit', () => {
    expect(myFunctions.getMotivoPendienteTrasCarrera(false)).toBe('UNIDAD_YA_NO_DISPONIBLE');
    expect(myFunctions.getMotivoPendienteTrasCarrera(true)).toBeNull();
  });
  it('classifies device binding without allowing replacement', () => {
    const deviceA = '123e4567-e89b-42d3-a456-426614174000';
    const deviceB = '123e4567-e89b-42d3-b456-426614174001';
    expect(myFunctions.clasificarVinculoDispositivo('', deviceA)).toBe('NUEVO');
    expect(myFunctions.clasificarVinculoDispositivo(deviceA, deviceA)).toBe('EXISTENTE');
    expect(myFunctions.clasificarVinculoDispositivo(deviceA, deviceB)).toBe('CONFLICTO');
    expect(myFunctions.clasificarVinculoDispositivo('', 'device-invalido')).toBe('INVALIDO');
  });
  it('validates the initial neighbor access key without exposing it', () => {
    expect(() => myFunctions.validarNuevaClaveVecino('Uat!123456')).not.toThrow();
    expect(() => myFunctions.validarNuevaClaveVecino('corta')).toThrow();
    expect(() => myFunctions.validarNuevaClaveVecino('clave con espacios')).toThrow();
    expect(() => myFunctions.validarNuevaClaveVecino('x'.repeat(129))).toThrow();
  });
  it('authorizes only the assigned in-service unit to confirm arrival', () => {
    const emergency = {
      estado: 'DESPACHADA', tipo: 'POLICIA', patrullaAsignadaId: 'unidad-1',
    };
    const unit = { estado: 'EN_SERVICIO', tipoServicio: 'POLICIA' };
    expect(myFunctions.clasificarConfirmacionLlegada(emergency, 'unidad-1', unit)).toBe('CONFIRMAR');
    expect(myFunctions.clasificarConfirmacionLlegada(
      { ...emergency, estado: 'EN_SITIO' }, 'unidad-1', unit,
    )).toBe('YA_CONFIRMADA');
    expect(myFunctions.clasificarConfirmacionLlegada(emergency, 'unidad-2', unit)).toBe('UNIDAD_NO_ASIGNADA');
    expect(myFunctions.clasificarConfirmacionLlegada(
      emergency, 'unidad-1', { ...unit, tipoServicio: 'SALUD' },
    )).toBe('SERVICIO_INCOMPATIBLE');
    expect(myFunctions.clasificarConfirmacionLlegada(
      emergency, 'unidad-1', { ...unit, estado: 'DISPONIBLE' },
    )).toBe('UNIDAD_NO_EN_SERVICIO');
  });
  it('represents unavailable emergency location without inventing coordinates', () => {
    expect(myFunctions.normalizarUbicacionEmergencia({
      ubicacionDisponible: false,
    })).toEqual({ valida: true, ubicacionDisponible: false });
    expect(myFunctions.normalizarUbicacionEmergencia({
      ubicacionDisponible: true, latitud: -11.9765, longitud: -76.7725,
    })).toEqual({
      valida: true, ubicacionDisponible: true, latitud: -11.9765, longitud: -76.7725,
    });
    expect(myFunctions.normalizarUbicacionEmergencia({
      ubicacionDisponible: true, latitud: 0, longitud: 0,
    }).valida).toBe(false);
    expect(myFunctions.normalizarUbicacionEmergencia({}).valida).toBe(false);
  });
  it('purges only terminal emergencies closed more than 180 days ago', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 2_000_000_000_000;
    expect(myFunctions.esEmergenciaElegibleParaPurga({
      estado: 'RESUELTA', horaCierreMs: now - 181 * day,
    }, now)).toBe(true);
    expect(myFunctions.esEmergenciaElegibleParaPurga({
      estado: 'CANCELADA', horaCierreMs: now - 181 * day,
    }, now)).toBe(true);
    expect(myFunctions.esEmergenciaElegibleParaPurga({
      estado: 'ESCALADA', horaCierreMs: now - 365 * day,
    }, now)).toBe(false);
    expect(myFunctions.esEmergenciaElegibleParaPurga({
      estado: 'PENDIENTE', horaCierreMs: now - 365 * day,
    }, now)).toBe(false);
    expect(myFunctions.esEmergenciaElegibleParaPurga({
      estado: 'RESUELTA', horaCierreMs: now - 179 * day,
    }, now)).toBe(false);
    expect(myFunctions.esEmergenciaElegibleParaPurga({
      estado: 'RESUELTA', timestampMs: now - 365 * day,
    }, now)).toBe(false);
  });
  it('expires tracking only after 24 hours with a valid timestamp', () => {
    const hour = 60 * 60 * 1000;
    const now = 2_000_000_000_000;
    expect(myFunctions.esTrackingExpirado(now - 25 * hour, now)).toBe(true);
    expect(myFunctions.esTrackingExpirado(now - 23 * hour, now)).toBe(false);
    expect(myFunctions.esTrackingExpirado(0, now)).toBe(false);
    expect(myFunctions.esTrackingExpirado('fecha-invalida', now)).toBe(false);
  });
  it('classifies operational SLA alerts at their configured thresholds', () => {
    const minute = 60 * 1000;
    const now = 2_000_000_000_000;
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'POLICIA', estado: 'COACCION', timestampMs: now - 2 * minute,
    }, now)?.codigo).toBe('P1_SIN_RESPUESTA');
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'SALUD', estado: 'PENDIENTE_SIN_UNIDAD', prioridad: 'P2',
      timestampMs: now - 10 * minute,
    }, now)?.codigo).toBe('COLA_SIN_UNIDAD');
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'BOMBEROS', estado: 'DESPACHADA', horaAsignacionMs: now - 20 * minute,
    }, now)?.codigo).toBe('LLEGADA_DEMORADA');
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'POLICIA', estado: 'EN_SITIO', horaLlegadaMs: now - 120 * minute,
    }, now)?.codigo).toBe('ATENCION_PROLONGADA');
  });
  it('does not alert before the SLA or after a terminal transition', () => {
    const minute = 60 * 1000;
    const now = 2_000_000_000_000;
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'POLICIA', estado: 'COACCION', timestampMs: now - minute,
    }, now)).toBeNull();
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'SALUD', estado: 'RESUELTA', timestampMs: now - 300 * minute,
    }, now)).toBeNull();
    expect(myFunctions.clasificarAlertaSla({
      tipo: 'INVALIDO', estado: 'PENDIENTE', timestampMs: now - 300 * minute,
    }, now)).toBeNull();
  });
  it('publishes only active units with recent and valid tracking', () => {
    const minute = 60 * 1000;
    const now = 2_000_000_000_000;
    const valid = {
      tipoServicio: 'POLICIA', estado: 'DISPONIBLE',
      latitud: -11.9765, longitud: -76.7725, ultimaActualizacion: now - 29 * minute,
    };
    expect(myFunctions.esUnidadVisiblePublicamente(valid, now)).toBe(true);
    expect(myFunctions.esUnidadVisiblePublicamente({
      ...valid, ultimaActualizacion: now - 31 * minute,
    }, now)).toBe(false);
    expect(myFunctions.esUnidadVisiblePublicamente({ ...valid, estado: 'FUERA_DE_SERVICIO' }, now)).toBe(false);
    expect(myFunctions.esUnidadVisiblePublicamente({ ...valid, latitud: 0, longitud: 0 }, now)).toBe(false);
    expect(myFunctions.esUnidadVisiblePublicamente({ ...valid, tipoServicio: 'PRIVADO' }, now)).toBe(false);
  });
});
