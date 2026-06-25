import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import type { RolOperador } from '../types/enums';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOperator: boolean;
  rol: RolOperador | null;           // Rol del operador actual
  isAdmin: boolean;                  // Atajo: true si rol === 'ADMIN'
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isOperator: false,
  rol: null,
  isAdmin: false,
  login: async () => {},
  logout: async () => {}
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOperator, setIsOperator] = useState(false);
  const [rol, setRol] = useState<RolOperador | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const operatorDoc = await getDoc(doc(db, 'operadores_c3', firebaseUser.uid));
          if (operatorDoc.exists()) {
            const data = operatorDoc.data();
            setIsOperator(true);
            setRol((data.rol as RolOperador) ?? null);
          } else {
            setIsOperator(false);
            setRol(null);
          }
        } catch {
          setIsOperator(false);
          setRol(null);
        }
      } else {
        setIsOperator(false);
        setRol(null);
      }

      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
    setIsOperator(false);
    setRol(null);
  };

  const isAdmin = rol === 'ADMIN';

  return (
    <AuthContext.Provider value={{ user, loading, isOperator, rol, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
