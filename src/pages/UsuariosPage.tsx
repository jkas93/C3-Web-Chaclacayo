import { useState } from 'react';
import { useUsuarios } from '../hooks/useUsuarios';
import { useAuth } from '../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { functions, db } from '../services/firebase';

async function hashPin(pin: string, dni: string): Promise<string> {
  const combined = `${dni}:${pin}`;
  const msgBuffer = new TextEncoder().encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const UsuariosPage = () => {
  const { usuarios, loading } = useUsuarios();
  const { isAdmin } = useAuth();
  const [resettingDni, setResettingDni] = useState<string | null>(null);
  const [confirmDni, setConfirmDni] = useState<string | null>(null);

  // Registro state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [regForm, setRegForm] = useState({ nombre: '', dni: '', telefono: '', direccion: '', pinNormal: '', pinCoaccion: '' });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    const { nombre, dni, telefono, direccion, pinNormal, pinCoaccion } = regForm;

    if (!nombre.trim() || !dni.trim() || !telefono.trim() || !direccion.trim() || !pinNormal.trim() || !pinCoaccion.trim()) {
      return setRegError('Complete todos los campos');
    }
    if (dni.trim().length < 8) return setRegError('DNI inválido');
    if (telefono.trim().length !== 9 || !telefono.trim().startsWith('9')) return setRegError('Teléfono inválido (debe tener 9 dígitos y empezar con 9)');
    if (pinNormal.length !== 4 || pinCoaccion.length !== 4) return setRegError('Los PINs deben ser exactamente de 4 dígitos');
    if (pinNormal === pinCoaccion) return setRegError('El PIN de coacción debe ser distinto al normal');

    setRegLoading(true);
    try {
      const cleanDni = dni.trim();
      const userRef = doc(db, 'usuarios', cleanDni);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        throw new Error('Este DNI ya se encuentra registrado');
      }

      const hashedNormal = await hashPin(pinNormal.trim(), cleanDni);
      const hashedCoaccion = await hashPin(pinCoaccion.trim(), cleanDni);
      
      const newUserId = crypto.randomUUID();

      await setDoc(userRef, {
        uid: newUserId,
        nombre: nombre.trim(),
        dni: cleanDni,
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        pinNormal: hashedNormal,
        pinCoaccion: hashedCoaccion,
        deviceId: "", // Vacío para permitir Device-Binding en el primer inicio de sesión
        creadoEnMs: Date.now()
      });

      alert('✅ Vecino registrado correctamente.');
      setIsRegisterOpen(false);
      setRegForm({ nombre: '', dni: '', telefono: '', direccion: '', pinNormal: '', pinCoaccion: '' });
    } catch (err: any) {
      setRegError(err.message || 'Error al registrar al vecino');
    } finally {
      setRegLoading(false);
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <h1 className="page-header__title" id="usuarios-heading">Registro de Vecinos</h1>
          <div
            style={{ background: '#e3f2fd', color: '#1976d2', padding: '4px 12px', borderRadius: 'var(--c3-radius-pill)', fontWeight: 'bold' }}
            role="status"
            aria-label={`Total de vecinos registrados: ${usuarios.length}`}
          >
            Total: {usuarios.length}
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn--primary" onClick={() => setIsRegisterOpen(true)}>
            + Registrar Vecino
          </button>
        )}
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

      {isRegisterOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px' }}>
            <h2>Registrar Nuevo Vecino</h2>
            {regError && (
              <div style={{ background: '#FFEBEE', color: '#C62828', padding: '10px', borderRadius: '4px', marginBottom: '16px', fontSize: '0.9rem' }}>
                {regError}
              </div>
            )}
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input className="form-input" type="text" value={regForm.nombre} onChange={e => setRegForm({...regForm, nombre: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">DNI</label>
                <input className="form-input" type="text" maxLength={8} value={regForm.dni} onChange={e => setRegForm({...regForm, dni: e.target.value.replace(/\D/g, '')})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono (Celular)</label>
                <input className="form-input" type="text" maxLength={9} value={regForm.telefono} onChange={e => setRegForm({...regForm, telefono: e.target.value.replace(/\D/g, '')})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Dirección / Referencia</label>
                <input className="form-input" type="text" value={regForm.direccion} onChange={e => setRegForm({...regForm, direccion: e.target.value})} required />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PIN Normal</label>
                  <input className="form-input" type="password" maxLength={4} value={regForm.pinNormal} onChange={e => setRegForm({...regForm, pinNormal: e.target.value.replace(/\D/g, '')})} placeholder="4 dígitos" required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PIN Coacción</label>
                  <input className="form-input" type="password" maxLength={4} value={regForm.pinCoaccion} onChange={e => setRegForm({...regForm, pinCoaccion: e.target.value.replace(/\D/g, '')})} placeholder="4 dígitos" required />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button type="submit" className="btn btn--primary" style={{ flex: 1 }} disabled={regLoading}>
                  {regLoading ? 'Registrando...' : 'Guardar Vecino'}
                </button>
                <button type="button" className="btn btn--ghost" style={{ flex: 1 }} onClick={() => setIsRegisterOpen(false)} disabled={regLoading}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
