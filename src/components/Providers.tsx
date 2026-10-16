'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { AuthModalProvider, useAuthModal } from '@/lib/auth/AuthModalContext';
import { NavigationProvider } from '@/lib/NavigationContext';
import { ChunkErrorReload } from '@/components/ChunkErrorReload';

// ssr: false garante que esses hosts nunca rodem no servidor.
// createPortal / listeners de DOM dependem de document, não existe no
// SSR, causaria hydration mismatch (React error #418) se carregado normalmente.
const ConfirmDialogHost = dynamic(
  () => import('@/components/ui/ConfirmDialog').then(m => m.ConfirmDialogHost),
  { ssr: false }
);
const AuthModal = dynamic(
  () => import('@/components/auth/AuthModal').then(m => m.AuthModal),
  { ssr: false }
);

// O chunk do modal de login (validação de cadastro, libphonenumber, corretor
// de e-mail) era baixado em toda página, mesmo sem ninguém abrir o modal.
// Agora só carrega na primeira abertura e fica montado depois disso (pra
// preservar o estado e o poll do desafio por e-mail).
function AuthModalOnDemand() {
  const { isOpen } = useAuthModal();
  const [everOpened, setEverOpened] = useState(false);
  if (isOpen && !everOpened) setEverOpened(true);
  return everOpened ? <AuthModal /> : null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthModalProvider>
        <NavigationProvider>
          {children}
          <ChunkErrorReload />
          <ConfirmDialogHost />
          <AuthModalOnDemand />
        </NavigationProvider>
      </AuthModalProvider>
    </AuthProvider>
  );
}
