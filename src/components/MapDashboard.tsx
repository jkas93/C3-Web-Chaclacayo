import { useMemo, memo, useState, useCallback, useRef, useEffect } from 'react';
import { useJsApiLoader, GoogleMap, DirectionsService, DirectionsRenderer, useGoogleMap } from '@react-google-maps/api';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';
import { EstadoEmergencia, EstadoPatrullero } from '../types/enums';
import { AlertaCoaccion } from './AlertaCoaccion';
import type { Emergencia } from '../types/Emergencia';
import type { Patrullero } from '../types/Patrullero';

// ── SVG helpers para íconos del mapa ───────────────────────────────────────

/** Ícono de emergencia diferenciado por tipo de servicio */
function getEmergenciaIcon(tipo: string, isSelected: boolean, isCoac: boolean) {
  const size = isSelected ? 60 : 48;
  let svgContent: string;

  if (isCoac) {
    // Coacción: morado con ⚠
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#6A0DAD" opacity="0.3"/>
      <circle cx="28" cy="28" r="21" fill="#6A0DAD"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="2"/>
      <text x="28" y="34" text-anchor="middle" fill="white" font-size="16" font-weight="bold" font-family="Arial,sans-serif">⚠</text>
    `;
  } else if (tipo === 'BOMBEROS') {
    // Bomberos: naranja con llama
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#E65100" opacity="0.25"/>
      <circle cx="28" cy="28" r="21" fill="#FF5722"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="2"/>
      <text x="28" y="34" text-anchor="middle" fill="white" font-size="18" font-family="Arial,sans-serif">🔥</text>
    `;
  } else if (tipo === 'SALUD') {
    // Salud: blanco con cruz roja
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#C62828" opacity="0.15"/>
      <circle cx="28" cy="28" r="21" fill="white"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="#C62828" stroke-width="2.5"/>
      <rect x="22" y="15" width="12" height="26" rx="3" fill="#C62828"/>
      <rect x="15" y="22" width="26" height="12" rx="3" fill="#C62828"/>
    `;
  } else {
    // Policía (default): azul con SOS
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#1565C0" opacity="0.25"/>
      <circle cx="28" cy="28" r="21" fill="#1565C0"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="2"/>
      <text x="28" y="34" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial,sans-serif">SOS</text>
    `;
  }

  return {
    size,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 56 56">${svgContent}</svg>`
  };
}

/** Ícono de unidad móvil top-down estilo Uber, diferenciado por tipoServicio */
function getUnidadIcon(tipoServicio: string, isActive: boolean, isAssigned: boolean) {
  const size = isAssigned ? 56 : 44;
  let svgContent: string;

  const pulse = isAssigned
    ? `<circle cx="26" cy="26" r="25" fill="none" stroke="#00BFFF" stroke-width="3" stroke-dasharray="4,3"/>`
    : '';

  if (tipoServicio === 'SALUD') {
    // Ambulancia top-down: blanca con cruz roja
    svgContent = `
      ${pulse}
      <rect x="10" y="8" width="32" height="36" rx="6" fill="${isActive ? 'white' : '#90A4AE'}" stroke="#C62828" stroke-width="2"/>
      <rect x="14" y="12" width="24" height="28" rx="4" fill="${isActive ? '#FFEBEE' : '#CFD8DC'}"/>
      <rect x="20" y="16" width="12" height="20" rx="2" fill="${isActive ? 'white' : '#B0BEC5'}"/>
      <rect x="19" y="21" width="14" height="5" rx="1.5" fill="#C62828"/>
      <rect x="23" y="17" width="5" height="13" rx="1.5" fill="#C62828"/>
      <rect x="12" y="36" width="9" height="6" rx="2" fill="${isActive ? '#CFD8DC' : '#90A4AE'}"/>
      <rect x="31" y="36" width="9" height="6" rx="2" fill="${isActive ? '#CFD8DC' : '#90A4AE'}"/>
    `;
  } else if (tipoServicio === 'BOMBEROS') {
    // Camión bomberos top-down: rojo
    svgContent = `
      ${pulse}
      <rect x="8" y="6" width="36" height="40" rx="6" fill="${isActive ? '#C62828' : '#78909C'}" stroke="#B71C1C" stroke-width="2"/>
      <rect x="12" y="10" width="28" height="32" rx="4" fill="${isActive ? '#E53935' : '#90A4AE'}"/>
      <rect x="14" y="12" width="24" height="14" rx="3" fill="${isActive ? '#FFEBEE' : '#B0BEC5'}"/>
      <text x="26" y="23" text-anchor="middle" fill="${isActive ? '#C62828' : '#607D8B'}" font-size="10" font-weight="bold" font-family="Arial,sans-serif">🚒</text>
      <rect x="14" y="30" width="10" height="10" rx="2" fill="${isActive ? '#FFCDD2' : '#CFD8DC'}"/>
      <rect x="28" y="30" width="10" height="10" rx="2" fill="${isActive ? '#FFCDD2' : '#CFD8DC'}"/>
      <circle cx="16" cy="42" r="4" fill="${isActive ? '#37474F' : '#546E7A'}"/>
      <circle cx="36" cy="42" r="4" fill="${isActive ? '#37474F' : '#546E7A'}"/>
    `;
  } else {
    // Patrulla policial top-down: azul oscuro
    svgContent = `
      ${pulse}
      <rect x="10" y="7" width="32" height="38" rx="7" fill="${isActive ? '#0D47A1' : '#546E7A'}" stroke="#1565C0" stroke-width="2"/>
      <rect x="14" y="11" width="24" height="24" rx="4" fill="${isActive ? '#1565C0' : '#607D8B'}"/>
      <rect x="15" y="12" width="22" height="11" rx="3" fill="${isActive ? '#BBDEFB' : '#90A4AE'}"/>
      <rect x="10" y="20" width="4" height="8" rx="2" fill="${isActive ? '#FFD600' : '#B0BEC5'}"/>
      <rect x="38" y="20" width="4" height="8" rx="2" fill="${isActive ? '#FFD600' : '#B0BEC5'}"/>
      <circle cx="16" cy="38" r="4" fill="${isActive ? '#212121' : '#546E7A'}"/>
      <circle cx="36" cy="38" r="4" fill="${isActive ? '#212121' : '#546E7A'}"/>
      <rect x="20" y="36" width="12" height="6" rx="2" fill="${isActive ? '#BBDEFB' : '#90A4AE'}"/>
    `;
  }

  return {
    size,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 52 52">${svgContent}</svg>`
  };
}

