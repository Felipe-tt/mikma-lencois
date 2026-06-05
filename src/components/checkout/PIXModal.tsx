'use client';

import { useState } from 'react';

interface Props {
  qrCode: string;
  copyPaste: string;
  totalCents: number;
  orderId: string;
  onClose: () => void;
}

export function PIXModal({ qrCode, copyPaste, totalCents, orderId, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCents / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm px-4">
      <div className="bg-paper w-full max-w-sm border border-mist shadow-2xl">
        {/* Header */}
        <div className="border-b border-mist px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="font-display font-normal text-ink text-xl">Pague com PIX</h2>
            <p className="text-xs text-faint mt-0.5">Pedido #{orderId.slice(-8).toUpperCase()}</p>
          </div>
          <span className="font-display text-xl text-clay">{total}</span>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col items-center gap-5">
          <p className="text-sm text-mid text-center">
            Escaneie o QR Code abaixo ou copie o código PIX para pagar.
          </p>

          {/* QR Code */}
          {qrCode && (
            <div className="border border-mist p-2 bg-white">
              <img src={qrCode} alt="QR Code PIX" className="w-44 h-44 block" />
            </div>
          )}

          {/* Copy paste */}
          <div className="w-full flex gap-2">
            <input
              readOnly
              value={copyPaste}
              className="input flex-1 text-xs truncate font-mono"
              aria-label="Código PIX copia e cola"
            />
            <button
              onClick={copy}
              className={`shrink-0 px-4 py-2 text-xs font-semibold tracking-wide transition-colors ${
                copied ? 'bg-green-600 text-white' : 'btn-primary'
              }`}
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>

          <p className="text-xs text-faint text-center leading-relaxed">
            Após o pagamento, seu pedido é confirmado automaticamente.{' '}
            <strong className="text-mid">Não feche esta janela.</strong>
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-mist px-6 py-4 flex justify-center">
          <button onClick={onClose} className="text-sm text-faint hover:text-clay transition-colors font-medium">
            Fechar e acompanhar pedido →
          </button>
        </div>
      </div>
    </div>
  );
}
