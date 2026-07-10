'use client';
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type Mode = 'login' | 'signup';

interface AuthModalContextValue {
  isOpen: boolean;
  mode: Mode;
  open: (mode?: Mode) => void;
  close: () => void;
  setMode: (mode: Mode) => void;
  /** Se já logado, roda `action` na hora. Senão, abre o modal e roda
   *  `action` automaticamente assim que o login/cadastro for concluído
   *  — sem sair da página onde a pessoa estava. */
  requireAuth: (action: () => void) => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const pendingAction = useRef<(() => void) | null>(null);

  const open = useCallback((m: Mode = 'login') => { setMode(m); setIsOpen(true); }, []);
  const close = useCallback(() => { setIsOpen(false); pendingAction.current = null; }, []);

  const requireAuth = useCallback((action: () => void) => {
    if (user) { action(); return; }
    pendingAction.current = action;
    open('login');
  }, [user, open]);

  // Assim que o usuário loga (com o modal aberto e uma ação pendente),
  // executa a ação e fecha o modal — a pessoa nunca sai de onde estava.
  useEffect(() => {
    if (user && isOpen && pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      setIsOpen(false);
      action();
    }
  }, [user, isOpen]);

  return (
    <AuthModalContext.Provider value={{ isOpen, mode, open, close, setMode, requireAuth }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}
