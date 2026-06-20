'use client';

import { useRef, useState } from 'react';

interface Props {
  onCapture: (dataUrl: string, blob: Blob) => void;
  onClose: () => void;
}

function compressImage(file: File, maxW = 900): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const tryFmt = (fmt: string, q: number) => new Promise<Blob | null>(res => canvas.toBlob(b => res(b), fmt, q));
      (async () => {
        let blob = await tryFmt('image/webp', 0.8);
        if (!blob || blob.size < 100) blob = await tryFmt('image/jpeg', 0.75);
        if (!blob) return reject(new Error('compress failed'));
        const r = new FileReader();
        r.onload = () => resolve({ blob, dataUrl: r.result as string });
        r.readAsDataURL(blob);
        URL.revokeObjectURL(url);
      })();
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Modal de captura de foto — só foto, simples e rápida.
 * Detecção de cor é feita depois, separadamente, sobre a foto já tirada.
 */
export function PhotoCaptureModal({ onCapture, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const { blob, dataUrl } = await compressImage(file, 900);
      onCapture(dataUrl, blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">Foto do produto</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">✕</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {busy ? (
          <div className="flex flex-col items-center gap-3 text-white/70">
            <span className="spinner" />
            <span className="text-sm">Processando foto…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <label className="w-full cursor-pointer">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/30 rounded-2xl py-14 px-6 text-white/80 active:border-white/60">
                <span className="text-6xl">📷</span>
                <span className="text-base font-semibold text-center">Tirar foto</span>
                <span className="text-xs text-white/50 text-center">Aponte para o produto</span>
              </div>
            </label>

            <label className="cursor-pointer text-xs text-white/40 hover:text-white/70 underline underline-offset-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              Escolher da galeria
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
