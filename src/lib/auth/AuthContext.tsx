'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from 'firebase/auth';

// O SDK do Auth baixa depois da página montar, não junto com ela: o
// cabeçalho só precisa dele para mostrar a conta, e ninguém espera por isso.
let authSdk: Promise<typeof import('firebase/auth') & { auth: import('firebase/auth').Auth }> | null = null;
function loadAuth() {
  authSdk ??= Promise.all([import('firebase/auth'), import('@/lib/firebase/client')])
    .then(([sdk, { auth }]) => ({ ...sdk, auth }))
    .catch(e => { authSdk = null; throw e; });
  return authSdk;
}

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'buyer' | 'seller' | 'admin';
  isAnonymous: boolean;
  getIdToken: () => Promise<string>;
}

// Token do convidado guardado para, se ele entrar numa conta depois, o
// servidor passar o carrinho e os pedidos dele para essa conta (o usuário
// anônimo deixa de ser o atual no momento do login).
const GUEST_TOKEN_KEY = 'mikma-guest-token';

interface AuthContextValue {
  /** Conta de verdade. Convidado (login anônimo) NÃO entra aqui: para o
   *  resto do site (menu, conta, favoritos, telas de entrar) ele continua
   *  sendo visitante. */
  user: AuthUser | null;
  /** Quem compra: a conta, ou o convidado do "comprar sem cadastro". Só
   *  carrinho, checkout e página do pedido usam. */
  buyer: AuthUser | null;
  isGuest: boolean;
  /** Abre a sessão de convidado. Falha (ex.: login anônimo desligado no
   *  Firebase) devolve false e quem chamou mostra o login normal. */
  startGuest: () => Promise<boolean>;
  loading: boolean;
  logout: () => Promise<void>;
  userData: { name: string; email: string | null } | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_COOKIE_FLAG = 'mikma-staff-cookie';

function clearStaffCookie(force = false) {
  try {
    if (!force && !localStorage.getItem(STAFF_COOKIE_FLAG)) return;
    localStorage.removeItem(STAFF_COOKIE_FLAG);
  } catch { /* sem storage: apaga por garantia */ }
  // keepalive: o pedido sobrevive se a página trocar logo em seguida.
  fetch('/api/auth/session', { method: 'DELETE', keepalive: true }).catch(() => {});
}

async function mapUser(firebaseUser: User): Promise<AuthUser> {
  const tokenResult = await firebaseUser.getIdTokenResult(true);
  const role = (tokenResult.claims.role as AuthUser['role']) ?? 'buyer';

  // Seller/admin: manda o cookie que o middleware usa só pra pular a
  // manutenção quando a pessoa está logada como staff. Fire-and-forget -
  // se falhar, o pior caso é continuar mostrando a manutenção normalmente
  // (mesmo comportamento de antes de existir esse cookie), nada quebra.
  if (role === 'seller' || role === 'admin') {
    const idToken = await firebaseUser.getIdToken();
    fetch('/api/auth/session', {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}` },
    }).catch(() => {});
    try { localStorage.setItem(STAFF_COOKIE_FLAG, '1'); } catch { /* sem storage */ }
  } else {
    // Outra conta entrou no navegador onde havia staff: o cookie que pula a
    // manutenção (HttpOnly, 7 dias) sai junto. A marca evita uma chamada
    // por visita para quem nunca foi staff aqui.
    clearStaffCookie();
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    role,
    isAnonymous: firebaseUser.isAnonymous,
    getIdToken: () => firebaseUser.getIdToken(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    let unsubToken = () => {};
    loadAuth().then(({ auth, onAuthStateChanged, onIdTokenChanged }) => {
      if (!alive) return;
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const mapped = await mapUser(firebaseUser);
          if (!firebaseUser.isAnonymous) void mergeGuestInto(firebaseUser);
          setUser(mapped);
        } else {
          // Sessão encerrada por fora (expirou, outra aba saiu): cookie de staff junto.
          clearStaffCookie();
          setUser(null);
        }
        setLoading(false);
      });
      // Mantém o token do convidado em dia (o Firebase renova de hora em hora):
      // um token vencido não serviria para provar a posse no merge.
      unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
        if (!firebaseUser?.isAnonymous) return;
        try { localStorage.setItem(GUEST_TOKEN_KEY, await firebaseUser.getIdToken()); } catch { /* sem storage */ }
      });
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; unsub(); unsubToken(); };
  }, []);

  const logout = async () => {
    const { auth, signOut } = await loadAuth();
    // Convidado que sai (computador compartilhado): esquece a sessão dele.
    if (auth.currentUser?.isAnonymous) { try { localStorage.removeItem(GUEST_TOKEN_KEY); } catch { /* ok */ } }
    clearStaffCookie(true);
    await signOut(auth);
    setUser(null);
  };

  const startGuest = async () => {
    try {
      const { auth, signInAnonymously } = await loadAuth();
      if (auth.currentUser) return true;
      await signInAnonymously(auth);
      return true;
    } catch (err) {
      console.warn('[auth] convidado indisponível:', (err as { code?: string })?.code ?? err);
      return false;
    }
  };

  const account = user && !user.isAnonymous ? user : null;
  const userData = account ? { name: account.displayName ?? '', email: account.email } : null;

  return (
    <AuthContext.Provider value={{ user: account, buyer: user, isGuest: !!user?.isAnonymous, startGuest, loading, logout, userData }}>
      {children}
    </AuthContext.Provider>
  );
}

// Convidado entrou numa conta: o servidor passa o carrinho e os pedidos do
// convidado para ela (prova de posse: o token do convidado). Best-effort.
async function mergeGuestInto(account: User) {
  let guestToken: string | null = null;
  try { guestToken = localStorage.getItem(GUEST_TOKEN_KEY); } catch { return; }
  if (!guestToken) return;
  try {
    const res = await fetch('/api/auth/merge-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await account.getIdToken()}` },
      body: JSON.stringify({ guestToken }),
    });
    // Só esquece o convidado com resposta definitiva (feito, ou token que
    // não vale mais). Limite, erro do servidor ou rede: tenta no próximo login.
    if (res.ok || res.status === 400 || res.status === 401) localStorage.removeItem(GUEST_TOKEN_KEY);
  } catch { /* fica para o próximo login; nada quebra */ }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
