import { useMemo, memo, useState, useCallback, useRef, useEffect } from 'react';
import { useJsApiLoader, GoogleMap, DirectionsService, DirectionsRenderer, Polygon } from '@react-google-maps/api';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { doc, updateDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';
import { EstadoEmergencia, EstadoPatrullero } from '../types/enums';
import { AlertaCoaccion } from './AlertaCoaccion';
import type { Emergencia } from '../types/Emergencia';
import type { Patrullero } from '../types/Patrullero';

// ── Funciones importadas de Utils ───────────────────────────────────────
import { getEmergenciaIcon, getUnidadIcon } from '../utils/MapMarkerUtils';
import { CustomAdvancedMarker } from './CustomAdvancedMarker';

const libraries: ("places" | "marker" | "drawing" | "geometry")[] = ["places", "marker", "drawing", "geometry"];
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

  const [cuadrantes, setCuadrantes] = useState<any[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [draftPolygon, setDraftPolygon] = useState<{lat: number, lng: number}[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cuadrantes'), snap => {
      setCuadrantes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!isDrawingMode || !e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setDraftPolygon(prev => [...prev, { lat, lng }]);
  }, [isDrawingMode]);

  const onPolygonComplete = useCallback(() => {
    if (draftPolygon.length < 3) {
      alert("Un cuadrante necesita al menos 3 puntos.");
      return;
    }
    const name = window.prompt('Ingrese el nombre del cuadrante (ej. Cuadrante Alfa):');
    if (name) {
      addDoc(collection(db, 'cuadrantes'), {
        nombre: name,
        path: draftPolygon
      }).catch(err => console.error("Error al guardar cuadrante", err));
    }
    setIsDrawingMode(false);
    setDraftPolygon([]);
  }, [draftPolygon]);

  const emergenciasFiltradas = useMemo(() =>
    emergencias.filter(e => e.latitud != null && e.longitud != null), [emergencias]);

  const patrullerosFiltrados = useMemo(() =>
    patrulleros.filter(p => p.latitud != null && p.longitud != null), [patrulleros]);

  // Alertas de Salida de Cuadrante
  const alertasGeocerca = useMemo(() => {
    if (!window.google?.maps?.geometry) return [];
    
    const alertas: { patrullaId: string, nombre: string, cuadranteNombre: string }[] = [];
    
    patrullerosFiltrados.forEach(p => {
      if (p.cuadranteAsignadoId && p.estado === EstadoPatrullero.EN_SERVICIO) {
        const cuadrante = cuadrantes.find(c => c.id === p.cuadranteAsignadoId);
        if (cuadrante) {
          const latLng = new window.google.maps.LatLng(p.latitud, p.longitud);
          const polygon = new window.google.maps.Polygon({ paths: cuadrante.path });
          const isInside = window.google.maps.geometry.poly.containsLocation(latLng, polygon);
          
          if (!isInside) {
            alertas.push({ patrullaId: p.uid, nombre: p.nombre, cuadranteNombre: cuadrante.nombre });
          }
        }
      }
    });
    
    return alertas;
  }, [patrullerosFiltrados, cuadrantes]);

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
    // ⏱️ SLA Real: Basado en la marca de tiempo exacta de llegada de la patrulla
    const resueltas = emergencias.filter(e => e.estado === 'RESUELTA');
    const emergenciasSLA = emergencias.filter(e => e.horaLlegadaMs && e.timestampMs);
    const tRespuestas = emergenciasSLA.map(e => e.horaLlegadaMs! - e.timestampMs).filter(t => t > 0);
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
        
        // Escribir etaMinutos a Firebase para el live tracking
        if (selectedEmergenciaId && leg.duration?.value) {
          const etaMin = Math.round(leg.duration.value / 60);
          updateDoc(doc(db, 'emergencias', selectedEmergenciaId), { etaMinutos: etaMin })
            .catch(err => console.error("Error actualizando ETA:", err));
        }
      }

      // Ajustar el mapa para mostrar toda la ruta
      if (mapRef.current && response.routes?.[0]?.bounds) {
        mapRef.current.fitBounds(response.routes[0].bounds, { top: 80, bottom: 40, left: 40, right: 40 });
      }
    } else {
      console.log('Error fetching directions:', status, response);
      setShouldFetchDirections(false);
    }
  }, [selectedEmergenciaId]);

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

  const handleGeneratePublicLink = useCallback(async () => {
    if (rol !== 'ADMIN') {
      alert("Solo administradores pueden generar enlaces públicos.");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, 'enlaces_publicos'), {
        activo: true,
        createdAt: Date.now()
      });
      const url = `${window.location.origin}/publico/${docRef.id}`;
      await navigator.clipboard.writeText(url);
      alert(`Enlace copiado al portapapeles:\n${url}`);
    } catch (error) {
      console.error("Error generando enlace:", error);
      alert("Error al generar el enlace público.");
    }
  }, [rol]);

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
        
        {/* Botón para generar enlace público (Solo ADMIN) */}
        {rol === 'ADMIN' && (
          <button
            onClick={handleGeneratePublicLink}
            style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              color: 'white',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              🔗 Mapa Público
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 'auto' }}>
              Generar Enlace
            </span>
          </button>
        )}
      </div>

      {/* ── Alertas de Geocerca (Fuera de cuadrante) ── */}
      {alertasGeocerca.length > 0 && (
        <div style={{
          backgroundColor: '#ff9800',
          color: 'white',
          padding: '8px 16px',
          fontWeight: 'bold',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          overflowX: 'auto',
          borderBottom: '1px solid #f57c00'
        }}>
          <span>⚠️ ALERTAS DE GEOCERCA:</span>
          {alertasGeocerca.map(a => (
            <span key={a.patrullaId} style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
              Unidad {a.nombre} fuera de {a.cuadranteNombre}
            </span>
          ))}
        </div>
      )}

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
            
            {selectedEmergencia.audioUrl && (
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '16px' }}>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '2px' }}>Evidencia SOS</div>
                <audio src={selectedEmergencia.audioUrl} controls style={{ height: '24px', maxWidth: '180px' }} />
              </div>
            )}
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
          options={{...options, draggableCursor: isDrawingMode ? 'crosshair' : ''}}
          center={CENTER_POSITION}
          zoom={14}
          onClick={handleMapClick}
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
            const isActive = p.estado !== EstadoPatrullero.FUERA_DE_SERVICIO;
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

          {/* Cuadrantes rendering */}
          {cuadrantes.map(c => (
            <Polygon
              key={c.id}
              path={c.path}
              options={{
                fillColor: '#00BFFF',
                fillOpacity: 0.15,
                strokeColor: '#00BFFF',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                clickable: false
              }}
            />
          ))}

          {/* Cuadrante en Dibujo (Draft) */}
          {isDrawingMode && draftPolygon.length > 0 && (
            <Polygon
              path={draftPolygon}
              options={{
                fillColor: '#FF9800',
                fillOpacity: 0.3,
                strokeColor: '#FF9800',
                strokeWeight: 2,
                clickable: false
              }}
            />
          )}
        </GoogleMap>

        {/* Botones de Dibujo */}
        {isDrawingMode && draftPolygon.length >= 3 && (
          <button
            onClick={onPolygonComplete}
            style={{
              position: 'absolute',
              bottom: '64px',
              right: '16px',
              padding: '12px 20px',
              backgroundColor: '#008CBA',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            ✓ Guardar Cuadrante
          </button>
        )}
        
        <button
          onClick={() => {
            setIsDrawingMode(!isDrawingMode);
            setDraftPolygon([]);
          }}
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            padding: '12px 20px',
            backgroundColor: isDrawingMode ? '#ff4444' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            zIndex: 10
          }}
        >
          {isDrawingMode ? '✕ Cancelar Dibujo' : '✎ Dibujar Cuadrante'}
        </button>

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
