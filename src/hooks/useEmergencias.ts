import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Emergencia } from '../types/Emergencia';

export const useEmergencias = () => {
  const [emergencias, setEmergencias] = useState<Emergencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'emergencias'), orderBy('timestampMs', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Emergencia));
      setEmergencias(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { emergencias, loading };
};
