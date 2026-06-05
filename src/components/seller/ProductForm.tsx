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

function compressImage(file: File, maxW = 900): Promise<{ blob: Blob; dataUrl: string }> {
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
        0.82,
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

// ── Camera Modal ─────────────────────────────────────────────────────────────
function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string, hex: string, blob: Blob) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [crosshair, setCrosshair] = useState({ x: 0.5, y: 0.5 });
  const [pickedHex, setPickedHex] = useState<string>('#cccccc');
  const [isDragging, setIsDragging] = useState(false);

  // Pega a foto — câmera nativa no mobile
  const handleFile = async (file: File) => {
    const { blob, dataUrl } = await compressImage(file, 900);
    setPreview(dataUrl);
    setCapturedBlob(blob);
    // Sample center pixel
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

  const handleImgPointer = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (!preview) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setCrosshair({ x: fx, y: fy });
      sampleColor(preview, fx, fy);
    },
    [preview, sampleColor],
  );

  const confirm = () => {
    if (!preview || !capturedBlob) return;
    onCapture(preview, pickedHex, capturedBlob);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">Foto do produto</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 overflow-y-auto">
        {!preview ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            {/* Botão principal — abre câmera traseira direto no mobile */}
            <label className="w-full cursor-pointer">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/30 rounded-xl py-12 px-6 text-white/80 hover:border-white/60 transition-colors">
                <span className="text-5xl">📷</span>
                <span className="text-sm font-medium text-center">Toque para tirar foto</span>
                <span className="text-xs text-white/50 text-center">Foto do lençol, fronha ou conjunto</span>
              </div>
            </label>

            {/* Alternativa galeria */}
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
            {/* Preview com crosshair para selecionar a cor */}
            <div className="relative w-full rounded-xl overflow-hidden border border-white/20" style={{ aspectRatio: '1/1' }}>
              <img
                ref={imgRef}
                src={preview}
                alt="preview"
                className="w-full h-full object-cover select-none"
                onPointerDown={(e) => { setIsDragging(true); handleImgPointer(e); e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => isDragging && handleImgPointer(e)}
                onPointerUp={() => setIsDragging(false)}
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
                <div className="relative">
                  <div className="w-8 h-8 rounded-full border-2 border-white shadow-lg" style={{ background: pickedHex }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full" />
                  </div>
                  {/* linhas de mira */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-px w-12 h-0.5 bg-white/70 -ml-4" />
                  <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-px h-12 w-0.5 bg-white/70 -mt-4" />
                </div>
              </div>
            </div>

            <p className="text-xs text-white/60 text-center">
              Arraste o círculo para selecionar a cor do produto
            </p>

            {/* Cor selecionada */}
            <div className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-2">
              <div className="w-6 h-6 rounded-full border border-white/30 shrink-0" style={{ background: pickedHex }} />
              <span className="text-sm text-white font-mono">{pickedHex}</span>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setPreview(null); setCapturedBlob(null); }}
                className="flex-1 border border-white/30 text-white/70 text-sm font-medium py-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                Tirar outra
              </button>
              <button
                onClick={confirm}
                className="flex-1 bg-white text-black text-sm font-semibold py-3 rounded-xl hover:bg-white/90 transition-colors"
              >
                Usar esta foto
              </button>
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
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

  // Imagens: cada entrada tem dataUrl (preview) + blob (para upload) + hex da cor
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

  const handleCapture = (dataUrl: string, hex: string, blob: Blob) => {
    setShowCamera(false);
    setImages((prev) => [...prev, { dataUrl, blob, hex }]);
    // Auto-adiciona variação com a cor detectada se ainda não houver
    if (variants.length === 0) {
      setVariants([{ size: SIZES[0], fabric: FABRICS[0], color: hex, qty: 1 }]);
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
          const storageRef = ref(storage, `products/${Date.now()}_photo.jpg`);
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

      <div className="max-w-lg mx-auto px-1">
        {error && (
          <div className="mb-4 border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 rounded-md">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-5">

          {/* ── Fotos ── */}
          <div>
            <label className="label mb-2 block">Fotos do produto</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img.dataUrl}
                    alt=""
                    className="h-20 w-20 rounded-lg border border-mist object-cover"
                  />
                  {/* Cor extraída */}
                  <div
                    className="absolute bottom-1 left-1 w-4 h-4 rounded-full border border-white shadow"
                    style={{ background: img.hex }}
                    title={img.hex}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Botão câmera */}
              <button
                onClick={() => setShowCamera(true)}
                className="h-20 w-20 rounded-lg border-2 border-dashed border-clay/40 flex flex-col items-center justify-center gap-1 text-clay/60 hover:border-clay hover:text-clay transition-colors"
              >
                <span className="text-2xl">📷</span>
                <span className="text-xs font-medium">Foto</span>
              </button>
            </div>
            {images.length > 0 && (
              <p className="text-xs text-faint">
                Cor detectada: <span className="font-mono">{images[0].hex}</span>
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
              className="w-full border border-mist rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
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
              className="w-full resize-none border border-mist rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
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
                className="w-full border border-mist rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
              />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-mist rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
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
              className="w-full border border-mist rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
            />
          </div>

          {/* ── Variações ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-mid">Variações</label>
              <button onClick={addVariant} className="text-xs font-semibold text-clay hover:text-clay-d">
                + Adicionar
              </button>
            </div>

            {variants.length === 0 && (
              <p className="text-xs text-faint py-2">Nenhuma variação. Toque em + Adicionar.</p>
            )}

            <div className="flex flex-col gap-2">
              {variants.map((v, i) => (
                <div key={i} className="rounded-xl border border-mist bg-warm p-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-2xs text-faint mb-0.5 block">Tamanho</label>
                      <select
                        value={v.size}
                        onChange={(e) => updateVariant(i, 'size', e.target.value)}
                        className="w-full rounded-md border border-mist bg-paper px-2 py-2 text-sm"
                      >
                        {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-2xs text-faint mb-0.5 block">Tecido</label>
                      <select
                        value={v.fabric}
                        onChange={(e) => updateVariant(i, 'fabric', e.target.value)}
                        className="w-full rounded-md border border-mist bg-paper px-2 py-2 text-sm"
                      >
                        {FABRICS.map((f) => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Cor — input nativo + preview */}
                    <div className="flex-1">
                      <label className="text-2xs text-faint mb-0.5 block">Cor (hex)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={v.color.startsWith('#') ? v.color : '#cccccc'}
                          onChange={(e) => updateVariant(i, 'color', e.target.value)}
                          className="w-10 h-9 rounded border border-mist cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={v.color}
                          onChange={(e) => updateVariant(i, 'color', e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1 rounded-md border border-mist px-2 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>

                    {!isEdit && (
                      <div className="w-20">
                        <label className="text-2xs text-faint mb-0.5 block">Qtd</label>
                        <input
                          type="number"
                          min={0}
                          value={v.qty}
                          onChange={(e) => updateVariant(i, 'qty', Number(e.target.value))}
                          inputMode="numeric"
                          className="w-full rounded-md border border-mist px-2 py-2 text-sm text-center"
                        />
                      </div>
                    )}

                    <button
                      onClick={() => removeVariant(i)}
                      className="self-end mb-0.5 text-red-400 hover:text-red-600 text-lg leading-none pb-1"
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
          <div className="flex gap-3 pt-2 pb-6">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary flex-1 py-3 text-base"
            >
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
            </button>
            <button
              onClick={() => router.push('/painel/produtos')}
              className="border border-mist px-5 py-3 text-sm font-medium text-mid rounded-md hover:bg-warm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
