'use client';

import { useRef, useState } from 'react';

interface Props {
  onCapture: (dataUrl: string, blob: Blob) => void;
  onClose: () => void;
}

/**
 * Desenha a imagem já compressa num canvas e devolve blob + dataUrl.
 * Recebe um ImageBitmap (já orientado corretamente) ou um HTMLImageElement
 * (fallback, sem garantia de orientação correta).
 */
function drawAndExport(source: ImageBitmap | HTMLImageElement, maxW: number): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const srcW = 'width' in source ? source.width : 0;
    const srcH = 'height' in source ? source.height : 0;
    const scale = Math.min(1, maxW / srcW);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(srcW * scale);
    canvas.height = Math.round(srcH * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const tryFmt = (fmt: string, q: number) => new Promise<Blob | null>(res => canvas.toBlob(b => res(b), fmt, q));
    (async () => {
      let blob = await tryFmt('image/webp', 0.8);
      if (!blob || blob.size < 100) blob = await tryFmt('image/jpeg', 0.75);
      if (!blob) return reject(new Error('compress failed'));
      const r = new FileReader();
      r.onload = () => resolve({ blob: blob!, dataUrl: r.result as string });
      r.onerror = reject;
      r.readAsDataURL(blob);
    })();
  });
}

/**
 * Comprime e corrige orientação da foto antes de salvar.
 *
 * Fotos tiradas em retrato no celular costumam vir com os pixels em
 * paisagem + uma tag EXIF de orientação dizendo "gire 90°" — é assim que
 * câmeras evitam reprocessar a imagem na hora da captura. canvas.drawImage
 * IGNORA essa tag por padrão, então sem tratamento a foto salva vira de
 * lado mesmo aparecendo reta no preview do seletor de arquivo do sistema.
 *
 * createImageBitmap com imageOrientation: 'from-image' resolve isso nativa-
 * mente (suportado em Chrome/Edge/Firefox/Safari recentes). Em navegadores
 * sem suporte à opção, cai pro método antigo via <img> — sem garantia de
 * orientação correta, mas pelo menos não quebra a funcionalidade.
 */
async function compressImage(file: File, maxW = 900): Promise<{ blob: Blob; dataUrl: string }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const result = await drawAndExport(bitmap, maxW);
      bitmap.close();
      return result;
    } catch {
      // Alguns navegadores aceitam a opção mas falham silenciosamente em
      // certos formatos — cai pro fallback abaixo.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      drawAndExport(img, maxW).then(resolve, reject).finally(() => URL.revokeObjectURL(url));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
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
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setBusy(true);
    setError('');
    try {
      const { blob, dataUrl } = await compressImage(file, 900);
      onCapture(dataUrl, blob);
    } catch {
      setError('Não foi possível processar essa foto. Tente outra.');
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
            {error && (
              <p className="text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2 text-center w-full">
                {error}
              </p>
            )}
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
