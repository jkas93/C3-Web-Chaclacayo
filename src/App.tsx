import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { MapPage } from './pages/MapPage';
import { TablePage } from './pages/TablePage';
import { PatrullerosPage } from './pages/PatrullerosPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { HistorialPage } from './pages/HistorialPage';
import 'leaflet/dist/leaflet.css';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <ProtectedRoute>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<MapPage />} />
            <Route path="emergencias" element={<TablePage />} />
            <Route path="patrulleros" element={<PatrullerosPage />} />
            <Route path="usuarios" element={<UsuariosPage />} />
            <Route path="historial" element={<HistorialPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ProtectedRoute>
    </BrowserRouter>
  );
}

export default App;
