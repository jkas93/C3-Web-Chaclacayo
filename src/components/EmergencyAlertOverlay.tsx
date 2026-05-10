import { useEffect, useRef } from 'react';
import { useEmergencias } from '../hooks/useEmergencias';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

export const EmergencyAlertOverlay = () => {
  const { emergencias } = useEmergencias();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasActiveEmergency = emergencias.some(
    e => (e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA') && !e.alertaWebSilenciada
  );

  useEffect(() => {
    if (hasActiveEmergency) {
      if (audioRef.current) {
        // Reproducir sonido si está permitido por el navegador (requiere interacción previa)
        audioRef.current.play().catch(e => console.log('Autoplay prevent:', e));
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [hasActiveEmergency]);

  if (!hasActiveEmergency) return null;

  const handleSilenciar = () => {
    emergencias.forEach(e => {
      if ((e.estado !== 'RESUELTA' && e.estado !== 'CANCELADA') && !e.alertaWebSilenciada) {
        updateDoc(doc(db, 'emergencias', e.id), { alertaWebSilenciada: true });
      }
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
      {/* Overlay Visual Intermitente */}
      <div 
        className="emergency-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: 'inset 0 0 150px rgba(255, 0, 0, 0.8)',
          animation: 'flashRed 1s infinite alternate'
        }}
      >
        <style>
          {`
            @keyframes flashRed {
              0% { box-shadow: inset 0 0 50px rgba(255, 0, 0, 0.5); background-color: rgba(255, 0, 0, 0.1); }
              100% { box-shadow: inset 0 0 200px rgba(255, 0, 0, 0.9); background-color: rgba(255, 0, 0, 0.3); }
            }
          `}
        </style>
      </div>
      
      {/* Botón Flotante para Silenciar */}
      <button 
        onClick={handleSilenciar}
        style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
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
          animation: 'pulse 1.5s infinite'
        }}
      >
        🔕 SILENCIAR ALARMA C3
      </button>
    </>
  );
};
