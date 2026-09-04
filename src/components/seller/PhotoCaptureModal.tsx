'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFullscreenOverlay } from '@/lib/hooks/useFullscreenOverlay';

interface Props {
  onDone: (photos: { dataUrl: string; blob: Blob }[]) => void;
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
      let blob = await tryFmt('image/webp', 0.75);
      if (!blob || blob.size < 100) blob = await tryFmt('image/jpeg', 0.72);
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
 * paisagem + uma tag EXIF de orientação dizendo "gire 90°", é assim que
 * câmeras evitam reprocessar a imagem na hora da captura. canvas.drawImage
 * IGNORA essa tag por padrão, então sem tratamento a foto salva vira de
 * lado mesmo aparecendo reta no preview do seletor de arquivo do sistema.
 *
 * createImageBitmap com imageOrientation: 'from-image' resolve isso nativa-
 * mente (suportado em Chrome/Edge/Firefox/Safari recentes). Em navegadores
 * sem suporte à opção, cai pro método antigo via <img>, sem garantia de
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
      // certos formatos, cai pro fallback abaixo.
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
 * Modal de captura de foto — captura contínua.
 *
 * Em vez de abrir/fechar esse modal pra cada foto (o fluxo antigo: tirar
 * 1 foto fechava o modal, precisava reabrir pra próxima — péssimo pra
 * quem cadastra muitos produtos e tira 3-5 fotos de cada), agora o modal
 * fica aberto entre capturas: tira, aparece na tirinha, tira de novo,
 * só fecha quando a pessoa decidir ("Concluir"). O loop de câmera nativa
 * do Android é rápido, é só a gente que não devia interromper ele a
 * cada foto.
 */
export function PhotoCaptureModal({ onDone, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState<{ dataUrl: string; blob: Blob }[]>([]);
  const viewportHeight = useFullscreenOverlay();

  async function handleFiles(files: FileList) {
    setBusy(true);
    setError('');
    try {
      const results = await Promise.all(Array.from(files).map(f => compressImage(f, 800)));
      setCaptured(prev => [...prev, ...results]);
      // Vibração curta confirma a captura sem precisar olhar pra tela —
      // útil segurando o celular na mão apontado pro produto. Só existe
      // no Android (iOS Safari não implementa Vibration API), sem problema
      // já que é só um toque extra, não uma dependência funcional.
      navigator.vibrate?.(15);
    } catch {
      setError('Não foi possível processar essa foto. Tente outra.');
    } finally {
      setBusy(false);
      // Permite tirar a mesma foto/arquivo de novo depois (o browser não
      // dispara onChange se o valor não mudar).
      if (fileRef.current) fileRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  function removeCaptured(i: number) {
    setCaptured(prev => prev.filter((_, idx) => idx !== i));
  }

  function finish() {
    if (captured.length > 0) onDone(captured);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] h-[100dvh] flex flex-col bg-black"
      style={viewportHeight ? { height: viewportHeight } : undefined}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">
          Foto do produto {captured.length > 0 && `· ${captured.length}`}
        </span>
        <span className="text-[11px] text-white/40">Toque fora para fechar</span>
      </div>

      {captured.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 shrink-0" onClick={e => e.stopPropagation()}>
          {captured.map((c, i) => (
            <div key={i} className="relative shrink-0">
              <img src={c.dataUrl} alt="" className="w-16 h-16 object-cover rounded-[4px] border border-white/20" />
              <button
                onClick={() => removeCaptured(i)}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                aria-label="Remover"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {busy ? (
          <div className="flex flex-col items-center gap-3 text-white/70">
            <span className="spinner" />
            <span className="text-sm">Processando foto…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs" onClick={e => e.stopPropagation()}>
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
                onChange={e => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
              />
              <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/30 rounded-2xl py-14 px-6 text-white/80 active:border-white/60">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span className="text-base font-semibold text-center">{captured.length > 0 ? 'Tirar mais uma' : 'Tirar foto'}</span>
                <span className="text-xs text-white/50 text-center">Aponte para o produto</span>
              </div>
            </label>

            <label className="cursor-pointer text-xs text-white/40 hover:text-white/70 underline underline-offset-2">
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
              />
              Escolher da galeria (várias de uma vez)
            </label>
          </div>
        )}
      </div>

      {captured.length > 0 && !busy && (
        <div className="p-4 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={finish} className="w-full bg-white text-black rounded-full py-3.5 text-sm font-bold">
            Concluir · {captured.length} foto{captured.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
