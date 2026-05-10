import { TablaEmergencias } from '../components/TablaEmergencias';

export const TablePage = () => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-header__title" id="incidentes-heading">Registro de Incidentes</h1>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }} role="region" aria-labelledby="incidentes-heading">
        <TablaEmergencias />
      </div>
    </div>
  );
};
