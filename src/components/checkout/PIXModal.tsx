'use client';
import { userMessage } from '@/lib/userMessage';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth } from '@/lib/firebase/client';
import { db } from '@/lib/firebase/db';
import { trackPurchase } from '@/lib/analytics';
import { copyText } from '@/lib/clipboard';
import { requestNewPix } from '@/lib/orders/requestNewPix';
import { useOverlay, OVERLAY_EXIT_MS } from '@/lib/hooks/useOverlay';

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

function usePaymentStatus(orderId: string, totalCents: number): PaymentStatus {
  const [status, setStatus] = useState<PaymentStatus>('pending');
  // O pedido muda de status várias vezes depois de pago (preparando,
  // enviado...); a compra só pode ser registrada no analytics uma vez.
  const tracked = useRef(false);
  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(db, 'orders', orderId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const s = data.status as string;
      if (s === 'paid' || s === 'preparing' || s === 'shipped' || s === 'delivered') {
        setStatus('confirmed');
        if (tracked.current) return;
        tracked.current = true;
        const items = (data.items ?? []) as Array<{ sku: string; productId: string; productName: string; unitPrice: number; quantity: number }>;
        trackPurchase({
          orderId,
          totalCents,
          shippingCents: data.shippingCents,
          items: items.map(i => ({ sku: i.sku, productId: i.productId, productName: i.productName, unitPriceCents: i.unitPrice, quantity: i.quantity })),
        });
      } else if (s === 'cancelled') {
        setStatus('failed');
      } else if (s === 'payment_expired') {
        setStatus('expired');
      } else if (s === 'pending_payment') {
        setStatus('pending');
      }
    });
    return unsub;
  }, [orderId, totalCents]);
  return status;
}

