'use client';
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type Mode = 'login' | 'signup' | 'forgot';

interface AuthModalContextValue {
  isOpen: boolean;
  mode: Mode;
  open: (mode?: Mode) => void;
  close: () => void;
  setMode: (mode: Mode) => void;
  /** Se já logado, roda `action` na hora. Senão, abre o modal e roda
   *  `action` automaticamente assim que o login/cadastro for concluído
   * , sem sair da página onde a pessoa estava. */
  requireAuth: (action: () => void, reason?: string, opts?: { allowGuest?: boolean }) => void;
  /** Por que o modal abriu (ex.: "Entre pra adicionar ao carrinho"). */
  reason: string | null;
  /** O modal aberto aceita "Continuar sem cadastro" (carrinho e compra). */
  allowGuest: boolean;
  /** Entra como convidado e segue a ação pendente. false = indisponível. */
  continueAsGuest: () => Promise<boolean>;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { user, buyer, startGuest } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [reason, setReason] = useState<string | null>(null);
  const [allowGuest, setAllowGuest] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const open = useCallback((m: Mode = 'login') => { setMode(m); setReason(null); setAllowGuest(false); setIsOpen(true); }, []);
  const close = useCallback(() => { setIsOpen(false); pendingAction.current = null; }, []);

  const requireAuth = useCallback((action: () => void, why?: string, opts?: { allowGuest?: boolean }) => {
    if (user || (opts?.allowGuest && buyer)) { action(); return; }
    pendingAction.current = action;
    setMode('login');
    setReason(why ?? null);
    setAllowGuest(!!opts?.allowGuest);
    setIsOpen(true);
  }, [user, buyer]);

  const continueAsGuest = useCallback(() => startGuest(), [startGuest]);

  // Assim que o usuário loga (com o modal aberto e uma ação pendente),
  // executa a ação e fecha o modal, a pessoa nunca sai de onde estava.
  useEffect(() => {
    if ((user || (allowGuest && buyer)) && isOpen && pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      setIsOpen(false);
      action();
    }
  }, [user, buyer, allowGuest, isOpen]);

  return (
    <AuthModalContext.Provider value={{ isOpen, mode, open, close, setMode, requireAuth, reason, allowGuest, continueAsGuest }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}
