'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/client';
import type { Product } from '@/types';

type Props = { initial?: Partial<Product> & { id?: string } };

const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'];
const SIZES = ['solteiro', 'casal', 'queen', 'king'] as const;
const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King' };
const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'];

function makeVariantId(size: string, fabric: string, color: string) {
  return `${size}_${fabric}_${color}`.toLowerCase().replace(/\s+/g, '_');
}

function compressImage(file: File, maxW = 1200): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('compress failed'));
          const reader = new FileReader();
          reader.onload = () => resolve({ blob, dataUrl: reader.result as string });
          reader.readAsDataURL(blob);
        },
        'image/jpeg', 0.85,
      );
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Amostra a cor média de uma área NxN ao redor do ponto (evita ruído de pixel único)
function sampleAreaColor(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  w: number, h: number,
  radius = 8,
): string {
  const x0 = Math.max(0, px - radius);
  const y0 = Math.max(0, py - radius);
  const x1 = Math.min(w - 1, px + radius);
  const y1 = Math.min(h - 1, py + radius);
  const data = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
  }
  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

// ── Detecção sem OCR — análise visual do rótulo Mikma ──────────────────────
// O rótulo tem 4 linhas de checkbox na coluna esquerda (~10-20% X).
// A linha marcada tem um círculo/ponto preenchido (pixel escuro no centro).
// Dividimos a região de checkboxes em 4 faixas horizontais e achamos a mais escura.
type Detected = { size?: string; fabric?: string; category?: string; name?: string };

