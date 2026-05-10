import { useMemo, memo, useState, useCallback, useRef, useEffect } from 'react';
import { useJsApiLoader, GoogleMap, MarkerF, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { EstadoEmergencia, EstadoPatrullero } from '../types/enums';
import { AlertaCoaccion } from './AlertaCoaccion';
import type { Emergencia } from '../types/Emergencia';

const libraries: "places"[] = ["places"];
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyDHJ4wqFcxgTNgx7OmPtcATnjv5mym24rs";

const mapContainerStyle = {
  height: "100%",
  width: "100%"
};

const options: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  styles: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#d59563" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#38414e" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#212a37" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#9ca5b3" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#17263c" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#515c6d" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.stroke",
      stylers: [{ color: "#17263c" }],
    },
  ],
};

const ACTIVE_STATES = ['PENDIENTE', 'DESPACHADA', 'COACCION'] as const;
const CENTER_POSITION = { lat: -11.9765, lng: -76.7725 };

const MapDashboardInner = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries
  });

  const { emergencias } = useEmergencias();
  const { patrulleros } = usePatrulleros();

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
      <div
        role="status"
        aria-live="polite"
        style={{
          backgroundColor: 'var(--c3-primary, #0B2046)',
          color: 'white',
          padding: '0.8rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span aria-label={`${stats.pendientes} emergencias pendientes`}>🔴 Pendientes: <strong>{stats.pendientes}</strong></span>
          <span aria-label={`${stats.despachadas} emergencias despachadas`}>🟡 Despachadas: <strong>{stats.despachadas}</strong></span>
          <span aria-label={`${stats.resueltas} emergencias resueltas`}>🟢 Resueltas: <strong>{stats.resueltas}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
          <span aria-label={`Unidades activas: ${stats.patrullerosActivos} de ${stats.patrullerosTotal}`}>
            🚓 Unidades: <strong>{stats.patrullerosActivos}/{stats.patrullerosTotal}</strong>
          </span>
          <span aria-label={`Tiempo de respuesta promedio: ${stats.avgResponseMin} minutos`}>
            ⏱️ T. Respuesta Prom: <strong>{stats.avgResponseMin}m</strong>
          </span>
          <span aria-label={`Total de incidentes hoy: ${stats.total}`}>
            📊 Total: <strong>{stats.total}</strong>
          </span>
        </div>
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
              <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Patrulla</div>
              <div style={{ fontWeight: 'bold' }}>
                {activePatrol ? `🚔 ${activePatrol.nombre}` : '⏳ Sin asignar'}
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

          {/* Marcadores de Emergencia — Círculo rojo con SOS */}
          {emergenciasFiltradas.map((e) => {
            const isCoac = e.estado === EstadoEmergencia.COACCION;
            const isSelected = selectedEmergencia?.id === e.id;
            const markerSize = isSelected ? 60 : 48;
            const sosIcon = {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="${markerSize}" height="${markerSize}" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="27" fill="${isCoac ? '#6A0DAD' : '#D32F2F'}" opacity="${isSelected ? '0.5' : '0.3'}"/>
                  <circle cx="28" cy="28" r="21" fill="${isCoac ? '#6A0DAD' : '#D32F2F'}"/>
                  <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="${isSelected ? '3' : '2'}"/>
                  <text x="28" y="34" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial,sans-serif">${isCoac ? '⚠' : 'SOS'}</text>
                </svg>
              `)}`,
              scaledSize: new google.maps.Size(markerSize, markerSize),
              anchor: new google.maps.Point(markerSize / 2, markerSize / 2),
            };
            return (
              <MarkerF
                key={e.id}
                position={{ lat: e.latitudActual ?? e.latitud, lng: e.longitudActual ?? e.longitud }}
                icon={sosIcon}
                zIndex={isSelected ? 1000 : 100}
                onClick={() => handleSelectEmergencia(e)}
              />
            );
          })}

          {/* Marcadores de Patrulleros — Escudo policial azul con estrella */}
          {patrullerosFiltrados.map((p) => {
            const isActive = p.estado === EstadoPatrullero.EN_SERVICIO;
            const isAssigned = selectedEmergencia?.patrullaAsignadaId === p.uid;
            const markerSize = isAssigned ? 56 : 44;
            const policeIcon = {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="${markerSize}" height="${markerSize}" viewBox="0 0 52 52">
                  ${isAssigned ? '<circle cx="26" cy="26" r="25" fill="none" stroke="#00BFFF" stroke-width="3" stroke-dasharray="4,3"/>' : ''}
                  <circle cx="26" cy="26" r="24" fill="${isActive ? '#0D47A1' : '#37474F'}"/>
                  <circle cx="26" cy="26" r="24" fill="none" stroke="#FFD700" stroke-width="2.5"/>
                  <polygon points="26,10 29.5,20.5 40,20.5 31.5,26.5 34.5,37 26,31 17.5,37 20.5,26.5 12,20.5 22.5,20.5" fill="#FFD700"/>
                  <text x="26" y="30" text-anchor="middle" fill="#0D47A1" font-size="11" font-weight="bold" font-family="Arial,sans-serif">P</text>
                </svg>
              `)}`,
              scaledSize: new google.maps.Size(markerSize, markerSize),
              anchor: new google.maps.Point(markerSize / 2, markerSize / 2),
            };
            return (
              <MarkerF
                key={p.uid}
                position={{ lat: p.latitud, lng: p.longitud }}
                icon={policeIcon}
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
                        {e.tipo === 'SOS' ? '🔴' : '🟠'} {e.vecinoNombre || e.vecinoDni || 'Vecino'}
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
                      {assignedPatrol ? `🚔 ${assignedPatrol.nombre}` : '⏳ Sin patrulla'}
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
