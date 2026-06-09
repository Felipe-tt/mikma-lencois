'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
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
  loginWithGoogleToken: (idToken: string) => Promise<void>;
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
  };

  const loginWithGoogleToken = async (idToken: string) => {
    // ⚠️  NÃO ALTERE ESSE FLUXO DE AUTH — está funcionando e é frágil.
    //
    // CONTEXTO: o Firebase Admin SDK (createCustomToken) exige a permissão
    // iam.serviceAccounts.signBlob na service account do Cloud Run.
    // Essa permissão é difícil de garantir no Firebase Hosting (webframeworks),
    // então o fluxo foi reescrito pra NÃO usar createCustomToken.
    //
    // COMO FUNCIONA AGORA:
    //   1. O Google ID token (JWT) é enviado pro servidor em /api/auth/google-verify
    //   2. O servidor valida o token via google-auth-library (sem signBlob)
    //   3. O servidor cria/atualiza o usuário no Firestore se necessário
    //   4. O CLIENT usa signInWithCredential(GoogleAuthProvider.credential(idToken))
    //      diretamente — sem passar pelo Firebase Admin pra gerar custom token
    //
    // ⚠️  NÃO TROCAR signInWithCredential por signInWithCustomToken.
    // ⚠️  NÃO ADICIONAR createCustomToken no /api/auth/google-verify/route.ts.
    const res = await fetch('/api/auth/google-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Erro ao autenticar com Google');
    }
    // O servidor validou — agora autentica no Firebase Client com o Google credential.
    // Isso não passa pelo Admin SDK e não precisa de signBlob.
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
  };

  const userData = user ? { name: user.displayName ?? '', email: user.email } : null;

  return (
    <AuthContext.Provider value={{ user, loading, logout, loginWithGoogleToken, userData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
