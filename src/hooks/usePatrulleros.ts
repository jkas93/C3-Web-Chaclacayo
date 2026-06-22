import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
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
    if (rol === 'ADMIN') {
      q = query(collection(db, 'patrulleros'));
    } else {
      q = query(
        collection(db, 'patrulleros'),
        where('tipoServicio', '==', rol)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Patrullero));
      setPatrulleros(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [rol]);

  return { patrulleros, loading };
};
