'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';

interface Props {
  pixData: { txId: string; qrCode: string; copyPaste: string };
  totalCents: number;
  onClose: () => void;
}

export function PIXModal({ pixData, totalCents, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(pixData.copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="rounded-full bg-green-50 p-3">
        <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Pedido criado!</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pague <span className="font-semibold text-gray-900">{formatCurrency(totalCents)}</span> via PIX para confirmar.
        </p>
      </div>

      {/* QR Code image from AbacatePay */}
      {pixData.qrCode && (
        <img
          src={pixData.qrCode}
          alt="QR Code PIX"
          className="h-48 w-48 rounded-lg border border-gray-200"
        />
      )}

      <div className="w-full max-w-sm">
        <p className="mb-1.5 text-xs font-medium text-gray-500">Ou copie o código PIX</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={pixData.copyPaste}
            className="w-full truncate rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600"
          />
          <button
            onClick={copy}
            className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Após o pagamento, seu pedido será confirmado automaticamente.
      </p>

      <button onClick={onClose} className="text-sm font-medium text-blue-600 hover:text-blue-700">
        Ver meus pedidos →
      </button>
    </div>
  );
}