function detectFromCanvas(img: HTMLImageElement): Detected {
  const canvas = document.createElement('canvas');
  // Trabalha em resolução menor para velocidade
  const scale = Math.min(1, 800 / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const W = canvas.width;
  const H = canvas.height;

  // ── 1. Detectar tamanho pela coluna dos checkboxes ──
  // No rótulo Mikma os checkboxes ficam em ~8-18% X, distribuídos em 4 linhas verticais
  // entre ~25% e ~75% de Y (área útil do rótulo)
  const cbX0 = Math.round(W * 0.04);
  const cbX1 = Math.round(W * 0.22);
  const cbY0 = Math.round(H * 0.22);
  const cbY1 = Math.round(H * 0.82);
  const rowH = (cbY1 - cbY0) / 4;

  // Para cada linha de checkbox, calcula a "escuridão" média (0=branco, 255=preto)
  const rowDarkness: number[] = [];
  for (let row = 0; row < 4; row++) {
    const y0 = Math.round(cbY0 + row * rowH);
    const y1 = Math.round(cbY0 + (row + 1) * rowH);
    const regionData = ctx.getImageData(cbX0, y0, cbX1 - cbX0, y1 - y0).data;
    let darkness = 0;
    let count = 0;
    for (let i = 0; i < regionData.length; i += 4) {
      const brightness = (regionData[i] + regionData[i + 1] + regionData[i + 2]) / 3;
      darkness += 255 - brightness;
      count++;
    }
    rowDarkness.push(count > 0 ? darkness / count : 0);
  }

  // A linha mais escura é a marcada
  let markedRow = 0;
  let maxDarkness = rowDarkness[0];
  for (let i = 1; i < 4; i++) {
    if (rowDarkness[i] > maxDarkness) { maxDarkness = rowDarkness[i]; markedRow = i; }
  }

  // Ordem no rótulo Mikma: Solteiro(0), Casal(1), Queen(2), King(3)
  const detectedSize = SIZES[markedRow];

  // ── 2. Detectar tecido e categoria por texto via Tesseract (assíncrono, mas já temos canvas) ──
  // Aqui retornamos só o tamanho (síncrono). O OCR fica separado abaixo.
  const result: Detected = { size: detectedSize };

  // ── 3. Categoria padrão para rótulos Mikma ──
  result.category = 'Jogos de cama';

  return result;
}

// OCR apenas para tecido/nome — roda depois da detecção visual
async function detectFabricFromOcr(dataUrl: string): Promise<{ fabric?: string; name?: string }> {
  try {
    const Tesseract = await import('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'por', { logger: () => {} });
    const t = text.toLowerCase();
    let fabric: string | undefined;
    if (/percal\s*300/.test(t)) fabric = 'Percal 300 fios';
    else if (/percal\s*200/.test(t)) fabric = 'Percal 200 fios';
    else if (/percal/.test(t)) fabric = 'Percal 200 fios';
    else if (/cetim/.test(t)) fabric = 'Cetim';
    else if (/malha/.test(t)) fabric = 'Malha';
    else if (/algod/.test(t)) fabric = 'Algodão';
    return { fabric };
  } catch {
    return {};
  }
}

// ── Camera Modal ──────────────────────────────────────────────────────────
function CameraModal({
  onCapture, onClose,
}: {
  onCapture: (dataUrl: string, hex: string, blob: Blob, detected: Detected) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [crosshair, setCrosshair] = useState({ x: 0.5, y: 0.5 });
  const [pickedHex, setPickedHex] = useState('#cccccc');
  const [detecting, setDetecting] = useState(false);
  const [detectedSize, setDetectedSize] = useState<string | null>(null);
  const canvasRef = useRef<{ ctx: CanvasRenderingContext2D; w: number; h: number; img: HTMLImageElement } | null>(null);

  const handleFile = async (file: File) => {
    const { blob, dataUrl } = await compressImage(file, 1200);
    setPreview(dataUrl);
    setCapturedBlob(blob);

    // Monta canvas para amostragem de cor e detecção visual
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      canvasRef.current = { ctx, w: img.width, h: img.height, img };

      // Cor inicial no centro
      const hex = sampleAreaColor(ctx, Math.round(img.width / 2), Math.round(img.height / 2), img.width, img.height);
      setPickedHex(hex);

      // Detecção visual do tamanho (síncrona, sem OCR)
      const detected = detectFromCanvas(img);
      if (detected.size) setDetectedSize(detected.size);
    };
    img.src = dataUrl;
  };

  const handleImgPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!preview || !canvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setCrosshair({ x: fx, y: fy });
    const { ctx, w, h } = canvasRef.current;
    const hex = sampleAreaColor(ctx, Math.round(fx * (w - 1)), Math.round(fy * (h - 1)), w, h);
    setPickedHex(hex);
  }, [preview]);

  const confirm = async () => {
    if (!preview || !capturedBlob || !canvasRef.current) return;
    setDetecting(true);

    // Detecção visual já foi feita — agora roda OCR só para tecido
    const visualDetected = detectFromCanvas(canvasRef.current.img);
    const ocrResult = await detectFabricFromOcr(preview);
    const detected: Detected = { ...visualDetected, ...ocrResult };

    setDetecting(false);
    onCapture(preview, pickedHex, capturedBlob, detected);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/97">
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">Foto do produto</span>
        <button onClick={onClose} className="text-white/60 hover:text-white w-9 h-9 flex items-center justify-center text-xl">✕</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 overflow-y-auto pb-8">
        {!preview ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <label className="w-full cursor-pointer">
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/30 rounded-2xl py-14 px-6 text-white/80 active:border-white/60">
                <span className="text-6xl">📷</span>
                <span className="text-base font-semibold text-center">Tirar foto do rótulo</span>
                <span className="text-xs text-white/50 text-center leading-relaxed">
                  Aponte para o rótulo da embalagem — detectamos o tamanho marcado automaticamente
                </span>
              </div>
            </label>
            <label className="cursor-pointer text-xs text-white/40 underline underline-offset-2">
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              Escolher da galeria
            </label>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">

            {/* Tamanho detectado visualmente */}
            {detectedSize && (
              <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl px-4 py-2.5 w-full">
                <span className="text-emerald-400 text-lg">✓</span>
                <div>
                  <p className="text-xs text-emerald-300 font-semibold">Tamanho detectado</p>
                  <p className="text-sm text-white font-bold">{SIZE_LABEL[detectedSize]}</p>
                </div>
                <p className="text-xs text-white/40 ml-auto leading-snug text-right">Altere abaixo<br/>se necessário</p>
              </div>
            )}

            {/* Preview com color picker */}
            <div
              className="relative w-full rounded-2xl overflow-hidden border border-white/20 cursor-crosshair"
              style={{ aspectRatio: '1/1' }}
              onPointerDown={handleImgPointer}
              onPointerMove={(e) => e.buttons > 0 && handleImgPointer(e)}
            >
              <img src={preview} alt="preview"
                className="w-full h-full object-cover select-none pointer-events-none" draggable={false} />

              {/* Crosshair */}
              <div className="absolute pointer-events-none"
                style={{ left: `${crosshair.x * 100}%`, top: `${crosshair.y * 100}%`, transform: 'translate(-50%,-50%)' }}>
                {/* linhas */}
                <div className="absolute top-1/2 bg-white/70 h-px" style={{ width: 36, left: -18, transform: 'translateY(-50%)' }} />
                <div className="absolute left-1/2 bg-white/70 w-px" style={{ height: 36, top: -18, transform: 'translateX(-50%)' }} />
                {/* círculo com sombra */}
                <div className="absolute w-8 h-8 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.6)]"
                  style={{ background: pickedHex, top: -16, left: -16 }} />
              </div>
            </div>

            <p className="text-xs text-white/50 text-center -mt-1">
              Toque na imagem para selecionar a cor do produto
            </p>

            {/* Cor selecionada */}
            <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5 w-full">
              <div className="w-7 h-7 rounded-full border-2 border-white/30 shrink-0" style={{ background: pickedHex }} />
              <span className="text-sm text-white font-mono flex-1">{pickedHex}</span>
              <span className="text-xs text-white/40">cor do produto</span>
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={() => { setPreview(null); setCapturedBlob(null); setDetectedSize(null); canvasRef.current = null; }}
                className="flex-1 border border-white/30 text-white/70 text-sm font-medium py-3.5 rounded-2xl active:bg-white/10">
                Tirar outra
              </button>
              <button onClick={confirm} disabled={detecting}
                className="flex-1 bg-white text-black text-sm font-semibold py-3.5 rounded-2xl active:bg-white/90 disabled:opacity-60">
                {detecting ? 'Analisando…' : 'Usar esta foto'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────
export default function ProductForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? (initial.price / 100).toFixed(2) : '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  type ImgEntry = { dataUrl: string; blob?: Blob; url?: string; hex: string };
  const [images, setImages] = useState<ImgEntry[]>(
    (initial?.images ?? []).map((url) => ({ dataUrl: url, url, hex: '#cccccc' })),
  );

  const [variants, setVariants] = useState<{ size: string; fabric: string; color: string; qty: number }[]>(
    initial?.variants?.map((v) => ({ size: v.size, fabric: v.fabric ?? '', color: v.color ?? '', qty: 0 })) ?? [],
  );

  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCapture = (dataUrl: string, hex: string, blob: Blob, detected: Detected) => {
    setShowCamera(false);
    setImages((prev) => [...prev, { dataUrl, blob, hex }]);

    if (detected.name && !name) setName(detected.name);
    if (detected.category) setCategory(detected.category);

    const autoSize = detected.size ?? SIZES[0];
    const autoFabric = detected.fabric ?? FABRICS[0];
    if (variants.length === 0) {
      setVariants([{ size: autoSize, fabric: autoFabric, color: hex, qty: 1 }]);
    } else {
      // Atualiza a primeira variação com o tamanho detectado
      setVariants((prev) => prev.map((v, i) =>
        i === 0 ? { ...v, size: autoSize, fabric: detected.fabric ?? v.fabric, color: hex } : v
      ));
    }
  };

  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));
  const addVariant = () =>
    setVariants((v) => [...v, { size: SIZES[0], fabric: FABRICS[0], color: images[0]?.hex ?? '#ffffff', qty: 1 }]);
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, field: string, value: string | number) =>
    setVariants((v) => v.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const handleSubmit = async () => {
    if (!name || !price || !category) { setError('Preencha nome, preço e categoria.'); return; }
    if (variants.length === 0) { setError('Adicione pelo menos uma variação.'); return; }
    if (images.length === 0) { setError('Adicione pelo menos uma foto.'); return; }
    setSaving(true); setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const img of images) {
        if (img.url) {
          uploadedUrls.push(img.url);
        } else if (img.blob) {
          const storageRef = ref(storage, `products/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
          await uploadBytes(storageRef, img.blob);
          uploadedUrls.push(await getDownloadURL(storageRef));
        }
      }

      const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100);
      const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const builtVariants = variants.map(({ size, fabric, color }) => ({
        id: makeVariantId(size, fabric, color),
        size: size as 'solteiro' | 'casal' | 'queen' | 'king',
        fabric, color,
      }));

      const data = {
        name, description, price: priceCents, category, tags: tagArr,
        images: uploadedUrls, active, variants: builtVariants,
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await updateDoc(doc(db, 'products', initial!.id!), data);
      } else {
        const newRef = doc(collection(db, 'products'));
        await setDoc(newRef, { ...data, createdAt: serverTimestamp() });
        for (const v of variants) {
          const variantId = makeVariantId(v.size, v.fabric, v.color);
          const sku = `${newRef.id}_${variantId}`;
          await setDoc(doc(db, 'inventory', sku), {
            productId: newRef.id, sku,
            variant: { id: variantId, size: v.size, fabric: v.fabric, color: v.color },
            quantity: v.qty, reserved: 0, lowStockThreshold: 3, history: [],
            updatedAt: serverTimestamp(),
          });
        }
      }
      router.push('/painel/produtos');
    } catch (e) {
      console.error(e);
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {showCamera && <CameraModal onCapture={handleCapture} onClose={() => setShowCamera(false)} />}

      <div className="max-w-lg mx-auto">
        {error && (
          <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 rounded-xl">{error}</div>
        )}

        <div className="flex flex-col gap-5">

          {/* Fotos */}
          <div>
            <label className="label mb-2 block">Fotos do produto</label>
            <div className="flex flex-wrap gap-2 mb-1">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.dataUrl} alt="" className="h-20 w-20 rounded-xl border border-mist object-cover" />
                  <div className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full border-2 border-white shadow"
                    style={{ background: img.hex }} title={img.hex} />
                  <button onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow">
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={() => setShowCamera(true)}
                className="h-20 w-20 rounded-xl border-2 border-dashed border-clay/40 flex flex-col items-center justify-center gap-1 text-clay/70 active:border-clay transition-colors">
                <span className="text-2xl">📷</span>
                <span className="text-xs font-medium">Foto</span>
              </button>
            </div>
            {images.length > 0 && (
              <p className="text-xs text-faint">Cor: <span className="font-mono">{images[0].hex}</span></p>
            )}
          </div>

          {/* Nome */}
          <div>
            <label className="label">Nome do produto</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Jogo de cama queen algodão"
              className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20" />
          </div>

          {/* Descrição */}
          <div>
            <label className="label">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="Material, medidas, cuidados com lavagem..."
              className="w-full resize-none border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20" />
          </div>

          {/* Preço + Categoria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Preço (R$)</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="49,90" inputMode="decimal"
                className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20" />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="label">Tags <span className="font-normal text-faint">(vírgula)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)}
              placeholder="algodão, casal, branco"
              className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20" />
          </div>

          {/* Variações */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-mid">Variações</label>
              <button onClick={addVariant} className="text-xs font-semibold text-clay">+ Adicionar</button>
            </div>

            {variants.length === 0 && (
              <p className="text-xs text-faint py-2">
                Tire uma foto do rótulo para preencher automaticamente, ou toque em + Adicionar.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {variants.map((v, i) => (
                <div key={i} className="rounded-xl border border-mist bg-warm p-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-2xs text-faint mb-0.5 block">Tamanho</label>
                      <select value={v.size} onChange={(e) => updateVariant(i, 'size', e.target.value)}
                        className="w-full rounded-lg border border-mist bg-paper px-2 py-2 text-sm">
                        {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-2xs text-faint mb-0.5 block">Tecido</label>
                      <select value={v.fabric} onChange={(e) => updateVariant(i, 'fabric', e.target.value)}
                        className="w-full rounded-lg border border-mist bg-paper px-2 py-2 text-sm">
                        {FABRICS.map((f) => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-2xs text-faint mb-0.5 block">Cor (hex)</label>
                      <div className="flex items-center gap-2">
                        <input type="color"
                          value={v.color.startsWith('#') && v.color.length === 7 ? v.color : '#cccccc'}
                          onChange={(e) => updateVariant(i, 'color', e.target.value)}
                          className="w-10 h-9 rounded-lg border border-mist cursor-pointer p-0.5 shrink-0" />
                        <input type="text" value={v.color}
                          onChange={(e) => updateVariant(i, 'color', e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1 rounded-lg border border-mist px-2 py-2 text-sm font-mono" />
                      </div>
                    </div>

                    {!isEdit && (
                      <div className="w-20">
                        <label className="text-2xs text-faint mb-0.5 block">Qtd</label>
                        <input type="number" min={0} value={v.qty}
                          onChange={(e) => updateVariant(i, 'qty', Number(e.target.value))}
                          inputMode="numeric"
                          className="w-full rounded-lg border border-mist px-2 py-2 text-sm text-center" />
                      </div>
                    )}

                    <button onClick={() => removeVariant(i)}
                      className="text-red-400 active:text-red-600 text-xl leading-none pb-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ativo */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-mist accent-clay" />
            <span className="text-sm text-mid">Produto ativo (visível na loja)</span>
          </label>

          {/* Ações */}
          <div className="flex gap-3 pt-2 pb-8">
            <button onClick={handleSubmit} disabled={saving}
              className="btn-primary flex-1 py-3.5 text-base rounded-xl">
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
            </button>
            <button onClick={() => router.push('/painel/produtos')}
              className="border border-mist px-5 py-3.5 text-sm font-medium text-mid rounded-xl active:bg-warm transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
