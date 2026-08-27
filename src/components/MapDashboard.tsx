import { useMemo, memo, useState, useCallback, useRef, useEffect } from 'react';
import { useJsApiLoader, GoogleMap, DirectionsService, DirectionsRenderer, Polygon } from '@react-google-maps/api';
import { useEmergencias } from '../hooks/useEmergencias';
import { usePatrulleros } from '../hooks/usePatrulleros';
import { useAuth } from '../context/AuthContext';
import { db, functions } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { EstadoEmergencia, EstadoPatrullero } from '../types/enums';
import { AlertaCoaccion } from './AlertaCoaccion';
import type { Emergencia } from '../types/Emergencia';
import type { Patrullero } from '../types/Patrullero';
import {
  Activity, Ambulance, CarFront, CheckCircle2, Clock3, Flame,
  MapPinned, Navigation, RadioTower, ShieldAlert, ShieldCheck, X
} from 'lucide-react';

// ── Funciones importadas de Utils ───────────────────────────────────────
import { getEmergenciaIcon, getUnidadIcon } from '../utils/MapMarkerUtils';
import { CustomAdvancedMarker } from './CustomAdvancedMarker';
import { C3MetricCard } from './ui';

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

const ACTIVE_STATES = ['PENDIENTE', 'PENDIENTE_SIN_UNIDAD', 'DESPACHADA', 'COACCION', 'ESCALADA'] as const;
const CENTER_POSITION = { lat: -11.9765, lng: -76.7725 };

interface Cuadrante {
  id: string;
  nombre: string;
  path: google.maps.LatLngLiteral[];
}

