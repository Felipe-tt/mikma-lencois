'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { NavigationProvider } from '@/lib/NavigationContext';

// ssr: false garante que o ConfirmDialogHost nunca rode no servidor.
// createPortal depende de document.body — não existe no SSR — causaria
// hydration mismatch (React error #418) se carregado normalmente.
const ConfirmDialogHost = dynamic(
  () => import('@/components/ui/ConfirmDialog').then(m => m.ConfirmDialogHost),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavigationProvider>
        {children}
        <ConfirmDialogHost />
      </NavigationProvider>
    </AuthProvider>
  );
}
