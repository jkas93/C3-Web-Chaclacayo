import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../services/firebase';
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Emergencia));
      setEmergencias(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [rol]);

  return { emergencias, loading };
};