const libraries: ("places" | "marker")[] = ["places", "marker"];
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

const mapContainerStyle = {
  height: "100%",
  width: "100%"
};

const options: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  mapId: "DEMO_MAP_ID"
};

const ACTIVE_STATES = ['PENDIENTE', 'DESPACHADA', 'COACCION'] as const;
const CENTER_POSITION = { lat: -11.9765, lng: -76.7725 };

/** Wrapper personalizado para usar AdvancedMarkerElement en @react-google-maps/api */
const CustomAdvancedMarker = ({ position, iconData, zIndex, onClick }: {
  position: google.maps.LatLngLiteral;
  iconData: { size: number; svgContent: string };
  zIndex?: number;
  onClick?: () => void;
}) => {
  const map = useGoogleMap();
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (!containerRef.current) {
    containerRef.current = document.createElement('div');
    // Shift up by 50% to align center of SVG with the coordinate (default anchor is bottom center)
    containerRef.current.style.transform = 'translate(0, 50%)';
    containerRef.current.style.cursor = onClick ? 'pointer' : 'default';
  }

  // Update SVG content
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = iconData.svgContent;
    }
  }, [iconData.svgContent]);

  // Create & Teardown Marker
  useEffect(() => {
    if (!map) return;
    
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content: containerRef.current,
      zIndex
    });

    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
    };
  }, [map]);

  // Update Position & Z-Index
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.position = position;
      if (zIndex !== undefined) markerRef.current.zIndex = zIndex;
    }
  }, [position.lat, position.lng, zIndex]);

  // Update Click Listener
  useEffect(() => {
    if (markerRef.current && onClick) {
      const listener = markerRef.current.addListener('click', onClick);
      return () => listener.remove();
    }
  }, [onClick]);

  return null;
};

