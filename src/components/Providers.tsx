'use client';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { NavigationProvider } from '@/lib/NavigationContext';
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialog';

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
