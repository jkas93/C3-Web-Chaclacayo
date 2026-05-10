import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOperator: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isOperator: false,
  login: async () => {},
  logout: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // M7: Verificar rol de operador C3
        if (import.meta.env.VITE_DEV_MODE === 'true') {
          // En modo desarrollo, todos los usuarios autenticados son operadores
          setIsOperator(true);
        } else {
          try {
            const operatorDoc = await getDoc(doc(db, 'operadores_c3', firebaseUser.uid));
            setIsOperator(operatorDoc.exists());
          } catch {
            setIsOperator(false);
          }
        }
      } else {
        setIsOperator(false);
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
  };

  return (
    <AuthContext.Provider value={{ user, loading, isOperator, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
