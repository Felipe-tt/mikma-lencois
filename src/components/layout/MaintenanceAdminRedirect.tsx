'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Admin/seller logado que caiu em /manutencao (cookie de staff vencido ou
 * ainda não emitido neste navegador, ex.: primeira visita do dia) volta pra
 * página que pediu, não pro painel: renova o cookie e só então navega, pra
 * o proxy já deixar passar. Se a renovação falhar, vai pro painel, que é
 * isento da manutenção.
 */
export function MaintenanceAdminRedirect() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || (user.role !== 'seller' && user.role !== 'admin')) return;
    let cancelled = false;
    (async () => {
      const de = new URLSearchParams(window.location.search).get('de');
      let target = de && de.startsWith('/') && !de.startsWith('//') ? de : '/';
      // Trava de segurança: se já voltou daqui há menos de 30s, algo mandou de
      // novo pra manutenção; vai pro painel em vez de ficar num vaivém.
      try {
        const last = Number(sessionStorage.getItem('mnt-admin-back') ?? 0);
        if (Date.now() - last < 30000) target = '/painel';
        sessionStorage.setItem('mnt-admin-back', String(Date.now()));
      } catch { /* sem sessionStorage: segue */ }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/auth/session', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!cancelled) window.location.replace(res.ok && data.ok ? target : '/painel');
      } catch {
        if (!cancelled) window.location.replace('/painel');
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading]);

  return null;
}
