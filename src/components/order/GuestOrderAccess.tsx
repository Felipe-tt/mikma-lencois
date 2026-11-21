'use client';
import { useState } from 'react';
import Link from 'next/link';
import { setReturnTo } from '@/lib/auth/returnTo';
import { requestGuestAccess } from '@/lib/auth/guestAccessClient';
import { userMessage } from '@/lib/userMessage';

/**
 * Pedido que não abre neste aparelho: sem sessão, ou com outra sessão. Quem
 * tem conta entra; quem comprou sem cadastro recebe no e-mail da compra o
 * link que abre o pedido aqui (antes só havia o login, e o convidado não tem
 * senha).
 */
export function GuestOrderAccess({ orderId, signedIn, error }: { orderId: string; signedIn: boolean; error?: string | null }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sendError, setSendError] = useState('');

  async function send() {
    setState('sending'); setSendError('');
    try {
      await requestGuestAccess(orderId);
      setState('sent');
    } catch (err) {
      setSendError(userMessage(err, 'Não deu para enviar o link. Tente de novo.'));
      setState('idle');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <div className="flex flex-col items-center py-16 sm:py-20 px-6 text-center rounded-3xl border border-dashed border-mist-d">
        <p className="font-display font-normal text-ink text-2xl mb-2">{signedIn ? 'Pedido não encontrado' : 'Abra o seu pedido'}</p>
        <p className="text-[14px] text-mid leading-relaxed max-w-[38ch] mb-6">
          {signedIn ? 'Este pedido não está na conta aberta neste aparelho.' : 'Entre na sua conta para ver o pedido.'}
          {' '}Comprou sem cadastro? Mandamos um link de acesso para o e-mail usado na compra.
        </p>
        {error && <p role="alert" className="mb-5 max-w-[40ch] text-[13px] text-red-600 leading-relaxed">{error}</p>}
        {state === 'sent' ? (
          <p role="status" className="max-w-[40ch] rounded-2xl bg-warm/70 px-5 py-3.5 text-[13.5px] text-ink leading-relaxed">
            Se o pedido foi feito sem cadastro, o link chegou no e-mail da compra. Ele vale por 24 horas.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center">
            {signedIn
              ? <Link href="/conta/pedidos" className="btn-primary text-[13px]">Meus pedidos</Link>
              : <Link href="/entrar" onClick={() => setReturnTo(`/pedidos/${orderId}`)} className="btn-primary text-[13px]">Entrar na conta</Link>}
            <button type="button" onClick={send} disabled={state === 'sending'} className="btn-outline text-[13px]">
              {state === 'sending' ? 'Enviando…' : 'Receber link por e-mail'}
            </button>
          </div>
        )}
        {sendError && <p role="alert" className="mt-3 text-[12.5px] text-red-600">{sendError}</p>}
      </div>
    </div>
  );
}
