import { useEffect, useRef } from 'react';
import { useEmergencias } from '../hooks/useEmergencias';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SERVICIO_CONFIG } from '../types/enums';
import type { TipoEmergencia } from '../types/enums';

export const EmergencyAlertOverlay = () => {
  const { rol } = useAuth();
  const { emergencias } = useEmergencias(rol);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Solo emergencias activas y no silenciadas (ya vienen filtradas por el hook según el rol)
  const activeEmergencias = emergencias.filter(
    e => e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA' && !e.alertaWebSilenciada
  );
  const hasActiveEmergency = activeEmergencias.length > 0;

  // La emergencia más reciente (para mostrar info en el overlay)
  const latestEmergencia = hasActiveEmergency ? activeEmergencias[0] : null;
  const tipoConfig = latestEmergencia
    ? SERVICIO_CONFIG[latestEmergencia.tipo as TipoEmergencia]
    : null;

  // Colores del overlay según el tipo de servicio
  const overlayColor = tipoConfig?.color ?? '#D32F2F';

  useEffect(() => {
    if (hasActiveEmergency) {
      audioRef.current?.play().catch(e => console.log('Autoplay prevent:', e));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [hasActiveEmergency]);

  if (!hasActiveEmergency) return null;

  const handleSilenciar = () => {
    activeEmergencias.forEach(e => {
      updateDoc(doc(db, 'emergencias', e.id), { alertaWebSilenciada: true });
    });
  };

  return (
    <>
      {/* Alarma sonora */}
      <audio
        ref={audioRef}
        src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
        loop
        preload="auto"
      />

      {/* Overlay parpadeante con color del tipo de servicio */}
      <div
        className="emergency-overlay"
        role="alert"
        aria-live="assertive"
        aria-label={`Nueva emergencia de ${tipoConfig?.label ?? 'servicio'}`}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw', height: '100vh',
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: `inset 0 0 150px ${overlayColor}CC`,
          animation: 'flashAlert 1s infinite alternate'
        }}
      >
        <style>{`
          @keyframes flashAlert {
            0%   { box-shadow: inset 0 0 50px ${overlayColor}80;  background-color: ${overlayColor}1A; }
            100% { box-shadow: inset 0 0 200px ${overlayColor}E6; background-color: ${overlayColor}4D; }
          }
        `}</style>
      </div>

      {/* Banner superior con info de la emergencia */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          background: overlayColor,
          color: 'white',
          padding: '8px 20px',
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 'bold',
          fontSize: '0.9rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          animation: 'flashBanner 0.8s infinite alternate',
          pointerEvents: 'auto',
        }}
        role="status"
      >
        <style>{`
          @keyframes flashBanner {
            0%   { opacity: 0.9; }
            100% { opacity: 1; }
          }
        `}</style>
        <span>
          {tipoConfig?.emoji ?? '🚨'} NUEVA EMERGENCIA {tipoConfig?.label?.toUpperCase() ?? ''} —{' '}
          {activeEmergencias.length} {activeEmergencias.length === 1 ? 'activa' : 'activas'}
        </span>
        <button
          onClick={handleSilenciar}
          style={{
            background: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: '20px',
            padding: '4px 14px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 'bold',
          }}
          aria-label="Silenciar alarma"
        >
          🔕 Silenciar
        </button>
      </div>

      {/* Botón flotante inferior (para pantallas donde el banner no sea visible) */}
      <button
        onClick={handleSilenciar}
        style={{
          position: 'fixed',
          bottom: '30px', right: '30px',
          zIndex: 10000,
          pointerEvents: 'auto',
          backgroundColor: '#8B0000',
          color: 'white',
          border: '3px solid white',
          borderRadius: '50px',
          padding: '15px 30px',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          animation: 'pulse 1.5s infinite',
        }}
        aria-label="Silenciar alarma C3"
      >
        🔕 SILENCIAR ALARMA C3
      </button>
    </>
  );
};
