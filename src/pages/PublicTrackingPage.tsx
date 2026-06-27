import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { CustomAdvancedMarker } from '../components/CustomAdvancedMarker';
import { getUnidadIcon } from '../utils/MapMarkerUtils';
import { EstadoPatrullero, RolOperador } from '../types/enums';

const libraries: ("places" | "marker" | "drawing" | "geometry")[] = ["places", "marker", "drawing", "geometry"];
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

const mapContainerStyle = {
  height: "100vh",
  width: "100%"
};

const options: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  mapId: "DEMO_MAP_ID"
};

const CENTER_POSITION = { lat: -11.9765, lng: -76.7725 };

export const PublicTrackingPage = () => {
  const { token } = useParams<{ token: string }>();
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries
  });

  const { patrulleros } = usePatrulleros('PUBLIC' as RolOperador);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsValidToken(false);
        setLoadingToken(false);
        return;
      }
      try {
        const docRef = doc(db, 'enlaces_publicos', token);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().activo !== false) {
          setIsValidToken(true);
        } else {
          setIsValidToken(false);
        }
      } catch (error) {
        console.error("Error verificando token:", error);
        setIsValidToken(false);
      } finally {
        setLoadingToken(false);
      }
    };
    verifyToken();
  }, [token]);

  const patrullerosFiltrados = useMemo(() =>
    patrulleros.filter(p => p.latitud != null && p.longitud != null), [patrulleros]);

  if (loadingToken) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}><h2>Verificando enlace...</h2></div>;
  }

  if (!isValidToken) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: '3rem', margin: '0' }}>⚠️</h1>
        <h2>Enlace no válido o expirado</h2>
        <p style={{ color: '#94a3b8' }}>El enlace público de seguimiento al que intentas acceder ya no se encuentra disponible.</p>
      </div>
    );
  }

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: 'white' }}>Cargando mapa público...</div>;

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      
      {/* Header flotante elegante */}
      <div style={{
        position: 'absolute',
        top: '24px',
        left: '24px',
        zIndex: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        padding: '16px 24px',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        color: 'white',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ width: '48px', height: '48px', backgroundColor: '#00BFFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
          🛡️
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Rastreo Público de Seguridad</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Municipalidad de Chaclacayo - En Vivo</p>
        </div>
      </div>

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        options={options}
        center={CENTER_POSITION}
        zoom={15}
      >
        {/* Marcadores de Unidades */}
        {patrullerosFiltrados.map((p) => {
          const isActive = p.estado !== EstadoPatrullero.FUERA_DE_SERVICIO;
          // Para el público general, no resaltamos ninguna unidad como asignada a emergencia específica
          const isAssigned = false; 
          const iconData = getUnidadIcon(p.tipoServicio, isActive, isAssigned);
          
          return (
            <CustomAdvancedMarker
              key={p.uid}
              position={{ lat: p.latitud, lng: p.longitud }}
              iconData={iconData}
              zIndex={50}
            />
          );
        })}
      </GoogleMap>
      
      {/* Footer / Leyenda */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        padding: '8px 24px',
        borderRadius: '30px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '24px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🚔</span> Policía/Serenazgo
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🚑</span> Salud
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🚒</span> Bomberos
        </div>
      </div>
    </div>
  );
};
