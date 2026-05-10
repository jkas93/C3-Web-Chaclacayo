import { useUsuarios } from '../hooks/useUsuarios';

export const UsuariosPage = () => {
  const { usuarios, loading } = useUsuarios();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-header__title" id="usuarios-heading">Registro de Vecinos</h1>
        <div style={{ background: '#e3f2fd', color: '#1976d2', padding: '4px 12px', borderRadius: 'var(--c3-radius-pill)', fontWeight: 'bold' }}
             role="status" aria-label={`Total de vecinos registrados: ${usuarios.length}`}>
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
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--c3-text-muted)' }}>
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
