import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { RolOperador } from '../types/enums';
import type { AlertaOperativa } from '../types/AlertaOperativa';

export const useAlertasOperativas = (rol: RolOperador | null) => {
  const [alertas, setAlertas] = useState<AlertaOperativa[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rol) {
      return;
    }

    const base = collection(db, 'alertas_operativas');
    let alertQuery: Query = query(base, where('activa', '==', true));
    if (rol !== 'ADMIN') {
      alertQuery = query(base, where('activa', '==', true), where('tipo', '==', rol));
    }

    return onSnapshot(alertQuery, (snapshot) => {
      const next = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      } as AlertaOperativa));
      next.sort((a, b) => {
        const nivel = { CRITICA: 0, ALTA: 1, MEDIA: 2 };
        return nivel[a.severidad] - nivel[b.severidad]
          || a.detectadaEnMs - b.detectadaEnMs;
      });
      setAlertas(next);
      setError(null);
    }, () => {
      setAlertas([]);
      setError('No se pudieron sincronizar las alertas SLA.');
    });
  }, [rol]);

  return { alertas, error };
};
