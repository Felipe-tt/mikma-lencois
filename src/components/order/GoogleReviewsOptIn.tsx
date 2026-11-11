'use client';

import { useEffect } from 'react';
import { addBusinessDays } from '@/lib/deliveryDate';

/** ID da loja no Merchant Center (Google Avaliações do Consumidor). */
export const MERCHANT_ID = 5900898574;

declare global {
  interface Window {
    renderOptIn?: () => void;
    gapi?: { load: (lib: string, cb: () => void) => void; surveyoptin?: { render: (opts: Record<string, unknown>) => void } };
  }
}

/**
 * Convite do Google Avaliações do Consumidor, logo depois do pagamento: o
 * Google pergunta ao cliente se ele aceita responder uma pesquisa depois da
 * entrega, e as notas viram as estrelas da loja no Google. Grátis; o
 * programa precisa estar ativo no Merchant Center. Uma vez por pedido.
 */
export function GoogleReviewsOptIn({ orderId, email, estimatedDays }: { orderId: string; email?: string | null; estimatedDays?: number }) {
  useEffect(() => {
    if (!email) return;
    const key = `gcr-optin:${orderId}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* sem storage: mostra mesmo assim */ }
    // Prazo do frete mais 2 dias úteis de folga para separar e postar.
    const entrega = addBusinessDays(new Date(), Math.max(1, Math.min(estimatedDays ?? 10, 30)) + 2);
    window.renderOptIn = () => {
      window.gapi?.load('surveyoptin', () => {
        window.gapi?.surveyoptin?.render({
          merchant_id: MERCHANT_ID,
          order_id: orderId,
          email,
          delivery_country: 'BR',
          estimated_delivery_date: entrega.toISOString().slice(0, 10),
          opt_in_style: 'BOTTOM_LEFT_DIALOG',
        });
      });
    };
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
    s.async = true;
    document.head.appendChild(s);
  }, [orderId, email, estimatedDays]);
  return null;
}