const MapDashboardInner = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries
  });

  const { rol, isAdmin } = useAuth();
  const { emergencias } = useEmergencias(rol);
  const { patrulleros } = usePatrulleros(rol);

  const [selectedEmergenciaId, setSelectedEmergenciaId] = useState<string | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [shouldFetchDirections, setShouldFetchDirections] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [cuadrantes, setCuadrantes] = useState<Cuadrante[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [draftPolygon, setDraftPolygon] = useState<{lat: number, lng: number}[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cuadrantes'), 
      snap => {
        setCuadrantes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cuadrante)));
      },
      err => {
        console.warn("No se pudieron cargar los cuadrantes (posible falta de permisos):", err.message);
      }
    );
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
      const crearCuadrante = httpsCallable(functions, 'crearCuadrante');
      crearCuadrante({ nombre: name, path: draftPolygon })
        .catch(err => console.error("Error al guardar cuadrante", err));
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
      enSitio: emergencias.filter(e => e.estado === EstadoEmergencia.EN_SITIO).length,
      sinUnidad: emergencias.filter(e => e.estado === EstadoEmergencia.PENDIENTE_SIN_UNIDAD).length,
      resueltas: resueltas.length,
      total: emergencias.length,
      patrullerosActivos: patrulleros.filter(p => p.estado !== EstadoPatrullero.FUERA_DE_SERVICIO).length,
      patrullerosTotal: patrulleros.length,
      avgResponseMin: Math.round(avgResponseMs / 60000)
    };
  }, [emergencias, patrulleros]);

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
          const gestionarEmergencia = httpsCallable(functions, 'gestionarEmergencia');
          gestionarEmergencia({ emergenciaId: selectedEmergenciaId, accion: 'ACTUALIZAR_ETA', etaMinutos: etaMin })
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

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Cargando mapa táctico...</div>;

  return (
    <div className="c3-map-dashboard">
      {/* ── Resumen operacional ──────────────────────────── */}
      <div
        role="status"
        aria-live="polite"
        className="c3-metrics mobile-padding-top"
      >
        {[
          { label: 'Pendientes', count: stats.pendientes, color: 'var(--c3-danger)', icon: <ShieldAlert size={21} /> },
          { label: 'Sin unidad', count: stats.sinUnidad, color: 'var(--c3-warning)', icon: <RadioTower size={21} /> },
          { label: 'Despachadas', count: stats.despachadas, color: 'var(--c3-info)', icon: <Navigation size={21} /> },
          { label: 'En sitio', count: stats.enSitio, color: 'var(--c3-coaction)', icon: <MapPinned size={21} /> },
          { label: 'Unidades activas', count: `${stats.patrullerosActivos}/${stats.patrullerosTotal}`, color: 'var(--c3-success)', icon: <CarFront size={21} /> }
        ].map(stat => (
          <C3MetricCard key={stat.label} label={stat.label} value={stat.count} icon={stat.icon} color={stat.color} />
        ))}
      </div>

      {/* ── Alertas de Geocerca (Fuera de cuadrante) ── */}
      {alertasGeocerca.length > 0 && (
        <div className="c3-geofence-alert" role="alert">
          <MapPinned size={18} aria-hidden="true" />
          <span>Unidades fuera de su cuadrante</span>
          {alertasGeocerca.map(a => (
            <span key={a.patrullaId} className="c3-geofence-alert__item">
              Unidad {a.nombre} fuera de {a.cuadranteNombre}
            </span>
          ))}
        </div>
      )}

      {hasCoaccion && <AlertaCoaccion />}

      {/* ── Panel de Misión Táctica ──────────────────────── */}
      {selectedEmergencia && (
        <div className="c3-mission-bar">
          <div className="c3-mission-bar__content">
            <div className="c3-mission-field">
              <div className="c3-mission-field__eyebrow">
                Misión Táctica Activa
              </div>
              <div className="c3-mission-field__value">
                {selectedEmergencia.vecinoNombre || selectedEmergencia.vecinoDni || 'Vecino Desconocido'}
              </div>
            </div>

            <div className="c3-mission-field">
              <span className="c3-mission-field__label">Estado</span>
              <span className="c3-mission-field__value">
                <Activity size={15} aria-hidden="true" />
                {selectedEmergencia.estado}
              </span>
            </div>

            <div className="c3-mission-field">
              <span className="c3-mission-field__label">Unidad asignada</span>
              <span className="c3-mission-field__value">
                <CarFront size={15} aria-hidden="true" />
                {activePatrol
                  ? activePatrol.nombre
                  : 'Sin asignar'}
              </span>
            </div>

            {routeInfo && (
              <>
                <div className="c3-mission-field">
                  <span className="c3-mission-field__label">Distancia</span>
                  <span className="c3-mission-field__value"><Navigation size={15} />{routeInfo.distance}</span>
                </div>
                <div className="c3-mission-field">
                  <span className="c3-mission-field__label">ETA</span>
                  <span className="c3-mission-field__value"><Clock3 size={15} />{routeInfo.duration}</span>
                </div>
              </>
            )}

            <div className="c3-mission-field">
              <span className="c3-mission-field__label">Reportado</span>
              <span className="c3-mission-field__value"><Clock3 size={15} />{elapsedTime}</span>
            </div>
            
            {selectedEmergencia.audioUrl && (
              <div className="c3-mission-field">
                <span className="c3-mission-field__label">Evidencia SOS</span>
                <audio src={selectedEmergencia.audioUrl} controls style={{ height: '24px', maxWidth: '180px' }} />
              </div>
            )}
          </div>

          <button
            onClick={handleCloseMission}
            className="c3-mission-close"
            aria-label="Cerrar panel de misión"
          >
            <X size={18} aria-hidden="true" /> <span>Cerrar panel</span>
          </button>
        </div>
      )}

      {/* ── Mapa Táctico ──────────────────────────────────── */}
      <div className="c3-map-canvas" role="application" aria-label="Mapa táctico de Chaclacayo">
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
        {isAdmin && isDrawingMode && draftPolygon.length >= 3 && (
          <button
            onClick={onPolygonComplete}
            className="desktop-only c3-map-tool c3-map-tool--secondary"
          >
            <CheckCircle2 size={18} aria-hidden="true" /> Guardar cuadrante
          </button>
        )}
        
        {isAdmin && <button
          onClick={() => {
            setIsDrawingMode(!isDrawingMode);
            setDraftPolygon([]);
          }}
          className={`desktop-only c3-map-tool c3-map-tool--primary ${isDrawingMode ? 'c3-map-tool--danger' : ''}`}
        >
          {isDrawingMode
            ? <><X size={18} aria-hidden="true" /> Cancelar dibujo</>
            : <><MapPinned size={18} aria-hidden="true" /> Dibujar cuadrante</>}
        </button>}

        {/* ── Lista de emergencias activas (sidebar flotante) ── */}
        {emergenciasFiltradas.filter(e => e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA').length > 0 && (
          <section className="c3-ops-queue" aria-label="Cola operativa de incidentes activos">
            <div className="c3-ops-queue__header">
              <h2 className="c3-ops-queue__title"><RadioTower size={18} aria-hidden="true" /> Cola operativa</h2>
              <span className="c3-nav-count">
                {emergenciasFiltradas.filter(e => e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA').length}
              </span>
            </div>
            {emergenciasFiltradas
              .filter(e => e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA')
              .map(e => {
                const isSelected = selectedEmergencia?.id === e.id;
                const assignedPatrol = e.patrullaAsignadaId 
                  ? patrullerosFiltrados.find(p => p.uid === e.patrullaAsignadaId) 
                  : null;
                return (
                  <button
                    key={e.id}
                    onClick={() => handleSelectEmergencia(e)}
                    className={`c3-incident-card ${isSelected ? 'c3-incident-card--selected' : ''}`}
                    style={{
                      '--incident-color': e.estado === 'COACCION' ? 'var(--c3-coaction)' :
                        e.estado === 'PENDIENTE' || e.estado === 'PENDIENTE_SIN_UNIDAD' ? 'var(--c3-warning)' :
                        e.estado === 'DESPACHADA' ? 'var(--c3-info)' : 'var(--c3-success)'
                    } as React.CSSProperties}
                    aria-pressed={isSelected}
                  >
                    <div className="c3-incident-card__top">
                      <span className="c3-incident-card__service">
                        {e.tipo === 'BOMBEROS'
                          ? <Flame size={18} color="var(--c3-service-fire)" aria-hidden="true" />
                          : e.tipo === 'SALUD'
                            ? <Ambulance size={18} color="var(--c3-service-health)" aria-hidden="true" />
                            : <ShieldCheck size={18} color="var(--c3-service-police)" aria-hidden="true" />}
                        {e.tipo}
                      </span>
                      <span className="c3-incident-card__badge">
                        {e.estado}
                      </span>
                    </div>
                    <div className="c3-incident-card__meta">
                      <span className="c3-incident-card__unit">
                        {assignedPatrol ? <CarFront size={14} /> : <RadioTower size={14} />}
                        {assignedPatrol ? (assignedPatrol as Patrullero).nombre : 'Sin unidad'}
                      </span>
                      <span>{Math.floor((now - e.timestampMs) / 60000)} min</span>
                    </div>
                  </button>
                );
              })}
          </section>
        )}
      </div>
    </div>
  );
};

export const MapDashboard = memo(MapDashboardInner);
