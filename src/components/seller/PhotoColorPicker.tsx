'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hexToColorName } from '@/lib/colorNames';
import { auth } from '@/lib/firebase/client';

interface Props {
  images: string[];
  imageIndex: number;
  onChangeImage: (index: number) => void;
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
export function PhotoColorPicker({ images, imageIndex, onChangeImage, onPick, onClose }: Props) {
  const imageDataUrl = images[imageIndex];
  const [crosshair, setCrosshair] = useState({ x: 0.5, y: 0.5 });
  const [pickedHex, setPickedHex] = useState('#cccccc');
  const [pickedName, setPickedName] = useState('');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Canvas off-screen com a imagem já decodificada — criado UMA vez por foto,
  // não a cada toque. Antes, sample() criava um `new Image()` do zero em
  // cada chamada e esperava o onload (assíncrono); ao arrastar o dedo isso
  // disparava várias decodificações em paralelo, fora de ordem — quem
  // terminava de carregar por último "vencia", não necessariamente o último
  // ponto tocado. Resultado: a cor mostrada quase nunca era a do ponto atual.
  // Com o canvas pronto, a leitura de cada toque é síncrona e imediata.
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const imgSizeRef = useRef({ w: 0, h: 0 });

  // Lê a cor de um ponto (fx, fy = frações 0–1 da área VISÍVEL na tela),
  // convertendo pra coordenada real da imagem considerando o recorte do
  // object-fit: cover (a <img> exibida é sempre um quadro 1:1, então fotos
  // não-quadradas têm as bordas mais longas cortadas na exibição).
  const sampleAt = useCallback((fx: number, fy: number) => {
    const ctx = ctxRef.current;
    const { w, h } = imgSizeRef.current;
    if (!ctx || !w || !h) return;

    const imgAspect = w / h;
    const frameAspect = 1;

    let visibleW = w;
    let visibleH = h;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > frameAspect) {
      visibleW = h * frameAspect;
      offsetX = (w - visibleW) / 2;
    } else if (imgAspect < frameAspect) {
      visibleH = w / frameAspect;
      offsetY = (h - visibleH) / 2;
    }

    const px = Math.round(offsetX + fx * (visibleW - 1));
    const py = Math.round(offsetY + fy * (visibleH - 1));
    const clampedPx = Math.max(0, Math.min(w - 1, px));
    const clampedPy = Math.max(0, Math.min(h - 1, py));

    const [r, g, b] = ctx.getImageData(clampedPx, clampedPy, 1, 1).data;
    const hex = rgbToHex(r, g, b);
    setPickedHex(hex);
    setPickedName(hexToColorName(hex));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(false);

    async function load() {
      try {
        // Imagens de produtos já salvos vêm do Firebase Storage (outro
        // domínio). O Storage não envia Access-Control-Allow-Origin por
        // padrão — buscar a URL direto via fetch() no browser é bloqueado
        // pela política de CORS, e desenhar a <img> cross-origin direto no
        // canvas "contamina" o canvas (getImageData() lança SecurityError).
        //
        // Solução: pedir os bytes pra um proxy no nosso próprio servidor
        // (/api/products/image-proxy) — fetch servidor-a-servidor não tem
        // restrição de CORS — e converter a resposta numa data: URL local
        // antes de desenhar. O canvas nunca chega a tocar a URL cross-origin.
        let localDataUrl = imageDataUrl;
        if (imageDataUrl.startsWith('http')) {
          const token = await auth.currentUser?.getIdToken();
          if (!token) throw new Error('not authenticated');
          const proxied = `/api/products/image-proxy?url=${encodeURIComponent(imageDataUrl)}`;
          const res = await fetch(proxied, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
          const blob = await res.blob();
          localDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          ctxRef.current = ctx;
          imgSizeRef.current = { w: img.width, h: img.height };
          setReady(true);
          sampleAt(0.5, 0.5);
        };
        img.onerror = () => { if (!cancelled) setLoadError(true); };
        img.src = localDataUrl;
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    load();
    setCrosshair({ x: 0.5, y: 0.5 });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl]);

  const handlePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setCrosshair({ x: fx, y: fy });
    sampleAt(fx, fy);
  }, [sampleAt]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">Toque para escolher a cor</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 overflow-y-auto pb-6">
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">

          {images.length > 1 && (
            <div className="flex items-center gap-2 w-full overflow-x-auto pb-1">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => onChangeImage(i)}
                  className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${i === imageIndex ? 'border-white' : 'border-white/20'}`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          )}

          <div
            className="relative w-full rounded-2xl overflow-hidden border border-white/20 cursor-crosshair bg-white/5 aspect-square"
            onPointerDown={e => ready && handlePointer(e)}
            onPointerMove={e => ready && e.buttons > 0 && handlePointer(e)}
          >
            <img src={imageDataUrl} alt="" className="w-full h-full object-cover select-none pointer-events-none" draggable={false} />

            {!ready && !loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="spinner" />
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="text-xs text-white/70">Não foi possível carregar essa foto pra extrair a cor</p>
              </div>
            )}

            {ready && !loadError && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${crosshair.x * 100}%`, top: `${crosshair.y * 100}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="absolute top-1/2 -translate-y-px bg-white/80 h-px" style={{ width: 40, left: -20 }} />
                <div className="absolute left-1/2 -translate-x-px bg-white/80 w-px" style={{ height: 40, top: -20 }} />
                <div className="w-9 h-9 rounded-full border-[3px] border-white shadow-lg -translate-x-1/2 -translate-y-1/2 absolute top-0 left-0" style={{ background: pickedHex }} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 bg-white/10 px-4 py-2.5 w-full rounded-xl">
            <div className="w-7 h-7 rounded-full border border-white/30 shrink-0" style={{ background: pickedHex }} />
            <span className="text-sm text-white flex-1">
              {loadError ? 'Erro ao carregar a foto' : pickedName || 'Carregando…'}
            </span>
            <span className="text-xs text-white/40 font-mono">{ready && !loadError ? pickedHex : ''}</span>
          </div>

          <button
            onClick={() => onPick(pickedHex, pickedName)}
            disabled={!ready || loadError}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 rounded-2xl active:bg-white/90 disabled:opacity-40"
          >
            Usar esta cor
          </button>
        </div>
      </div>
    </div>
  );
}
