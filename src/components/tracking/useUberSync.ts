'use client';
import { useEffect, useRef } from 'react';

const INTERVAL_MS = 10_000;

/**
 * Enquanto a corrida da Uber está em andamento, pede ao servidor pra
 * consultar a Uber a cada 10s (só com a aba visível). O pedido chega
 * atualizado pelo listener do Firestore; isso cobre webhook perdido ou
 * atrasado, que deixava a página em "Procurando entregador…" com o
 * motoboy já a caminho.
 */
export function useUberSync(
  orderId: string | undefined,
  active: boolean,
  user: { getIdToken(): Promise<string> } | null | undefined,
) {
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; });
  const hasUser = !!user;

  useEffect(() => {
    if (!orderId || !active || !hasUser) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopped || running) return;
      running = true;
      clearTimeout(timer);
      if (document.visibilityState === 'visible' && userRef.current) {
        try {
          const token = await userRef.current.getIdToken();
          await fetch(`/api/orders/${orderId}/uber-sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        } catch { /* tenta de novo na próxima volta */ }
      }
      running = false;
      if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [orderId, active, hasUser]);
}
