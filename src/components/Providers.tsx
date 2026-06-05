'use client';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { TopProgress } from '@/components/ui/TopProgress';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TopProgress />
      {children}
    </AuthProvider>
  );
}
