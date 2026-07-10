'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { AuthModalProvider } from '@/lib/auth/AuthModalContext';
import { NavigationProvider } from '@/lib/NavigationContext';

// ssr: false garante que esses hosts nunca rodem no servidor.
// createPortal / listeners de DOM dependem de document — não existe no
// SSR — causaria hydration mismatch (React error #418) se carregado normalmente.
const ConfirmDialogHost = dynamic(
  () => import('@/components/ui/ConfirmDialog').then(m => m.ConfirmDialogHost),
  { ssr: false }
);
const AuthModal = dynamic(
  () => import('@/components/auth/AuthModal').then(m => m.AuthModal),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthModalProvider>
        <NavigationProvider>
          {children}
          <ConfirmDialogHost />
          <AuthModal />
        </NavigationProvider>
      </AuthModalProvider>
    </AuthProvider>
  );
}
