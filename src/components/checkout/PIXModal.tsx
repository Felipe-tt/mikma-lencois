'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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

export function PIXModal({ qrCode, copyPaste, totalCents, orderId, expiresAt, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const secondsLeft = useCountdown(expiresAt);
  const expired = secondsLeft === 0;

  // Trava o scroll do body e fecha com ESC enquanto o modal estiver aberto.
  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function copy() {
    navigator.clipboard.writeText(copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCents / 100);

  const timeLabel = (() => {
    if (secondsLeft === null) return null;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pix-modal-title"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[400px] max-h-[calc(100vh-2rem)] overflow-y-auto bg-paper border border-mist shadow-modal animate-scale-in">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 flex items-start justify-between gap-3 border-b border-mist">
          <div className="min-w-0">
            <p className="page-label text-clay mb-1.5">Pedido #{orderId.slice(-8).toUpperCase()}</p>
            <h2 id="pix-modal-title" className="font-display font-normal text-ink text-2xl leading-none">
              Pague com PIX
            </h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xs text-faint uppercase tracking-wide mb-0.5">Total</p>
            <p className="font-display text-2xl text-clay leading-none">{total}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col items-center gap-5">
          {expired ? (
            <div className="w-full flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-clay/10 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-clay">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm text-ink font-semibold">Este código PIX expirou</p>
              <p className="text-xs text-faint max-w-[26ch]">
                Volte aos seus pedidos para gerar um novo código de pagamento.
              </p>
            </div>
          ) : (
            <>
              {/* Status + contador */}
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-clay opacity-60 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-clay" />
                  </span>
                  <span className="text-xs font-semibold text-mid">Aguardando pagamento</span>
                </div>
                {timeLabel && (
                  <span className="text-xs font-mono font-semibold text-faint tabular-nums">
                    expira em {timeLabel}
                  </span>
                )}
              </div>

              {/* QR Code */}
              <div className="border border-mist p-3 bg-white shadow-card">
                {qrCode ? (
                  <img src={qrCode} alt="QR Code para pagamento via PIX" className="w-48 h-48 block" width={192} height={192} />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-faint text-xs">
                    QR Code indisponível
                  </div>
                )}
              </div>

              <p className="text-sm text-mid text-center leading-relaxed">
                Abra o app do seu banco e escaneie o código,<br className="hidden sm:block" /> ou copie a chave abaixo.
              </p>

              {/* Copy paste */}
              <div className="w-full flex flex-col gap-2">
                <div className="w-full flex gap-2">
                  <input
                    readOnly
                    value={copyPaste}
                    onFocus={e => e.currentTarget.select()}
                    className="input flex-1 text-xs truncate font-mono"
                    aria-label="Código PIX copia e cola"
                  />
                  <button
                    onClick={copy}
                    className={`shrink-0 px-4 text-xs font-semibold tracking-wide transition-colors duration-150 flex items-center gap-1.5 ${
                      copied ? 'bg-green-600 text-white' : 'btn-primary'
                    }`}
                  >
                    {copied ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>
                        Copiado
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                        Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-xs text-faint text-center leading-relaxed px-2">
                Após o pagamento, seu pedido é confirmado automaticamente.{' '}
                <strong className="text-mid font-semibold">Não feche esta janela.</strong>
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-mist px-6 py-4 flex justify-center">
          <button
            onClick={onClose}
            className="text-sm text-faint hover:text-clay transition-colors duration-150 font-medium"
          >
            {expired ? 'Voltar aos meus pedidos' : 'Fechar e acompanhar pedido'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
