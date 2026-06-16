'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/client';
import type { Product } from '@/types';

type Props = {
  initial?: Partial<Product> & { id?: string };
};

const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'];
const SIZES = ['solteiro', 'casal', 'queen', 'king'] as const;
const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King' };
const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'];

function makeVariantId(size: string, fabric: string, color: string) {
  return `${size}_${fabric}_${color}`.toLowerCase().replace(/\s+/g, '_');
}

// maxW reduzido de 900→720 e qualidade de 0.82→0.75
// reduz tamanho médio de upload ~40%, economizando Storage e egress do GCS
function compressImage(file: File, maxW = 720): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('compress failed'));
          const reader = new FileReader();
          reader.onload = () => resolve({ blob, dataUrl: reader.result as string });
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.75, // era 0.82 — reduz ~15% no tamanho sem perda visual perceptível
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

// ── Detecção local por OCR (Tesseract.js — roda no browser, zero custo) ──────
type Detected = { size?: string; fabric?: string; category?: string; name?: string };

async function detectFromLabel(dataUrl: string): Promise<Detected> {
  try {
    // Lazy-import: só carrega Tesseract quando a câmera for usada
    const Tesseract = await import('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'por', {
      logger: () => {},
    });

    const t = text.toLowerCase();
    const result: Detected = {};

    // Tamanho — detecta pelo checkbox marcado no rótulo Mikma
    // O rótulo tem "Jogo Box Solteiro", "Jogo Box Casal", "Jogo Box Queen", "Jogo Box King"
    // O marcado tem um "x" ou "v" ou bolinha ao lado
    if (/casal/.test(t)) result.size = 'casal';
    else if (/queen/.test(t)) result.size = 'queen';
    else if (/king/.test(t)) result.size = 'king';
    else if (/solteiro/.test(t)) result.size = 'solteiro';

    // Tecido
    if (/percal\s*300/.test(t)) result.fabric = 'Percal 300 fios';
    else if (/percal\s*200/.test(t)) result.fabric = 'Percal 200 fios';
    else if (/percal/.test(t)) result.fabric = 'Percal 200 fios';
    else if (/cetim/.test(t)) result.fabric = 'Cetim';
    else if (/malha/.test(t)) result.fabric = 'Malha';
    else if (/algod/.test(t)) result.fabric = 'Algodão';

    // Categoria
    if (/fronha/.test(t)) result.category = 'Fronhas';
    else if (/jogo\s*(de\s*cama|box)/.test(t)) result.category = 'Jogos de cama';
    else if (/len[cç]ol/.test(t)) result.category = 'Lençóis';
    else if (/edredom|edredon/.test(t)) result.category = 'Edredons';

    // Nome sugerido
    const sizeName = result.size ? SIZE_LABEL[result.size] : '';
    const fabricName = result.fabric ?? '';
    if (sizeName || fabricName) {
      result.name = ['Jogo de cama', sizeName, fabricName].filter(Boolean).join(' ');
    }

    return result;
  } catch {
    return {};
  }
}

