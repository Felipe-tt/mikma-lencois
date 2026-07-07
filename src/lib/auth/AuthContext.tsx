'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'buyer' | 'seller' | 'admin';
  getIdToken: () => Promise<string>;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  userData: { name: string; email: string | null } | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function mapUser(firebaseUser: User): Promise<AuthUser> {
  const tokenResult = await firebaseUser.getIdTokenResult(true);
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    role: (tokenResult.claims.role as AuthUser['role']) ?? 'buyer',
    getIdToken: () => firebaseUser.getIdToken(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const mapped = await mapUser(firebaseUser);
        setUser(mapped);

        // Admin ganha um cookie de bypass da tela de manutenção — sem
        // isso, o próprio dono da loja fica bloqueado junto com o
        // público quando ativa a manutenção pra fazer ajustes.
        // Best-effort: se falhar, o admin só continua vendo a tela de
        // manutenção normalmente, sem quebrar o login.
        if (mapped.role === 'admin') {
          const idToken = await mapped.getIdToken();
          fetch('/api/auth/bypass-session', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
          }).catch(() => {});
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = async () => {
    await fetch('/api/auth/bypass-session', { method: 'DELETE' }).catch(() => {});
    await signOut(auth);
    setUser(null);
  };

  const userData = user ? { name: user.displayName ?? '', email: user.email } : null;

  return (
    <AuthContext.Provider value={{ user, loading, logout, userData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
