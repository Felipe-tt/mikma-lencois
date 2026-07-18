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
  const role = (tokenResult.claims.role as AuthUser['role']) ?? 'buyer';

  // Seller/admin: manda o cookie que o middleware usa só pra pular a
  // manutenção quando a pessoa está logada como staff. Fire-and-forget —
  // se falhar, o pior caso é continuar mostrando a manutenção normalmente
  // (mesmo comportamento de antes de existir esse cookie), nada quebra.
  if (role === 'seller' || role === 'admin') {
    const idToken = await firebaseUser.getIdToken();
    fetch('/api/auth/session', {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}` },
    }).catch(() => {});
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    role,
    getIdToken: () => firebaseUser.getIdToken(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(await mapUser(firebaseUser));
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
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
