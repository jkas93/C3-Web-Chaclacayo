const VALID_SERVICES = ['POLICIA', 'SALUD', 'BOMBEROS'];
const VALID_ROLES = ['ADMIN', ...VALID_SERVICES];
const VALID_UNIT_STATES = ['DISPONIBLE', 'EN_SERVICIO', 'FUERA_DE_SERVICIO'];
const VALID_PRIORITIES = ['P1', 'P2', 'P3'];
const VALID_EMERGENCY_STATES = [
    'PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'DESPACHADA', 'EN_SITIO',
    'RESUELTA', 'COACCION', 'CANCELADA', 'ESCALADA'
];

const SERVICE_MAP = {
    SOS: 'POLICIA', SOSPECHA: 'POLICIA', POLICE: 'POLICIA',
    MEDICA: 'SALUD', MEDICAL: 'SALUD', AMBULANCIA: 'SALUD',
    FIRE: 'BOMBEROS', BOMBERO: 'BOMBEROS',
    POLICIA: 'POLICIA', SALUD: 'SALUD', BOMBEROS: 'BOMBEROS'
};

const STATE_MAP = {
    PENDING: 'PENDIENTE', PENDING_NO_UNIT: 'PENDIENTE_SIN_UNIDAD',
    DISPATCHED: 'DESPACHADA', ON_SITE: 'EN_SITIO', RESOLVED: 'RESUELTA',
    COERCION: 'COACCION', CANCELLED: 'CANCELADA', CANCELED: 'CANCELADA',
    ESCALATED: 'ESCALADA'
};

function changedPatch(data, desired) {
    return Object.fromEntries(Object.entries(desired).filter(([key, value]) => data[key] !== value));
}

function planUsuario(id, data, authUser = null) {
    const issues = [];
    if (!/^\d{8}$/.test(id)) issues.push('DNI_DOCUMENT_ID_INVALIDO');
    if (!data.uid) issues.push('UID_FALTANTE');
    if (!data.nombre) issues.push('NOMBRE_FALTANTE');
    if (!/^9\d{8}$/.test(String(data.telefono || ''))) issues.push('TELEFONO_INVALIDO');

    const expectedEmail = `vecino.${id}@c3-chaclacayo.local`;
    const accesoV2 = Boolean(authUser && authUser.email === expectedEmail && authUser.disabled !== true);
    if (data.uid && !accesoV2) issues.push('ACCESO_AUTH_NO_COMPATIBLE');
    const desired = {
        dni: id,
        activo: data.activo !== false,
        versionEsquema: 2,
        requiereProvisionAcceso: !accesoV2
    };
    if (accesoV2 && data.debeCambiarClave === undefined) desired.debeCambiarClave = true;
    return { patch: changedPatch(data, desired), issues, desiredClaims: accesoV2 ? { role: 'VECINO' } : null };
}

function planPatrullero(id, data) {
    const issues = [];
    const tipoServicio = SERVICE_MAP[String(data.tipoServicio || '').toUpperCase()] || 'POLICIA';
    if (!VALID_SERVICES.includes(String(data.tipoServicio || '').toUpperCase())) {
        issues.push('TIPO_SERVICIO_NORMALIZADO_A_POLICIA');
    }
    const estado = VALID_UNIT_STATES.includes(data.estado) ? data.estado : 'FUERA_DE_SERVICIO';
    if (estado !== data.estado) issues.push('ESTADO_UNIDAD_INVALIDO');
    return {
        patch: changedPatch(data, { uid: id, tipoServicio, estado }),
        issues,
        desiredClaims: { role: 'PATRULLERO', tipoServicio }
    };
}

function planOperador(id, data) {
    const issues = [];
    const rol = String(data.rol || '').toUpperCase();
    if (!VALID_ROLES.includes(rol)) issues.push('ROL_OPERADOR_INVALIDO');
    return {
        patch: VALID_ROLES.includes(rol)
            ? changedPatch(data, { uid: id, rol, activo: data.activo !== false })
            : {},
        issues,
        desiredClaims: VALID_ROLES.includes(rol) ? { role: rol } : null
    };
}

function planEmergencia(id, data) {
    const issues = [];
    const tipo = SERVICE_MAP[String(data.tipo || '').toUpperCase()];
    if (!tipo) issues.push('TIPO_EMERGENCIA_DESCONOCIDO');
    const rawState = String(data.estado || '').toUpperCase();
    const estado = VALID_EMERGENCY_STATES.includes(rawState) ? rawState : STATE_MAP[rawState];
    if (!estado) issues.push('ESTADO_EMERGENCIA_DESCONOCIDO');
    const esCoaccion = estado === 'COACCION' || data.esCoaccion === true;
    const prioridad = VALID_PRIORITIES.includes(data.prioridad)
        ? data.prioridad
        : (esCoaccion ? 'P1' : 'P2');
    const desired = { id, versionEsquema: 2, esCoaccion, prioridad };
    if (tipo) desired.tipo = tipo;
    if (estado) desired.estado = estado;
    if (!data.recibidoEnMs && Number.isFinite(data.timestampMs)) desired.recibidoEnMs = data.timestampMs;
    const deletes = [];
    if (data.patrullaAsignadaId === 'none') deletes.push('patrullaAsignadaId');
    if (data.patrullaApoyoId === 'none') deletes.push('patrullaApoyoId');
    return { patch: changedPatch(data, desired), deletes, issues };
}

module.exports = {
    VALID_SERVICES,
    VALID_ROLES,
    VALID_UNIT_STATES,
    VALID_EMERGENCY_STATES,
    planUsuario,
    planPatrullero,
    planOperador,
    planEmergencia
};
