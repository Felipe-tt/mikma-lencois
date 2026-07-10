'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

interface Props {
  qrCode: string;
  copyPaste: string;
  totalCents: number;
  orderId: string;
  expiresAt?: string;
  onClose: () => void;
}

function useCountdown(expiresAt?: string) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    if (Number.isNaN(target)) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return secondsLeft;
}

type PaymentStatus = 'pending' | 'confirmed' | 'expired' | 'failed';

function usePaymentStatus(orderId: string): PaymentStatus {
  const [status, setStatus] = useState<PaymentStatus>('pending');
  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(db, 'orders', orderId), snap => {
      if (!snap.exists()) return;
      const s = snap.data().status as string;
      if (s === 'paid' || s === 'preparing' || s === 'shipped' || s === 'delivered') {
        setStatus('confirmed');
      } else if (s === 'cancelled') {
        setStatus('failed');
      }
    });
    return unsub;
  }, [orderId]);
  return status;
}

export function PIXModal({ qrCode, copyPaste, totalCents, orderId, expiresAt, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const secondsLeft = useCountdown(expiresAt);
  const paymentStatus = usePaymentStatus(orderId);
  const expired = secondsLeft === 0;
  const confirmed = paymentStatus === 'confirmed';
  const failed = paymentStatus === 'failed';

  const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCents / 100);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  function copy() {
    navigator.clipboard.writeText(copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const timeLabel = (() => {
    if (secondsLeft === null) return null;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  const urgency = secondsLeft !== null && secondsLeft < 120 && secondsLeft > 0;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-ink/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pix-modal-title"
    >
      <div className="w-full sm:max-w-md bg-paper shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden sm:rounded-sm">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-5 border-b border-mist shrink-0">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-1">
              Pedido #{orderId.slice(-8).toUpperCase()}
            </p>
            <h2 id="pix-modal-title" className="font-display font-normal text-ink text-2xl leading-tight">
              {confirmed ? 'Pagamento confirmado' : 'Pague com PIX'}
            </h2>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-faint uppercase tracking-wide mb-0.5">Total</p>
            <p className={`font-display text-xl leading-none ${confirmed ? 'text-emerald-600' : 'text-ink'}`}>{total}</p>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1">
          <div className="px-6 py-6 flex flex-col items-center gap-5">

            {/* ── CONFIRMADO ── */}
            {confirmed && (
              <div className="w-full flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-emerald-600">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ink mb-1">Pagamento recebido!</h3>
                  <p className="text-sm text-mid max-w-[28ch] leading-relaxed">
                    Seu pedido foi confirmado e já está sendo preparado.
                  </p>
                </div>
                <div className="w-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-medium text-center">
                  Acompanhe em <span className="underline">Meus pedidos</span>
                </div>
              </div>
            )}

            {/* ── EXPIRADO ── */}
            {!confirmed && (expired || failed) && (
              <div className="w-full flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-16 h-16 rounded-full bg-warm border border-mist flex items-center justify-center">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-clay">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M12 7v5l3 3"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink mb-1">
                    {failed ? 'Pedido cancelado' : 'Código PIX expirado'}
                  </h3>
                  <p className="text-sm text-faint max-w-[30ch] leading-relaxed">
                    {failed
                      ? 'O pagamento não foi identificado e o pedido foi cancelado.'
                      : 'O tempo para pagamento esgotou. Faça um novo pedido.'}
                  </p>
                </div>
              </div>
            )}

            {/* ── PENDENTE ── */}
            {!confirmed && !expired && !failed && (
              <>
                {/* Status + Countdown */}
                <div className={`w-full flex items-center justify-between px-4 py-3 rounded-sm border ${urgency ? 'border-amber-200 bg-amber-50' : 'border-mist bg-warm/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-clay opacity-50 animate-ping"/>
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-clay"/>
                    </span>
                    <span className="text-xs font-semibold text-mid">Aguardando pagamento</span>
                  </div>
                  {timeLabel && (
                    <span className={`text-xs font-mono font-bold tabular-nums ${urgency ? 'text-amber-700' : 'text-faint'}`}>
                      {timeLabel}
                    </span>
                  )}
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <div className="border-2 border-mist p-3 bg-white dark:bg-warm">
                    {qrCode ? (
                      <img src={qrCode} alt="QR Code PIX" className="w-44 h-44 block" width={176} height={176}/>
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center bg-warm">
                        <span className="text-faint text-xs text-center px-4">QR Code indisponível</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-faint text-center max-w-[26ch] leading-relaxed">
                    Abra o app do seu banco, escolha Pix e escaneie o código
                  </p>
                </div>

                {/* Divider */}
                <div className="w-full flex items-center gap-3">
                  <div className="flex-1 h-px bg-mist"/>
                  <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-faint">ou copie o código</span>
                  <div className="flex-1 h-px bg-mist"/>
                </div>

                {/* Copia e cola */}
                <div className="w-full flex flex-col gap-2">
                  <div className="flex items-center border border-mist bg-warm/40 overflow-hidden">
                    <input
                      readOnly
                      value={copyPaste}
                      onFocus={e => e.currentTarget.select()}
                      className="flex-1 px-3 py-2.5 text-[11px] font-mono text-ink bg-transparent truncate focus:outline-none"
                      aria-label="Código PIX copia e cola"
                    />
                    <button
                      onClick={copy}
                      className={`shrink-0 px-4 py-2.5 text-xs font-bold tracking-[0.08em] uppercase transition-colors ${
                        copied ? 'bg-emerald-600 text-paper' : 'bg-ink text-paper hover:bg-clay'
                      }`}
                    >
                      {copied ? (
                        <span className="flex items-center gap-1.5">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Copiado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
                          Copiar
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Aviso */}
                <div className="w-full border-l-2 border-clay/40 pl-3 py-1">
                  <p className="text-xs text-mid leading-relaxed">
                    Após pagar, a confirmação é <strong className="text-ink">automática e imediata</strong>. Não é necessário enviar comprovante.
                  </p>
                </div>

                {/* Steps de instrução */}
                <div className="w-full flex flex-col gap-2.5">
                  {[
                    { n: '1', text: 'Abra o app do seu banco' },
                    { n: '2', text: 'Escolha a opção PIX' },
                    { n: '3', text: 'Escaneie o QR Code ou cole o código acima' },
                    { n: '4', text: 'Confirme o valor e finalize' },
                  ].map(({ n, text }) => (
                    <div key={n} className="flex items-center gap-3 text-xs text-mid">
                      <span className="w-5 h-5 rounded-full bg-warm border border-mist flex items-center justify-center text-[10px] font-bold text-faint shrink-0">{n}</span>
                      {text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-mist px-6 py-4 shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-sm font-medium text-faint hover:text-ink transition-colors"
          >
            {confirmed ? 'Ver meus pedidos' : 'Fechar'}
          </button>
          {!confirmed && !expired && !failed && (
            <p className="text-xs text-faint flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Conexão segura
            </p>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
