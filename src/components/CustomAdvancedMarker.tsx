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
  
  const currentPosRef = useRef<google.maps.LatLngLiteral>(position);
  const targetPosRef = useRef<google.maps.LatLngLiteral>(position);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const ANIM_DURATION = 800; 

  if (!containerRef.current) {
    containerRef.current = document.createElement('div');
    containerRef.current.style.transform = 'translate(0, 50%)';
    containerRef.current.style.cursor = onClick ? 'pointer' : 'default';
  }

  // Update HTML content
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = iconData.htmlContent;
    }
  }, [iconData.htmlContent]);

  // Create & Teardown Marker
  useEffect(() => {
    if (!map) return;
    currentPosRef.current = position;
    targetPosRef.current = position;
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content: containerRef.current,
      zIndex
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
    };
  }, [map]);

  // Interpolación suave al cambiar posición
  useEffect(() => {
    if (!markerRef.current) return;
    if (!animate) {
      markerRef.current.position = position;
      currentPosRef.current = position;
      return;
    }
    const from = { ...currentPosRef.current };
    targetPosRef.current = position;
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
          if (containerRef.current) {
            const rotationContainer = containerRef.current.querySelector('.marker-rotation-container') as HTMLElement;
            if (rotationContainer) {
              rotationContainer.style.transform = `rotate(${bearing}deg)`;
            }
          }
        }
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, [position.lat, position.lng, animate]);

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