const MapDashboardInner = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries
  });

  const { rol } = useAuth();
  const { emergencias } = useEmergencias(rol);
  const { patrulleros } = usePatrulleros(rol);

  const [selectedEmergenciaId, setSelectedEmergenciaId] = useState<string | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [shouldFetchDirections, setShouldFetchDirections] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick cada 30s para actualizar tiempos sin Date.now() impuro en render
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Derivar emergencia seleccionada de la lista reactiva (sin setState en effect)
  const selectedEmergencia = useMemo(
    () => emergencias.find(e => e.id === selectedEmergenciaId) ?? null,
    [emergencias, selectedEmergenciaId]
  );

  // Ref al mapa para controlar centro/zoom programáticamente
  const mapRef = useRef<google.maps.Map | null>(null);
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Tracking de IDs de emergencias anteriores para detectar nuevas
  const prevEmergenciaIdsRef = useRef<Set<string>>(new Set());

  const hasCoaccion = emergencias.some(e => e.estado === EstadoEmergencia.COACCION);

  // ── Auto-detección de nuevas emergencias activas ───────────────────
  useEffect(() => {
    const currentActiveIds = new Set(
      emergencias
        .filter(e => (ACTIVE_STATES as readonly string[]).includes(e.estado))
        .map(e => e.id)
    );

    // Buscar IDs que no existían antes (nuevas emergencias)
    const newIds = [...currentActiveIds].filter(id => !prevEmergenciaIdsRef.current.has(id));

    if (newIds.length > 0 && prevEmergenciaIdsRef.current.size > 0) {
      const newEmergencia = emergencias.find(e => e.id === newIds[0]);
      if (newEmergencia && newEmergencia.latitud && newEmergencia.longitud) {
        setSelectedEmergenciaId(newEmergencia.id);
        setDirectionsResponse(null);
        setRouteInfo(null);
        setShouldFetchDirections(true);

        if (mapRef.current) {
          mapRef.current.panTo({ lat: newEmergencia.latitud, lng: newEmergencia.longitud });
          mapRef.current.setZoom(16);
        }
      }
    }

    prevEmergenciaIdsRef.current = currentActiveIds;
  }, [emergencias]);

  // ── Detectar cambio de patrulla asignada → recalcular ruta ──
  const prevPatrullaRef = useRef<string | null>(null);
  useEffect(() => {
    const currentPatrulla = selectedEmergencia?.patrullaAsignadaId ?? null;
    if (prevPatrullaRef.current !== null && currentPatrulla !== prevPatrullaRef.current) {
      setDirectionsResponse(null);
      setRouteInfo(null);
      setShouldFetchDirections(true);
    }
    prevPatrullaRef.current = currentPatrulla;
  }, [selectedEmergencia?.patrullaAsignadaId]);

  const stats = useMemo(() => {
    const emergenciasConPatrulla = emergencias.filter(e => e.patrullaAsignadaId && e.estado !== 'PENDIENTE');
    const resueltas = emergencias.filter(e => e.estado === 'RESUELTA');
    const tRespuestas = emergenciasConPatrulla.map(e => now - e.timestampMs).filter(t => t > 0);
    const avgResponseMs = tRespuestas.length ? tRespuestas.reduce((a,b)=>a+b,0)/tRespuestas.length : 0;
    
    return {
      pendientes: emergencias.filter(e => e.estado === EstadoEmergencia.PENDIENTE || e.estado === EstadoEmergencia.COACCION).length,
      despachadas: emergencias.filter(e => e.estado === EstadoEmergencia.DESPACHADA).length,
      resueltas: resueltas.length,
      total: emergencias.length,
      patrullerosActivos: patrulleros.filter(p => p.estado !== EstadoPatrullero.FUERA_DE_SERVICIO).length,
      patrullerosTotal: patrulleros.length,
      avgResponseMin: Math.round(avgResponseMs / 60000)
    };
  }, [emergencias, patrulleros, now]);

  const emergenciasFiltradas = useMemo(() =>
    emergencias.filter(e => e.latitud != null && e.longitud != null), [emergencias]);

  const patrullerosFiltrados = useMemo(() =>
    patrulleros.filter(p => p.latitud != null && p.longitud != null), [patrulleros]);

  const directionsCallback = useCallback((response: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && response !== null) {
      setDirectionsResponse(response);
      setShouldFetchDirections(false);

      // Extraer info de ruta (distancia y tiempo)
      const leg = response.routes?.[0]?.legs?.[0];
      if (leg) {
        setRouteInfo({
          distance: leg.distance?.text || '',
          duration: leg.duration?.text || ''
        });
      }

      // Ajustar el mapa para mostrar toda la ruta
      if (mapRef.current && response.routes?.[0]?.bounds) {
        mapRef.current.fitBounds(response.routes[0].bounds, { top: 80, bottom: 40, left: 40, right: 40 });
      }
    } else {
      console.log('Error fetching directions:', status, response);
      setShouldFetchDirections(false);
    }
  }, []);

  // Patrullero asignado a la emergencia seleccionada
  const activePatrol = selectedEmergencia?.patrullaAsignadaId 
    ? patrullerosFiltrados.find(p => p.uid === selectedEmergencia.patrullaAsignadaId) 
    : null;

  // Handler para seleccionar una emergencia manualmente
  const handleSelectEmergencia = useCallback((e: Emergencia) => {
    setSelectedEmergenciaId(e.id);
    setDirectionsResponse(null);
    setRouteInfo(null);
    setShouldFetchDirections(true);

    // Centrar en la emergencia
    if (mapRef.current) {
      mapRef.current.panTo({ lat: e.latitudActual ?? e.latitud, lng: e.longitudActual ?? e.longitud });
      mapRef.current.setZoom(16);
    }
  }, []);

  // Handler para cerrar misión
  const handleCloseMission = useCallback(() => {
    setSelectedEmergenciaId(null);
    setDirectionsResponse(null);
    setRouteInfo(null);
    setShouldFetchDirections(false);

    // Volver al centro de Chaclacayo
    if (mapRef.current) {
      mapRef.current.panTo(CENTER_POSITION);
      mapRef.current.setZoom(15);
    }
  }, []);

  // Calcular tiempo transcurrido desde la emergencia
  const elapsedTime = useMemo(() => {
    if (!selectedEmergencia) return '';
    const diff = now - selectedEmergencia.timestampMs;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Hace instantes';
    if (mins < 60) return `Hace ${mins} min`;
    return `Hace ${Math.floor(mins / 60)}h ${mins % 60}min`;
  }, [selectedEmergencia, now]);

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Cargando mapa táctico...</div>;

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Barra de estadísticas ──────────────────────────── */}
      {/* ── Barra de estadísticas (Dashboard Cards) ──────────────────────────── */}
      <div
        role="status"
        aria-live="polite"
        style={{
          backgroundColor: 'var(--c3-bg)',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          zIndex: 10,
          borderBottom: '1px solid var(--c3-border)'
        }}
      >
        {[
          { label: 'Pendientes', count: stats.pendientes, color: '#E02828', icon: '🔴' },
          { label: 'Despachadas', count: stats.despachadas, color: '#F6C23E', icon: '🟡' },
          { label: 'Resueltas', count: stats.resueltas, color: '#43A047', icon: '🟢' },
          { label: 'Unidades Activas', count: `${stats.patrullerosActivos}/${stats.patrullerosTotal}`, color: '#1E88E5', icon: '🚓' },
          { label: 'Tiempo Prom.', count: `${stats.avgResponseMin}m`, color: '#8E24AA', icon: '⏱️' }
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'white',
            borderRadius: '12px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            borderLeft: `4px solid ${stat.color}`
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--c3-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              {stat.icon} {stat.label}
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--c3-text)' }}>
              {stat.count}
            </span>
          </div>
        ))}
      </div>

      {hasCoaccion && <AlertaCoaccion />}

      {/* ── Panel de Misión Táctica ──────────────────────── */}
      {selectedEmergencia && (
        <div style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #0B2046 0%, #1a3a6c 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          borderBottom: '2px solid #00BFFF',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#00BFFF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                Misión Táctica Activa
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                {selectedEmergencia.vecinoNombre || selectedEmergencia.vecinoDni || 'Vecino Desconocido'}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
              <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Estado</div>
              <div style={{
                fontWeight: 'bold',
                color: selectedEmergencia.estado === 'PENDIENTE' ? '#ff4444' :
                       selectedEmergencia.estado === 'DESPACHADA' ? '#F6C23E' :
                       selectedEmergencia.estado === 'EN_SITIO' ? '#00BFFF' : '#4CAF50'
              }}>
                {selectedEmergencia.estado}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
              <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Unidad Asignada</div>
              <div style={{ fontWeight: 'bold' }}>
                {activePatrol
                  ? `${activePatrol.tipoServicio === 'SALUD' ? '🚑' : activePatrol.tipoServicio === 'BOMBEROS' ? '🚒' : '🚔'} ${activePatrol.nombre}`
                  : '⏳ Sin asignar'}
              </div>
            </div>

            {routeInfo && (
              <>
                <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Distancia</div>
                  <div style={{ fontWeight: 'bold', color: '#00BFFF' }}>{routeInfo.distance}</div>
                </div>
                <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#aaa' }}>ETA</div>
                  <div style={{ fontWeight: 'bold', color: '#4CAF50' }}>{routeInfo.duration}</div>
                </div>
              </>
            )}

            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
              <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Reportado</div>
              <div style={{ fontSize: '0.85rem' }}>{elapsedTime}</div>
            </div>
          </div>

          <button
            onClick={handleCloseMission}
            style={{
              cursor: 'pointer',
              backgroundColor: 'rgba(224,40,40,0.9)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 'bold',
              fontSize: '0.8rem',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#ff2222')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(224,40,40,0.9)')}
          >
            ✕ Cerrar Misión
          </button>
        </div>
      )}

      {/* ── Mapa Táctico ──────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }} role="application" aria-label="Mapa táctico de Chaclacayo">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={CENTER_POSITION}
          zoom={15}
          options={options}
          onLoad={onMapLoad}
        >
          {/* Direcciones — Ruta del patrullero a la emergencia */}
          {selectedEmergencia && activePatrol && shouldFetchDirections && !directionsResponse && (
            <DirectionsService
              options={{
                destination: { lat: selectedEmergencia.latitudActual ?? selectedEmergencia.latitud, lng: selectedEmergencia.longitudActual ?? selectedEmergencia.longitud },
                origin: { lat: activePatrol.latitud, lng: activePatrol.longitud },
                travelMode: google.maps.TravelMode.DRIVING
              }}
              callback={directionsCallback}
            />
          )}

          {directionsResponse && (
            <DirectionsRenderer
              options={{
                directions: directionsResponse,
                suppressMarkers: true,
                polylineOptions: { strokeColor: '#00BFFF', strokeWeight: 6, strokeOpacity: 0.8 }
              }}
            />
          )}

          {/* Marcadores de Emergencia — diferenciados por tipo de servicio */}
          {emergenciasFiltradas.map((e) => {
            const isCoac = e.estado === EstadoEmergencia.COACCION;
            const isSelected = selectedEmergencia?.id === e.id;
            const iconData = getEmergenciaIcon(e.tipo, isSelected, isCoac);
            return (
              <CustomAdvancedMarker
                key={e.id}
                position={{ lat: e.latitudActual ?? e.latitud, lng: e.longitudActual ?? e.longitud }}
                iconData={iconData}
                zIndex={isSelected ? 1000 : 100}
                onClick={() => handleSelectEmergencia(e)}
              />
            );
          })}

          {/* Marcadores de Unidades — Top-down estilo Uber por tipo de servicio */}
          {patrullerosFiltrados.map((p) => {
            const isActive = p.estado === EstadoPatrullero.EN_SERVICIO;
            const isAssigned = selectedEmergencia?.patrullaAsignadaId === p.uid;
            const iconData = getUnidadIcon(p.tipoServicio, isActive, isAssigned);
            return (
              <CustomAdvancedMarker
                key={p.uid}
                position={{ lat: p.latitud, lng: p.longitud }}
                iconData={iconData}
                zIndex={isAssigned ? 999 : 50}
              />
            );
          })}
        </GoogleMap>

        {/* ── Lista de emergencias activas (sidebar flotante) ── */}
        {emergenciasFiltradas.filter(e => e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA').length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            maxHeight: '240px',
            width: '300px',
            overflowY: 'auto',
            backgroundColor: 'rgba(11, 32, 70, 0.92)',
            borderRadius: '10px',
            border: '1px solid rgba(0,191,255,0.3)',
            backdropFilter: 'blur(8px)',
            padding: '8px',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ color: '#00BFFF', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', padding: '4px 8px' }}>
              Emergencias Activas
            </div>
            {emergenciasFiltradas
              .filter(e => e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA')
              .map(e => {
                const isSelected = selectedEmergencia?.id === e.id;
                const assignedPatrol = e.patrullaAsignadaId 
                  ? patrullerosFiltrados.find(p => p.uid === e.patrullaAsignadaId) 
                  : null;
                return (
                  <div
                    key={e.id}
                    onClick={() => handleSelectEmergencia(e)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(0,191,255,0.15)' : 'rgba(255,255,255,0.05)',
                      border: isSelected ? '1px solid #00BFFF' : '1px solid transparent',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={ev => { if (!isSelected) ev.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={ev => { if (!isSelected) ev.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        {e.tipo === 'BOMBEROS' ? '🔥' : e.tipo === 'SALUD' ? '➕' : '🆘'} {e.vecinoNombre || e.vecinoDni || 'Vecino'}
                      </span>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        color: 'white',
                        backgroundColor: e.estado === 'PENDIENTE' ? '#E02828' :
                                         e.estado === 'DESPACHADA' ? '#F6C23E' :
                                         e.estado === 'COACCION' ? '#6A0DAD' : '#1E88E5'
                      }}>
                        {e.estado}
                      </span>
                    </div>
                    <div style={{ color: '#aaa', fontSize: '0.7rem', marginTop: '2px' }}>
                      {assignedPatrol
                        ? `${(assignedPatrol as Patrullero).tipoServicio === 'SALUD' ? '🚑' : (assignedPatrol as Patrullero).tipoServicio === 'BOMBEROS' ? '🚒' : '🚔'} ${assignedPatrol.nombre}`
                        : '⏳ Sin unidad'}
                      {' · '}
                      {Math.floor((now - e.timestampMs) / 60000)} min
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

export const MapDashboard = memo(MapDashboardInner);
