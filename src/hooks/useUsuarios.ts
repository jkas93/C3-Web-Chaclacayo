import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Usuario } from '../types/Usuario';

// B6 FIX: Use canonical type from types/Usuario.ts instead of duplicating
export type { Usuario } from '../types/Usuario';

export const useUsuarios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'usuarios'), orderBy('creadoEnMs', 'desc'), limit(200));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      } as Usuario));
      setUsuarios(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { usuarios, loading };
};
