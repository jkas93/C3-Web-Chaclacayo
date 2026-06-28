import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, database } from '../services/firebase';
import type { Emergencia } from '../types/Emergencia';
import type { RolOperador } from '../types/enums';

/**
 * Hook para obtener emergencias en tiempo real.
 * - ADMIN: ve todas las emergencias (sin filtro de tipo).
 * - POLICIA / SALUD / BOMBEROS: ve solo las emergencias de su tipo de servicio.
 */
export const useEmergencias = (rol: RolOperador | null) => {
  const [emergencias, setEmergencias] = useState<Emergencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rol) return;

    let q;
    if (rol === 'ADMIN') {
      // ADMIN: sin filtro de tipo
      q = query(
        collection(db, 'emergencias'),
        orderBy('timestampMs', 'desc'),
        limit(100)
      );
    } else {
      // Operadores de servicio: filtran por su tipo
      q = query(
        collection(db, 'emergencias'),
        where('tipo', '==', rol),
        orderBy('timestampMs', 'desc'),
        limit(100)
      );
    }

    // 1. Escuchar Firestore para datos estáticos y nuevo historial
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Emergencia));
      setEmergencias(data);
      setLoading(false);
    });

    // 2. Escuchar RTDB para tracking en vivo
    const trackingRef = ref(database, 'tracking/emergencias');
    const unsubscribeRTDB = onValue(trackingRef, (snapshot) => {
      const trackingData = snapshot.val();
      if (trackingData) {
        setEmergencias(prev => 
          prev.map(e => {
            const update = trackingData[e.id];
            if (update) {
              return { ...e, latitudActual: update.latitud, longitudActual: update.longitud };
            }
            return e;
          })
        );
      }
    });

    return () => {
      unsubscribeFirestore();
      unsubscribeRTDB();
    };
  }, [rol]);

  return { emergencias, loading };
};
