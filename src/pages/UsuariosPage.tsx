import { useState } from 'react';
import { useUsuarios } from '../hooks/useUsuarios';
import { useAuth } from '../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

export const UsuariosPage = () => {
  const { usuarios, loading } = useUsuarios();
  const { isAdmin } = useAuth();
  const [resettingDni, setResettingDni] = useState<string | null>(null);
  const [confirmDni, setConfirmDni] = useState<string | null>(null);

  const handleResetDispositivo = async (dni: string) => {
    setResettingDni(dni);
    try {
      const resetFn = httpsCallable(functions, 'resetearDispositivoVecino');
      await resetFn({ vecinoDni: dni });
      setConfirmDni(null);
      alert(`✅ Dispositivo del vecino con DNI ${dni} reseteado correctamente. Podrá iniciar sesión desde un nuevo teléfono.`);
    } catch (error) {
      console.error('Error reseteando dispositivo:', error);
      alert(`❌ Error: ${(error instanceof Error ? error.message : String(error)) || 'No se pudo resetear el dispositivo.'}`);
    } finally {
      setResettingDni(null);
    }
  };

  // Columnas totales según rol
  const colSpanBase = 5;
  const colSpanTotal = isAdmin ? colSpanBase + 2 : colSpanBase; // + deviceId + acción

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-header__title" id="usuarios-heading">Registro de Vecinos</h1>
        <div
          style={{ background: '#e3f2fd', color: '#1976d2', padding: '4px 12px', borderRadius: 'var(--c3-radius-pill)', fontWeight: 'bold' }}
          role="status"
          aria-label={`Total de vecinos registrados: ${usuarios.length}`}
        >
          Total: {usuarios.length}
        </div>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }} role="region" aria-labelledby="usuarios-heading">
        {loading ? (
          <p role="status" aria-live="polite">Cargando vecinos...</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table" aria-describedby="usuarios-caption">
              <caption id="usuarios-caption" className="sr-only">
                Listado de vecinos registrados en el sistema Vecino Chaclacayo Seguro
              </caption>
              <thead>
                <tr>
                  <th scope="col">DNI</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Dirección</th>
                  <th scope="col">Fecha Registro</th>
                  {isAdmin && <th scope="col">Dispositivo</th>}
                  {isAdmin && <th scope="col">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.uid}>
                    <td style={{ fontWeight: 'bold' }}>{u.dni}</td>
                    <td>{u.nombre}</td>
                    <td>{u.telefono}</td>
                    <td style={{ color: 'var(--c3-text-secondary)' }}>{u.direccion}</td>
                    <td style={{ color: 'var(--c3-text-secondary)', fontSize: '0.9em' }}>
                      {new Date(u.creadoEnMs).toLocaleString('es-PE')}
                    </td>

                    {/* Columna de dispositivo — solo ADMIN */}
                    {isAdmin && (
                      <td>
                        {u.deviceId ? (
                          <span style={{
                            fontSize: '0.75rem',
                            background: '#E8F5E9', color: '#2E7D32',
                            padding: '2px 6px', borderRadius: '4px',
                            fontFamily: 'monospace'
                          }}>
                            ✅ {u.deviceId.slice(0, 8)}…
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.75rem',
                            background: '#FFF3E0', color: '#E65100',
                            padding: '2px 6px', borderRadius: '4px'
                          }}>
                            ⚠ Sin vincular
                          </span>
                        )}
                      </td>
                    )}

                    {/* Columna de acción — solo ADMIN */}
                    {isAdmin && (
                      <td>
                        {u.deviceId ? (
                          confirmDni === u.dni ? (
                            <span style={{ display: 'flex', gap: '4px' }}>
                              <button
                                className="btn btn--danger"
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                disabled={resettingDni === u.dni}
                                onClick={() => handleResetDispositivo(u.dni)}
                              >
                                {resettingDni === u.dni ? '...' : '✓ Confirmar'}
                              </button>
                              <button
                                className="btn btn--ghost"
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                onClick={() => setConfirmDni(null)}
                              >
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button
                              id={`reset-device-${u.dni}`}
                              className="btn btn--ghost"
                              style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#E65100', borderColor: '#E65100' }}
                              onClick={() => setConfirmDni(u.dni)}
                              title="Liberar dispositivo vinculado para permitir inicio de sesión en otro teléfono"
                            >
                              📱 Resetear Dispositivo
                            </button>
                          )
                        ) : (
                          <span style={{ color: 'var(--c3-text-muted)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={colSpanTotal} style={{ padding: '24px', textAlign: 'center', color: 'var(--c3-text-muted)' }}>
                      No hay vecinos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
