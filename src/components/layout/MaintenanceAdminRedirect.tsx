'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * A tela de manutenção normalmente é a única coisa que um visitante vê
 * quando o site está em manutenção — inclusive o próprio admin, se o
 * cookie de sessão de staff (verificado no proxy.ts) ainda não existe
 * nesse navegador/aba (ex.: sessão do Firebase ainda válida, mas o
 * cookie expirou ou nunca foi emitido nessa aba).
 *
 * `/painel` já é uma rota isenta do bloqueio de manutenção (ver
 * `isExempt` em proxy.ts), então o admin sempre conseguia entrar — só
 * que precisava trocar a URL manualmente. Esse componente resolve isso:
 * assim que a sessão do Firebase carrega no client, se for
 * seller/admin, redireciona sozinho pro painel.
 */
export function MaintenanceAdminRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user && (user.role === 'seller' || user.role === 'admin')) {
      router.replace('/painel');
    }
  }, [user, loading, router]);

  return null;
}
