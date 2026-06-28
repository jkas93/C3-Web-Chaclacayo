import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, database } from '../services/firebase';
import type { Patrullero } from '../types/Patrullero';
import type { RolOperador } from '../types/enums';

/**
 * Hook para obtener patrulleros (unidades móviles) en tiempo real.
 * - ADMIN: ve todas las unidades (sin filtro de tipoServicio).
 * - POLICIA / SALUD / BOMBEROS: ve solo las unidades de su servicio.
 */
export const usePatrulleros = (rol: RolOperador | null) => {
  const [patrulleros, setPatrulleros] = useState<Patrullero[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rol) return;

    let q;
    if (rol === 'ADMIN' || rol === ('PUBLIC' as RolOperador)) {
      q = query(collection(db, 'patrulleros'));
    } else {
      q = query(
        collection(db, 'patrulleros'),
        where('tipoServicio', '==', rol)
      );
    }

    // 1. Escuchar Firestore para datos estáticos
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Patrullero));
      setPatrulleros(data);
      setLoading(false);
    });

    // 2. Escuchar RTDB para tracking en vivo
    const trackingRef = ref(database, 'tracking/patrulleros');
    const unsubscribeRTDB = onValue(trackingRef, (snapshot) => {
      const trackingData = snapshot.val();
      if (trackingData) {
        setPatrulleros(prevPatrulleros => 
          prevPatrulleros.map(p => {
            const update = trackingData[p.uid];
            if (update) {
              return { ...p, latitud: update.latitud, longitud: update.longitud };
            }
            return p;
          })
        );
      }
    });

    return () => {
      unsubscribeFirestore();
      unsubscribeRTDB();
    };
  }, [rol]);

  return { patrulleros, loading };
};
