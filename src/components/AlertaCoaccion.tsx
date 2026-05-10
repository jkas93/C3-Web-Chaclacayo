import { useState, useEffect, useRef } from 'react';

// M10: Alarma sonora usando Web Audio API
const playAlertSound = (isCoaccion = false) => {
  try {
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = isCoaccion ? 440 : 800;
    oscillator.type = isCoaccion ? 'sawtooth' : 'sine';
    gainNode.gain.value = 0.3;
    oscillator.start();

    if (isCoaccion) {
      let toggle = true;
      const interval = setInterval(() => {
        gainNode.gain.value = toggle ? 0 : 0.3;
        toggle = !toggle;
      }, 200);
      setTimeout(() => { clearInterval(interval); oscillator.stop(); audioCtx.close(); }, 3000);
    } else {
      setTimeout(() => { oscillator.stop(); audioCtx.close(); }, 800);
    }
  } catch { /* Audio not available */ }
};

export const AlertaCoaccion = () => {
  const [visible, setVisible] = useState(true);
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    // M10: Reproducir alarma de coacción al montar
    if (!soundPlayedRef.current) {
      playAlertSound(true);
      soundPlayedRef.current = true;
    }

    const interval = setInterval(() => {
      setVisible(prev => !prev);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="alert-banner alert-banner--coaccion"
      style={{
        backgroundColor: visible ? '#8B0000' : '#CC0000',
        transition: 'background-color 0.3s ease'
      }}
    >
      🚨 ALERTA DE COACCIÓN ACTIVA — PROCEDER CON SIGILO ABSOLUTO 🚨
    </div>
  );
};
