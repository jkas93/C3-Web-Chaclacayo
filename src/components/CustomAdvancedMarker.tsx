import { useEffect, useRef } from 'react';
import { useGoogleMap } from '@react-google-maps/api';
import { lerp, calculateBearing } from '../utils/MapMarkerUtils';

export const CustomAdvancedMarker = ({ position, iconData, zIndex, onClick, animate = true }: {
  position: google.maps.LatLngLiteral;
  iconData: { size: number; htmlContent: string };
  zIndex?: number;
  onClick?: () => void;
  animate?: boolean;
}) => {
  const map = useGoogleMap();
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialPositionRef = useRef(position);
  
  const currentPosRef = useRef<google.maps.LatLngLiteral>(position);
  const targetPosRef = useRef<google.maps.LatLngLiteral>(position);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const ANIM_DURATION = 800; 
  const positionLat = position.lat;
  const positionLng = position.lng;

  // Update HTML content
  useEffect(() => {
    if (containerRef.current) containerRef.current.innerHTML = iconData.htmlContent;
  }, [iconData.htmlContent]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.style.cursor = onClick ? 'pointer' : 'default';
  }, [onClick]);

  // Create & Teardown Marker
  useEffect(() => {
    if (!map) return;
    const container = document.createElement('div');
    container.style.transform = 'translate(0, 50%)';
    container.style.cursor = onClick ? 'pointer' : 'default';
    container.innerHTML = iconData.htmlContent;
    containerRef.current = container;
    currentPosRef.current = initialPositionRef.current;
    targetPosRef.current = initialPositionRef.current;
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: currentPosRef.current,
      content: container,
      zIndex
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
      containerRef.current = null;
    };
    // Los cambios posteriores de contenido, click y z-index tienen efectos dedicados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Interpolación suave al cambiar posición
  useEffect(() => {
    if (!markerRef.current) return;
    const nextPosition = { lat: positionLat, lng: positionLng };
    if (!animate) {
      markerRef.current.position = nextPosition;
      currentPosRef.current = nextPosition;
      return;
    }
    const from = { ...currentPosRef.current };
    targetPosRef.current = nextPosition;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;

    const step = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const t = Math.min(elapsed / ANIM_DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      const interpolated = {
        lat: lerp(from.lat, targetPosRef.current.lat, eased),
        lng: lerp(from.lng, targetPosRef.current.lng, eased)
      };

      if (markerRef.current) {
        markerRef.current.position = interpolated;
        currentPosRef.current = interpolated;
        
        // Rotar el carrito hacia la dirección en la que se mueve
        if (Math.abs(targetPosRef.current.lat - from.lat) > 0.000005 || Math.abs(targetPosRef.current.lng - from.lng) > 0.000005) {
          const bearing = calculateBearing(from.lat, from.lng, targetPosRef.current.lat, targetPosRef.current.lng);
          const rotationContainer = containerRef.current?.querySelector('.marker-rotation-container') as HTMLElement | undefined;
          if (rotationContainer) {
            rotationContainer.style.transform = `rotate(${bearing}deg)`;
          }
        }
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, [positionLat, positionLng, animate]);

  // Update Z-Index
  useEffect(() => {
    if (markerRef.current && zIndex !== undefined) markerRef.current.zIndex = zIndex;
  }, [zIndex]);

  // Update Click Listener
  useEffect(() => {
    if (markerRef.current && onClick) {
      const listener = markerRef.current.addListener('gmp-click', onClick);
      return () => listener.remove();
    }
  }, [onClick]);

  return null;
};
