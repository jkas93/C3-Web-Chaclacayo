const {
    planUsuario, planPatrullero, planOperador, planEmergencia
} = require('../migration/transformations');
const { mergedClaims } = require('../migration/runtime');

describe('C3 migration V2 transformations', () => {
    test('marks a legacy neighbor for in-person access provisioning', () => {
        const result = planUsuario('12345678', {
            nombre: 'Vecino', telefono: '987654321', activo: true
        });
        expect(result.patch).toMatchObject({
            dni: '12345678', versionEsquema: 2, requiereProvisionAcceso: true
        });
        expect(result.issues).toContain('UID_FALTANTE');
        expect(result.desiredClaims).toBeNull();
    });

    test('recognizes an already provisioned municipal neighbor account', () => {
        const result = planUsuario('12345678', {
            uid: 'uid-1', nombre: 'Vecino', telefono: '987654321'
        }, { email: 'vecino.12345678@c3-chaclacayo.local', disabled: false });
        expect(result.patch.requiereProvisionAcceso).toBe(false);
        expect(result.desiredClaims).toEqual({ role: 'VECINO' });
    });

    test('does not grant neighbor claims to an incompatible legacy Auth identity', () => {
        const result = planUsuario('12345678', {
            uid: 'legacy-uid', nombre: 'Vecino', telefono: '987654321'
        }, { email: 'unknown@example.com', disabled: false });
        expect(result.desiredClaims).toBeNull();
        expect(result.patch.requiereProvisionAcceso).toBe(true);
        expect(result.issues).toContain('ACCESO_AUTH_NO_COMPATIBLE');
    });

    test('normalizes legacy unit service and state safely', () => {
        const result = planPatrullero('unit-1', { tipoServicio: 'AMBULANCIA', estado: 'INVALIDO' });
        expect(result.patch).toEqual({ uid: 'unit-1', tipoServicio: 'SALUD', estado: 'FUERA_DE_SERVICIO' });
        expect(result.desiredClaims).toEqual({ role: 'PATRULLERO', tipoServicio: 'SALUD' });
    });

    test('does not grant claims to an operator with an invalid role', () => {
        const result = planOperador('operator-1', { rol: 'SUPERADMIN' });
        expect(result.desiredClaims).toBeNull();
        expect(result.issues).toContain('ROL_OPERADOR_INVALIDO');
    });

    test('normalizes emergency and removes legacy none assignments', () => {
        const result = planEmergencia('em-1', {
            tipo: 'MEDICAL', estado: 'PENDING', timestampMs: 123,
            patrullaAsignadaId: 'none'
        });
        expect(result.patch).toMatchObject({
            id: 'em-1', tipo: 'SALUD', estado: 'PENDIENTE',
            prioridad: 'P2', recibidoEnMs: 123, versionEsquema: 2
        });
        expect(result.deletes).toEqual(['patrullaAsignadaId']);
    });

    test('removes a stale service claim when role is no longer patrol', () => {
        expect(mergedClaims({ role: 'PATRULLERO', tipoServicio: 'POLICIA', flag: true },
            { role: 'ADMIN' })).toEqual({ role: 'ADMIN', flag: true });
    });
});