export function PIXModal({ qrCode: initialQr, copyPaste: initialCopy, totalCents: initialTotal, orderId, expiresAt: initialExpires, onClose }: Props) {
  const [pix, setPix] = useState({ qrCode: initialQr, copyPaste: initialCopy, expiresAt: initialExpires, totalCents: initialTotal });
  const { qrCode, copyPaste, expiresAt, totalCents } = pix;
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  // Quem renderiza o modal o desmonta ao chamar onClose; espera a saída
  // terminar antes de avisar, senão ele some de uma vez.
  const requestClose = () => {
    if (!open) return;
    setOpen(false);
    setTimeout(onClose, OVERLAY_EXIT_MS);
  };
  const { mounted, state } = useOverlay({ open, onClose: requestClose, panelRef });
  const secondsLeft = useCountdown(expiresAt);
  const paymentStatus = usePaymentStatus(orderId, totalCents);
  const expired = secondsLeft === 0 || paymentStatus === 'expired';
  const confirmed = paymentStatus === 'confirmed';
  const failed = paymentStatus === 'failed';

  const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCents / 100);

  async function regenerate() {
    setRegenerating(true);
    setRegenError('');
    try {
      const next = await requestNewPix(orderId);
      setPix({ qrCode: next.qrCode, copyPaste: next.copyPaste, expiresAt: next.expiresAt, totalCents: next.totalCents ?? totalCents });
    } catch (err) {
      setRegenError(userMessage(err, 'Não foi possível gerar o PIX. Tente novamente.'));
    } finally {
      setRegenerating(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="overlay-backdrop fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-state={state}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pix-modal-title"
        data-variant="responsive"
        className="overlay-panel w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-paper shadow-2xl flex flex-col max-h-[95dvh] sm:max-h-[90vh] overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Alça do bottom sheet no celular */}
        <span aria-hidden="true" className="sm:hidden mx-auto mt-2.5 mb-0.5 block h-1 w-10 rounded-full bg-mist-d shrink-0" />

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
          {/* role=status: leitor de tela anuncia quando o pagamento confirma ou expira */}
          <div role="status" aria-live="polite" className="px-6 py-6 flex flex-col items-center gap-5">

            {/* ── CONFIRMADO ── */}
            {confirmed && (
              <div className="w-full flex flex-col items-center gap-4 py-4 text-center">
                <PaidCheck />
                <div>
                  <h3 className="text-lg font-semibold text-ink mb-1">Pagamento recebido!</h3>
                  <p className="text-sm text-mid max-w-[28ch] leading-relaxed">
                    Seu pedido foi confirmado e já está sendo preparado.
                  </p>
                </div>
                <Link href={`/pedidos/${orderId}`} className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-medium text-center hover:bg-emerald-100 transition-colors">
                  Acompanhar o pedido
                </Link>
              </div>
            )}

            {/* ── EXPIRADO ── */}
            {!confirmed && (expired || failed) && (
              <div className="w-full flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-16 h-16 rounded-full bg-warm border border-mist flex items-center justify-center">
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-clay">
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
                      : 'O tempo para pagamento esgotou. Gere um novo código para pagar o mesmo pedido.'}
                  </p>
                </div>
                {!failed && (
                  <button
                    type="button"
                    onClick={regenerate}
                    disabled={regenerating}
                    className="btn-clay text-xs px-6 py-3 font-semibold tracking-wide"
                  >
                    {regenerating ? <><span className="spinner w-3.5 h-3.5" /> Gerando…</> : 'Gerar novo PIX'}
                  </button>
                )}
                {regenError && <p role="alert" className="text-xs text-red-600">{regenError}</p>}
              </div>
            )}

            {/* ── PENDENTE ── */}
            {!confirmed && !expired && !failed && (
              <PixPayBlock qrCode={qrCode} copyPaste={copyPaste} expiresAt={expiresAt} orderId={orderId} />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-mist px-6 py-4 shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={requestClose}
            className="text-sm font-medium text-mid hover:text-ink transition-colors"
          >
            {confirmed ? 'Ver pedido' : 'Pagar depois'}
          </button>
          {!confirmed && !expired && !failed && (
            <p className="text-xs text-faint flex items-center gap-1.5">
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Conexão segura
            </p>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}


/**
 * Bloco de pagamento PIX (tempo, copia e cola, QR e passos). Usado no modal
 * do checkout e na página do pedido, que antes tinha uma versão sem tempo
 * nem instruções. No celular o "Copiar código" vem primeiro: quem paga no
 * próprio telefone não tem como escanear o QR da tela.
 */
/**
 * Pergunta à AbacatePay (via /api/orders/[id]/check-payment) se o PIX já foi
 * pago, enquanto o código está na tela: se o webhook atrasar, a confirmação
 * aparece mesmo assim. A tela muda sozinha pelo onSnapshot do pedido.
 */
function usePixStatusPolling(orderId: string | undefined) {
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function check(manual: boolean) {
    if (!orderId || !auth.currentUser) return;
    if (manual) { setChecking(true); setHint(null); }
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/orders/${orderId}/check-payment`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({})) as { status?: string };
      if (manual && data.status !== 'paid') {
        setHint(data.status === 'expired'
          ? 'Este PIX venceu. Gere um novo código para pagar.'
          : 'Ainda não recebemos o pagamento. Depois de pagar, pode levar alguns segundos.');
      }
    } catch {
      if (manual) setHint('Não deu para consultar agora. Tente de novo em instantes.');
    } finally {
      if (manual) setChecking(false);
    }
  }

  useEffect(() => {
    if (!orderId) return;
    const started = Date.now();
    let busy = false;
    const tick = async () => {
      // Para depois de 20 min ou com a aba escondida (volta ao focar).
      if (busy || document.visibilityState !== 'visible' || Date.now() - started > 20 * 60_000) return;
      busy = true;
      await check(false);
      busy = false;
    };
    const id = setInterval(tick, 6000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { checking, hint, checkNow: () => check(true) };
}

/** Check animado de pagamento confirmado (também usado na página do pedido). */
export function PaidCheck({ size = 80 }: { size?: number }) {
  // Toque curto no celular quando confirma (ignorado onde não existe).
  useEffect(() => { try { navigator.vibrate?.(40); } catch { /* sem vibração */ } }, []);
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <span aria-hidden="true" className="paid-ring absolute inset-0 rounded-full bg-emerald-400/40" />
      <span className="paid-pop relative w-full h-full rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400" aria-hidden="true">
          <polyline className="paid-check" points="20 6 9 17 4 12" />
        </svg>
      </span>
    </span>
  );
}

export function PixPayBlock({ qrCode, copyPaste, expiresAt, orderId }: { qrCode: string; copyPaste: string; expiresAt?: string; orderId?: string }) {
  const { checking, hint, checkNow } = usePixStatusPolling(orderId);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyInputRef = useRef<HTMLInputElement>(null);
  const secondsLeft = useCountdown(expiresAt);
  // Duração total do PIX (o maior valor visto; um PIX novo reinicia) para a
  // barra de tempo.
  const [totalSecs, setTotalSecs] = useState<number | null>(null);
  useEffect(() => {
    if (secondsLeft === null) return;
    setTotalSecs(t => (t === null || secondsLeft > t ? secondsLeft : t));
  }, [secondsLeft]);
  const fraction = secondsLeft !== null && totalSecs ? secondsLeft / totalSecs : null;
  const [justCopied, setJustCopied] = useState(false);

  async function copy() {
    const ok = await copyText(copyPaste);
    if (!ok) {
      // Sem permissão de copiar (comum dentro do Instagram/WhatsApp):
      // seleciona o código pro cliente copiar segurando o dedo.
      setCopyFailed(true);
      copyInputRef.current?.focus();
      copyInputRef.current?.select();
      return;
    }
    setCopyFailed(false);
    setCopied(true);
    setJustCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const timeLabel = secondsLeft === null ? null
    : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const urgency = secondsLeft !== null && secondsLeft < 120 && secondsLeft > 0;

  const copyIcon = copied
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>;

  return (
    <div className="w-full flex flex-col items-center gap-5">
      {/* Status + tempo */}
      <div className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border ${urgency ? 'border-amber-200 bg-amber-50' : 'border-mist bg-warm/40'}`}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-clay opacity-50 animate-ping"/>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-clay"/>
          </span>
          <span className="text-xs font-semibold text-mid">Aguardando pagamento</span>
        </div>
        {timeLabel && (
          <span className={`text-xs font-mono font-bold tabular-nums ${urgency ? 'text-amber-700' : 'text-faint'}`} aria-label={`Expira em ${timeLabel}`}>
            {timeLabel}
          </span>
        )}
      </div>
      {/* Barra do tempo que resta: esvazia até o PIX vencer. */}
      {fraction !== null && (
        <div aria-hidden="true" className="-mt-3 w-full h-1 rounded-full bg-mist/70 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width,background-color] duration-1000 ease-linear ${urgency ? 'bg-amber-500' : 'bg-clay'}`}
            style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
          />
        </div>
      )}

      {/* Celular: copiar primeiro, botão grande */}
      <button
        type="button"
        onClick={copy}
        className={`sm:hidden w-full h-12 rounded-full inline-flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-[0.98] transition-[background-color,transform] duration-150 ${copied ? 'bg-emerald-600 text-white' : 'bg-ink text-paper'}`}
      >
        {copyIcon}
        {copied ? 'Código copiado' : 'Copiar código PIX'}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Código PIX copiado' : ''}</span>
      {/* Próximo passo logo depois de copiar (no celular é o que falta). */}
      {justCopied && (
        <div className="sm:hidden w-full -mt-2 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 text-[12.5px] text-emerald-800 dark:text-emerald-300 leading-relaxed animate-fade-up">
          <strong className="font-semibold">Código copiado.</strong> Agora abra o app do seu banco, vá em <strong className="font-semibold">Pix › Pix Copia e Cola</strong> e cole. Ao pagar, esta tela confirma sozinha.
        </div>
      )}

      {/* QR */}
      <div className="flex flex-col items-center gap-3">
        {/* Fundo branco também no modo escuro: o QR é preto (às vezes com
            fundo transparente) e some num fundo escuro. */}
        <div className="rounded-2xl border-2 border-mist p-3 bg-white">
          {qrCode ? (
            <img src={qrCode} alt="QR Code PIX" className="w-40 h-40 sm:w-44 sm:h-44 block" width={176} height={176}/>
          ) : (
            <div className="w-44 h-44 rounded-xl flex items-center justify-center bg-warm">
              <span className="text-faint text-xs text-center px-4">QR Code indisponível</span>
            </div>
          )}
        </div>
        <p className="text-xs text-faint text-center max-w-[28ch] leading-relaxed">
          <span className="sm:hidden">Pagando por outro aparelho? Escaneie o QR no app do banco.</span>
          <span className="hidden sm:inline">Abra o app do seu banco, escolha Pix e escaneie o código</span>
        </p>
      </div>

      {/* Copia e cola (desktop; no celular serve de alternativa pra copiar na mão) */}
      <div className="w-full flex flex-col gap-2">
        <div className="flex items-center gap-1 rounded-full border border-mist bg-warm/40 overflow-hidden p-1">
          <input
            ref={copyInputRef}
            readOnly
            value={copyPaste}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 min-w-0 pl-3 pr-1 py-2 text-[11px] font-mono text-ink bg-transparent truncate focus:outline-none"
            aria-label="Código PIX copia e cola"
          />
          <button
            type="button"
            onClick={copy}
            className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold tracking-[0.08em] uppercase active:scale-[0.97] transition-[background-color,transform] duration-150 ${
              copied ? 'bg-emerald-600 text-white' : 'bg-ink text-paper hover:bg-clay'
            }`}
          >
            {copyIcon}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        {copyFailed && (
          <p role="status" className="text-[11px] text-amber-700">
            Seu navegador não deixou copiar. O código está selecionado: toque e segure para copiar.
          </p>
        )}
      </div>

      {/* Aviso */}
      <div className="w-full border-l-2 border-clay/40 pl-3 py-1">
        <p className="text-xs text-mid leading-relaxed">
          Após pagar, a confirmação é <strong className="text-ink">automática e imediata</strong>. Não é necessário enviar comprovante.
        </p>
      </div>

      {/* Passos */}
      <ol className="w-full flex flex-col gap-2.5">
        {['Abra o app do seu banco', 'Escolha a opção PIX', 'Cole o código (ou escaneie o QR)', 'Confirme o valor e finalize'].map((text, i) => (
          <li key={text} className="flex items-center gap-3 text-xs text-mid">
            <span className="w-5 h-5 rounded-full bg-warm border border-mist flex items-center justify-center text-[10px] font-bold text-faint shrink-0">{i + 1}</span>
            {text}
          </li>
        ))}
      </ol>

      {/* Já pagou e a tela não mudou: consulta na hora. */}
      {orderId && (
        <div className="w-full flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={checkNow}
            disabled={checking}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full border border-mist text-[13px] font-medium text-ink hover:bg-warm disabled:opacity-60 transition-colors"
          >
            {checking ? <><span className="spinner w-3.5 h-3.5" /> Consultando…</> : 'Já paguei'}
          </button>
          {hint && <p role="status" className="text-xs text-mid text-center max-w-[32ch]">{hint}</p>}
        </div>
      )}
    </div>
  );
}
