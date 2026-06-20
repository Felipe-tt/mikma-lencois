'use client';

import { useCallback, useEffect, useState } from 'react';
import { hexToColorName } from '@/lib/colorNames';

interface Props {
  imageDataUrl: string;
  onPick: (hex: string, name: string) => void;
  onClose: () => void;
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Modal simples: mostra a foto, o usuário toca no produto pra capturar a cor
 * exata do pixel. Sem OCR, sem leitura de rótulo — só amostragem de cor,
 * que é rápida e confiável.
 */
export function PhotoColorPicker({ imageDataUrl, onPick, onClose }: Props) {
  const [crosshair, setCrosshair] = useState({ x: 0.5, y: 0.5 });
  const [pickedHex, setPickedHex] = useState('#cccccc');
  const [pickedName, setPickedName] = useState('');

  const sample = useCallback((fx: number, fy: number) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // A <img> na tela usa object-fit: cover dentro de um quadro quadrado,
      // o que recorta a imagem original pra preencher o espaço (corta as
      // bordas mais longas). fx/fy chegam aqui como frações (0–1) da área
      // VISÍVEL na tela — então é preciso replicar exatamente a mesma
      // matemática do object-cover pra saber qual pixel da imagem ORIGINAL
      // corresponde ao ponto que o usuário realmente vê e toca.
      const imgAspect = img.width / img.height;
      const frameAspect = 1; // o quadro de preview é sempre 1:1 (aspectRatio: '1/1')

      let visibleW = img.width;
      let visibleH = img.height;
      let offsetX = 0;
      let offsetY = 0;

      if (imgAspect > frameAspect) {
        // Imagem mais larga que o quadro — sobra é cortada nas laterais
        visibleW = img.height * frameAspect;
        offsetX = (img.width - visibleW) / 2;
      } else if (imgAspect < frameAspect) {
        // Imagem mais alta que o quadro — sobra é cortada em cima/embaixo
        visibleH = img.width / frameAspect;
        offsetY = (img.height - visibleH) / 2;
      }

      const px = Math.round(offsetX + fx * (visibleW - 1));
      const py = Math.round(offsetY + fy * (visibleH - 1));
      const clampedPx = Math.max(0, Math.min(img.width - 1, px));
      const clampedPy = Math.max(0, Math.min(img.height - 1, py));

      const [r, g, b] = ctx.getImageData(clampedPx, clampedPy, 1, 1).data;
      const hex = rgbToHex(r, g, b);
      setPickedHex(hex);
      setPickedName(hexToColorName(hex));
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const handlePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setCrosshair({ x: fx, y: fy });
    sample(fx, fy);
  }, [sample]);

  // Amostra o centro assim que a imagem muda (ou na montagem)
  useEffect(() => {
    sample(0.5, 0.5);
    setCrosshair({ x: 0.5, y: 0.5 });
  }, [imageDataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">Toque para escolher a cor</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">✕</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 overflow-y-auto pb-6">
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div
            className="relative w-full rounded-2xl overflow-hidden border border-white/20 cursor-crosshair"
            style={{ aspectRatio: '1/1' }}
            onPointerDown={handlePointer}
            onPointerMove={e => e.buttons > 0 && handlePointer(e)}
          >
            <img src={imageDataUrl} alt="" className="w-full h-full object-cover select-none pointer-events-none" draggable={false} />
            <div
              className="absolute pointer-events-none"
              style={{ left: `${crosshair.x * 100}%`, top: `${crosshair.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            >
              <div className="absolute top-1/2 -translate-y-px bg-white/80 h-px" style={{ width: 40, left: -20 }} />
              <div className="absolute left-1/2 -translate-x-px bg-white/80 w-px" style={{ height: 40, top: -20 }} />
              <div className="w-9 h-9 rounded-full border-[3px] border-white shadow-lg -translate-x-1/2 -translate-y-1/2 absolute top-0 left-0" style={{ background: pickedHex }} />
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/10 px-4 py-2.5 w-full rounded-xl">
            <div className="w-7 h-7 rounded-full border border-white/30 shrink-0" style={{ background: pickedHex }} />
            <span className="text-sm text-white flex-1">{pickedName}</span>
            <span className="text-xs text-white/40 font-mono">{pickedHex}</span>
          </div>

          <button
            onClick={() => onPick(pickedHex, pickedName)}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 rounded-2xl active:bg-white/90"
          >
            Usar esta cor
          </button>
        </div>
      </div>
    </div>
  );
}