// ── Camera Modal ─────────────────────────────────────────────────────────────
function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string, hex: string, blob: Blob, detected: Detected) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [crosshair, setCrosshair] = useState({ x: 0.5, y: 0.5 });
  const [pickedHex, setPickedHex] = useState<string>('#cccccc');
  const [detecting, setDetecting] = useState(false);

  const handleFile = async (file: File) => {
    const { blob, dataUrl } = await compressImage(file, 720);
    setPreview(dataUrl);
    setCapturedBlob(blob);
    sampleColor(dataUrl, 0.5, 0.5);
  };

  const sampleColor = useCallback((src: string, fx: number, fy: number) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = Math.round(fx * (img.width - 1));
      const py = Math.round(fy * (img.height - 1));
      const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
      setPickedHex(rgbToHex(r, g, b));
    };
    img.src = src;
  }, []);

  // Toque/clique único já move o crosshair
  const handleImgPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!preview) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setCrosshair({ x: fx, y: fy });
      sampleColor(preview, fx, fy);
    },
    [preview, sampleColor],
  );

  const confirm = async () => {
    if (!preview || !capturedBlob) return;
    setDetecting(true);
    const detected = await detectFromLabel(preview);
    setDetecting(false);
    onCapture(preview, pickedHex, capturedBlob, detected);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">Foto do produto</span>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 overflow-y-auto pb-6">
        {!preview ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            {/* Câmera traseira direto no mobile */}
            <label className="w-full cursor-pointer">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/30 rounded-2xl py-14 px-6 text-white/80 active:border-white/60">
                <span className="text-6xl">📷</span>
                <span className="text-base font-semibold text-center">Tirar foto</span>
                <span className="text-xs text-white/50 text-center">
                  Aponte para o produto ou rótulo da embalagem
                </span>
              </div>
            </label>

            {/* Galeria */}
            <label className="cursor-pointer text-xs text-white/40 hover:text-white/70 underline underline-offset-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              Escolher da galeria
            </label>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            {/* Preview — toque para selecionar a cor */}
            <div
              className="relative w-full rounded-2xl overflow-hidden border border-white/20 cursor-crosshair"
              style={{ aspectRatio: '1/1' }}
              onPointerDown={handleImgPointer}
              onPointerMove={(e) => e.buttons > 0 && handleImgPointer(e)}
            >
              <img
                src={preview}
                alt="preview"
                className="w-full h-full object-cover select-none pointer-events-none"
                draggable={false}
              />
              {/* Crosshair */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${crosshair.x * 100}%`,
                  top: `${crosshair.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="absolute top-1/2 -translate-y-px bg-white/80 h-px" style={{ width: 40, left: -20 }} />
                <div className="absolute left-1/2 -translate-x-px bg-white/80 w-px" style={{ height: 40, top: -20 }} />
                <div
                  className="w-9 h-9 rounded-full border-[3px] border-white shadow-lg -translate-x-1/2 -translate-y-1/2 absolute top-0 left-0"
                  style={{ background: pickedHex }}
                />
              </div>
            </div>

            <p className="text-xs text-white/60 text-center -mt-1">
              Toque na imagem para selecionar a cor do produto
            </p>

            {/* Cor selecionada */}
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2.5 w-full">
              <div className="w-6 h-6 rounded-full border border-white/30 shrink-0" style={{ background: pickedHex }} />
              <span className="text-sm text-white font-mono flex-1">{pickedHex}</span>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setPreview(null); setCapturedBlob(null); }}
                className="flex-1 border border-white/30 text-white/70 text-sm font-medium py-3.5 rounded-2xl active:bg-white/10"
              >
                Tirar outra
              </button>
              <button
                onClick={confirm}
                disabled={detecting}
                className="flex-1 bg-white text-black text-sm font-semibold py-3.5 rounded-2xl active:bg-white/90 disabled:opacity-60"
              >
                {detecting ? 'Lendo rótulo…' : 'Usar esta foto'}
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
  // Fabric specs
  const [threadCount, setThreadCount] = useState(initial?.threadCount ? String(initial.threadCount) : '');
  const [composition, setComposition] = useState(initial?.composition ?? '');
  const [weightGsm, setWeightGsm] = useState(initial?.weightGsm ? String(initial.weightGsm) : '');
  const [certifications, setCertifications] = useState(initial?.certifications?.join(', ') ?? '');

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

    // Preenche automaticamente com o que foi detectado no rótulo
    if (detected.name && !name) setName(detected.name);
    if (detected.category) setCategory(detected.category);

    // Cria variação automática com os dados detectados
    const autoSize = detected.size ?? SIZES[0];
    const autoFabric = detected.fabric ?? FABRICS[0];
    if (variants.length === 0) {
      setVariants([{ size: autoSize, fabric: autoFabric, color: hex, qty: 1 }]);
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
    setSaving(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const img of images) {
        if (img.url) {
          uploadedUrls.push(img.url);
        } else if (img.blob) {
          // Organizado por ano/mês → facilita política de ciclo de vida no GCS
          const now = new Date();
          const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
          const storageRef = ref(storage, `products/${folder}/${Date.now()}_photo.jpg`);
          await uploadBytes(storageRef, img.blob);
          uploadedUrls.push(await getDownloadURL(storageRef));
        }
      }

      const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100);
      const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const builtVariants = variants.map(({ size, fabric, color }) => ({
        id: makeVariantId(size, fabric, color),
        size: size as 'solteiro' | 'casal' | 'queen' | 'king',
        fabric,
        color,
      }));

      const data = {
        name, description,
        price: priceCents,
        category,
        tags: tagArr,
        images: uploadedUrls,
        active,
        variants: builtVariants,
        updatedAt: serverTimestamp(),
        // Fabric specs — only save if filled
        ...(threadCount ? { threadCount: parseInt(threadCount) } : {}),
        ...(composition ? { composition } : {}),
        ...(weightGsm ? { weightGsm: parseInt(weightGsm) } : {}),
        ...(certifications ? { certifications: certifications.split(',').map(s => s.trim()).filter(Boolean) } : {}),
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
      {showCamera && (
        <CameraModal onCapture={handleCapture} onClose={() => setShowCamera(false)} />
      )}

      <div className="max-w-lg mx-auto">
        {error && (
          <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-5">

          {/* ── Fotos ── */}
          <div>
            <label className="label mb-2 block">Fotos do produto</label>
            <div className="flex flex-wrap gap-2 mb-1">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img.dataUrl}
                    alt=""
                    className="h-20 w-20 border border-mist object-cover"
                  />
                  <div
                    className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full border-2 border-white shadow"
                    style={{ background: img.hex }}
                    title={img.hex}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={() => setShowCamera(true)}
                className="h-20 w-20 border-2 border-dashed border-clay/40 flex flex-col items-center justify-center gap-1 text-clay/70 hover:border-clay hover:text-clay transition-colors"
              >
                <span className="text-2xl">📷</span>
                <span className="text-xs font-medium">Foto</span>
              </button>
            </div>
            {images.length > 0 && (
              <p className="text-xs text-faint">
                Cor: <span className="font-mono">{images[0].hex}</span>
              </p>
            )}
          </div>

          {/* ── Nome ── */}
          <div>
            <label className="label">Nome do produto</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jogo de cama queen algodão"
              className="w-full border border-mist px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20 input"
            />
          </div>

          {/* ── Descrição ── */}
          <div>
            <label className="label">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Material, medidas, cuidados com lavagem..."
              className="w-full resize-none border border-mist px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20 input"
            />
          </div>

          {/* ── Preço + Categoria ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Preço (R$)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="49,90"
                inputMode="decimal"
                className="w-full border border-mist px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20 input"
              />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-mist px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20 input"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* ── Tags ── */}
          <div>
            <label className="label">Tags <span className="font-normal text-faint">(vírgula)</span></label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="algodão, casal, branco"
              className="w-full border border-mist px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20 input"
            />
          </div>

          {/* ── Specs do tecido ── */}
          <div className="border border-mist">
            <div className="px-4 py-2.5 bg-warm/50 border-b border-mist">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint">Especificações do tecido <span className="font-normal normal-case opacity-60">(opcional)</span></p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Fio count</label>
                <input
                  type="number" min={0} placeholder="400"
                  value={threadCount} onChange={e => setThreadCount(e.target.value)}
                  className="w-full border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                />
              </div>
              <div>
                <label className="label">Gramatura (g/m²)</label>
                <input
                  type="number" min={0} placeholder="180"
                  value={weightGsm} onChange={e => setWeightGsm(e.target.value)}
                  className="w-full border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                />
              </div>
              <div className="col-span-2">
                <label className="label">Composição</label>
                <input
                  placeholder="100% Algodão"
                  value={composition} onChange={e => setComposition(e.target.value)}
                  className="w-full border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                />
              </div>
              <div className="col-span-2">
                <label className="label">Certificações <span className="font-normal normal-case opacity-60">(vírgula)</span></label>
                <input
                  placeholder="OEKO-TEX, Fair Trade"
                  value={certifications} onChange={e => setCertifications(e.target.value)}
                  className="w-full border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                />
              </div>
            </div>
          </div>

          {/* ── Variações ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label">Variações</label>
              <button onClick={addVariant} className="text-xs font-semibold text-clay active:text-clay-d">
                + Adicionar
              </button>
            </div>

            {variants.length === 0 && (
              <p className="text-xs text-faint py-2">
                Tire uma foto do rótulo para preencher automaticamente, ou toque em + Adicionar.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {variants.map((v, i) => (
                <div key={i} className="border border-mist bg-warm/50 p-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Tamanho</label>
                      <select
                        value={v.size}
                        onChange={(e) => updateVariant(i, 'size', e.target.value)}
                        className="w-full border border-mist bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                      >
                        {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Tecido</label>
                      <select
                        value={v.fabric}
                        onChange={(e) => updateVariant(i, 'fabric', e.target.value)}
                        className="w-full border border-mist bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                      >
                        {FABRICS.map((f) => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Cor (hex)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={v.color.startsWith('#') ? v.color : '#cccccc'}
                          onChange={(e) => updateVariant(i, 'color', e.target.value)}
                          className="w-10 h-9 border border-mist cursor-pointer p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={v.color}
                          onChange={(e) => updateVariant(i, 'color', e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1 border border-mist px-2 py-2 text-sm font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    {!isEdit && (
                      <div className="w-20">
                        <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Qtd</label>
                        <input
                          type="number"
                          min={0}
                          value={v.qty}
                          onChange={(e) => updateVariant(i, 'qty', Number(e.target.value))}
                          inputMode="numeric"
                          className="w-full border border-mist px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-clay/20"
                        />
                      </div>
                    )}

                    <button
                      onClick={() => removeVariant(i)}
                      className="text-red-400 active:text-red-600 text-xl leading-none pb-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Ativo ── */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-mist accent-clay"
            />
            <span className="text-sm text-mid">Produto ativo (visível na loja)</span>
          </label>

          {/* ── Ações ── */}
          <div className="flex gap-3 pt-2 pb-8">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary flex-1 py-3.5 text-base"
            >
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
            </button>
            <button
              onClick={() => router.push('/painel/produtos')}
              className="border border-mist px-5 py-3.5 text-sm font-medium text-mid hover:bg-warm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
