import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Patrullero } from '../types/Patrullero';

export const usePatrulleros = () => {
  const [patrulleros, setPatrulleros] = useState<Patrullero[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'patrulleros'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Patrullero));
      setPatrulleros(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { patrulleros, loading };
};
