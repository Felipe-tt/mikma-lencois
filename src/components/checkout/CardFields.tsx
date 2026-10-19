'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Formulário de cartão da AbacatePay (abacatepay.js) dentro do checkout:
// número e CVV ficam num iframe deles, a gente só recebe o token ctok_.
// Docs: "abacatepay.js" e "Checkout transparente: passo a passo".

const SCRIPT_SRC = 'https://abacatepay.com/abacatepay.js';

interface AbacateCheckout {
  mount(target: string | HTMLElement): Promise<void>;
  tokenize(
    payer: { name: string; email: string; taxId: string; cellphone?: string },
    address?: { street: string; number: string; city: string; state: string; zipCode: string },
  ): Promise<{ token: string; expiresIn: number; brand?: string; lastFour?: string }>;
  destroy(): void;
}

declare global {
  interface Window {
    AbacatePay?: {
      create(options: {
        publicKey: string;
        amount: number;
        locale?: 'pt' | 'en' | 'es';
        icons?: boolean;
        theme?: { styles?: Record<string, Record<string, string>> };
        onCardChange?: (state: { canTokenize: boolean; isComplete: boolean; isValid: boolean }) => void;
      }): AbacateCheckout;
    };
  }
}

// Uma carga do script por página, compartilhada entre montagens.
let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.AbacatePay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => (window.AbacatePay ? resolve() : reject(new Error('PROVIDER_LOAD')));
      el.onerror = () => { scriptPromise = null; el.remove(); reject(new Error('PROVIDER_LOAD')); };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

/** Mensagem para o cliente a partir do erro do abacatepay.js (error.code). */
export function cardFieldsErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  const msg = String((err as { message?: string } | null)?.message ?? '');
  switch (code) {
    case 'CARD_INCOMPLETE': return 'Preencha todos os dados do cartão.';
    case 'CARD_INVALID': return 'Confira os dados do cartão.';
    case 'THREE_DS_FAILED': return 'O banco não confirmou a compra. Tente de novo ou use outro cartão.';
    case 'NETWORK': return 'Falha de conexão. Confira a internet e tente de novo.';
    case 'PAYER_INVALID': return 'Confira nome, e-mail e CPF na etapa de identificação.';
    case 'API':
      if (/cpf|cnpj|taxid/i.test(msg)) return 'CPF inválido. Confira na etapa de identificação.';
      if (/email/i.test(msg)) return 'E-mail inválido. Confira na etapa de identificação.';
      if (/too many/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
      return 'Não foi possível processar o pagamento com este cartão. Confira os dados ou tente outro cartão.';
    default: return 'Não foi possível validar o cartão. Tente de novo.';
  }
}

export interface CardFieldsHandle {
  tokenize: AbacateCheckout['tokenize'];
}

interface Props {
  publicKey: string;
  amountCents: number;
  /** Libera o botão de pagar quando o cartão está completo e válido. */
  onReadyChange: (canPay: boolean) => void;
  /** O formulário não carregou (bloqueador, chave inválida, conta sem cartão no site). */
  onUnavailable: () => void;
}

export const CardFields = forwardRef<CardFieldsHandle, Props>(function CardFields(
  { publicKey, amountCents, onReadyChange, onUnavailable },
  ref,
) {
  const area = useRef<HTMLDivElement>(null);
  const checkout = useRef<AbacateCheckout | null>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  // Callbacks em ref: trocar de função não deve remontar o formulário.
  const cbs = useRef({ onReadyChange, onUnavailable });
  useEffect(() => { cbs.current = { onReadyChange, onUnavailable }; });

  useImperativeHandle(ref, () => ({
    tokenize: (payer, address) => {
      if (!checkout.current) return Promise.reject(Object.assign(new Error('NOT_MOUNTED'), { code: 'NOT_MOUNTED' }));
      return checkout.current.tokenize(payer, address);
    },
  }), []);

  // O token sai para um valor exato: mudar as parcelas (juros) ou o frete
  // refaz o formulário com o novo total.
  useEffect(() => {
    let cancelled = false;
    let instance: AbacateCheckout | null = null;
    const host = area.current?.appendChild(document.createElement('div')); // um por montagem (StrictMode)
    setState('loading');
    cbs.current.onReadyChange(false);
    loadScript()
      .then(async () => {
        if (cancelled || !host || !window.AbacatePay) return;
        const textColor = getComputedStyle(document.body).color;
        instance = window.AbacatePay.create({
          publicKey,
          amount: amountCents,
          locale: 'pt',
          icons: true,
          theme: { styles: { input: { color: textColor, fontSize: '16px' } } },
          onCardChange: ({ canTokenize }) => { if (!cancelled) cbs.current.onReadyChange(canTokenize); },
        });
        checkout.current = instance;
        await instance.mount(host);
        if (!cancelled) setState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[cartão no site] formulário não carregou:', (err as { code?: string })?.code ?? err);
        cbs.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      try { instance?.destroy(); } catch { /* já removido */ }
      if (checkout.current === instance) checkout.current = null;
      host?.remove();
    };
  }, [publicKey, amountCents]);

  return (
    <div className="relative">
      {state === 'loading' && (
        <div aria-hidden className="flex flex-col gap-2.5">
          <div className="h-11 rounded-xl bg-mist/60 animate-pulse" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-11 rounded-xl bg-mist/60 animate-pulse" />
            <div className="h-11 rounded-xl bg-mist/60 animate-pulse" />
          </div>
        </div>
      )}
      <div ref={area} className={state === 'loading' ? 'h-0 overflow-hidden' : ''} aria-busy={state === 'loading'} />
      {state === 'loading' && <span className="sr-only">Carregando o formulário do cartão</span>}
    </div>
  );
});
