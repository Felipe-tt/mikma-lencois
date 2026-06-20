'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { hexToColorName } from '@/lib/colorNames';
import { ColorPicker } from './ColorPicker';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { PhotoColorPicker } from './PhotoColorPicker';

type Props = {
  initial?: Partial<Product> & { id?: string };
};

const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'];
const SIZES = ['solteiro', 'casal', 'queen', 'king'] as const;
const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King' };
const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'];

function makeVariantId(size: string, fabric: string) {
  // SKU usa apenas size+fabric — cor não inclusa para evitar quebrar inventário ao trocar foto
  return `${size}_${fabric}`.toLowerCase().replace(/\s+/g, '_');
}

type ImgEntry = { dataUrl: string; blob?: Blob; url?: string };
type VariantEntry = { size: string; fabric: string; color: string; colorName: string; qty: number };

/* ───────────────────────────── Seção wrapper ───────────────────────────── */

function FormSection({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">{step}</span>
        <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">{title}</h2>
      </div>
      {hint && <p className="text-[12px] text-faint -mt-2 ml-[30px]">{hint}</p>}
      <div className="ml-[30px] flex flex-col gap-4">{children}</div>
    </section>
  );
}

/* ───────────────────────────── Form principal ──────────────────────────── */

export default function ProductForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? (initial.price / 100).toFixed(2) : '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  const [threadCount, setThreadCount] = useState(initial?.threadCount ? String(initial.threadCount) : '');
  const [composition, setComposition] = useState(initial?.composition ?? '');
  const [weightGsm, setWeightGsm] = useState(initial?.weightGsm ? String(initial.weightGsm) : '');
  const [certifications, setCertifications] = useState(initial?.certifications?.join(', ') ?? '');
  const [specsOpen, setSpecsOpen] = useState(!!(initial?.threadCount || initial?.composition || initial?.weightGsm || initial?.certifications?.length));

  const [images, setImages] = useState<ImgEntry[]>(
    (initial?.images ?? []).map(url => ({ dataUrl: url, url }))
  );

  const [variants, setVariants] = useState<VariantEntry[]>(
    initial?.variants?.map(v => ({ size: v.size, fabric: v.fabric ?? '', color: v.color ?? '', colorName: v.colorName ?? '', qty: 0 })) ?? []
  );

  const [showCamera, setShowCamera] = useState(false);
  const [colorPickerForImage, setColorPickerForImage] = useState<string | null>(null); // dataUrl da imagem sendo usada pra extrair cor
  const [pendingVariantColorTarget, setPendingVariantColorTarget] = useState<number | null>(null); // índice da variação que vai receber a cor extraída
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePhotoTaken(dataUrl: string, blob: Blob) {
    setShowCamera(false);
    setImages(prev => [...prev, { dataUrl, blob }]);
  }

  function removeImage(i: number) {
    setImages(prev => prev.filter((_, idx) => idx !== i));
  }

  function addVariant() {
    const fallbackHex = '#E8DCC8';
    setVariants(v => [...v, { size: SIZES[0], fabric: FABRICS[0], color: fallbackHex, colorName: hexToColorName(fallbackHex), qty: 1 }]);
  }

  function removeVariant(i: number) {
    setVariants(v => v.filter((_, idx) => idx !== i));
  }

  function updateVariant(i: number, field: keyof VariantEntry, value: string | number) {
    setVariants(v => v.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  function openColorFromPhoto(variantIdx: number) {
    if (images.length === 0) return;
    setPendingVariantColorTarget(variantIdx);
    setColorPickerForImage(images[0].dataUrl);
  }

  function handlePickedFromPhoto(hex: string, colorName: string) {
    if (pendingVariantColorTarget !== null) {
      updateVariant(pendingVariantColorTarget, 'color', hex);
      updateVariant(pendingVariantColorTarget, 'colorName', colorName);
    }
    setColorPickerForImage(null);
    setPendingVariantColorTarget(null);
  }

  const priceValid = !!price && !isNaN(parseFloat(price.replace(',', '.')));

  async function handleSubmit() {
    if (!name.trim()) { setError('Dê um nome para o produto.'); return; }
    if (!priceValid) { setError('Informe um preço válido.'); return; }
    if (images.length === 0) { setError('Adicione pelo menos uma foto.'); return; }
    if (variants.length === 0) { setError('Adicione pelo menos uma variação (tamanho/tecido/cor).'); return; }

    setSaving(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const img of images) {
        if (img.url) {
          uploadedUrls.push(img.url);
        } else if (img.blob) {
          const now = new Date();
          const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
          const ext = img.blob.type === 'image/webp' ? 'webp' : 'jpg';
          const storageRef = ref(storage, `products/${folder}/${Date.now()}_photo.${ext}`);
          await uploadBytes(storageRef, img.blob);
          uploadedUrls.push(await getDownloadURL(storageRef));
        }
      }

      const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100);
      const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
      const builtVariants = variants.map(({ size, fabric, color, colorName }) => ({
        id: makeVariantId(size, fabric),
        size: size as 'solteiro' | 'casal' | 'queen' | 'king',
        fabric,
        color,
        colorName: colorName || color,
      }));

      const data = {
        name: name.trim(),
        description,
        price: priceCents,
        category,
        tags: tagArr,
        images: uploadedUrls,
        active,
        variants: builtVariants,
        updatedAt: serverTimestamp(),
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
          const variantId = makeVariantId(v.size, v.fabric);
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
  }

  return (
    <>
      {showCamera && (
        <PhotoCaptureModal onCapture={handlePhotoTaken} onClose={() => setShowCamera(false)} />
      )}
      {colorPickerForImage && (
        <PhotoColorPicker
          imageDataUrl={colorPickerForImage}
          onPick={handlePickedFromPhoto}
          onClose={() => { setColorPickerForImage(null); setPendingVariantColorTarget(null); }}
        />
      )}

      <div className="max-w-xl mx-auto">
        {error && (
          <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-8">

          {/* ── 1. Fotos ── */}
          <FormSection step={1} title="Fotos do produto" hint="A primeira foto é usada como capa e como referência de cor">
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.dataUrl} alt="" className="h-20 w-20 border border-mist object-cover" style={{ borderRadius: '4px' }} />
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 bg-ink/80 text-paper text-[8px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-sm">Capa</span>
                  )}
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow"
                    aria-label="Remover foto"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={() => setShowCamera(true)}
                className="h-20 w-20 border-2 border-dashed border-clay/40 flex flex-col items-center justify-center gap-1 text-clay/70 hover:border-clay hover:text-clay transition-colors"
                style={{ borderRadius: '4px' }}
              >
                <span className="text-2xl">📷</span>
                <span className="text-[10px] font-medium">Foto</span>
              </button>
            </div>
          </FormSection>

          {/* ── 2. Informações básicas ── */}
          <FormSection step={2} title="Informações básicas">
            <div>
              <label className="label">Nome do produto</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jogo de cama queen algodão"
                className="input"
              />
            </div>

            <div>
              <label className="label">Descrição</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Material, medidas, cuidados com lavagem..."
                className="input resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Preço (R$)</label>
                <input
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="49,90"
                  inputMode="decimal"
                  className={`input ${price && !priceValid ? 'border-red-400' : ''}`}
                />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="select">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Tags <span className="font-normal normal-case text-faint">(separadas por vírgula)</span></label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="algodão, casal, branco"
                className="input"
              />
            </div>
          </FormSection>

          {/* ── 3. Variações ── */}
          <FormSection
            step={3}
            title="Variações"
            hint="Cada combinação de tamanho, tecido e cor vira um item separado no estoque"
          >
            {variants.length === 0 && (
              <div className="border border-dashed border-mist px-4 py-6 text-center" style={{ borderRadius: '4px' }}>
                <p className="text-[12px] text-faint mb-3">Nenhuma variação ainda</p>
                <button onClick={addVariant} className="btn-outline text-[12px] px-4 py-2">
                  + Adicionar variação
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {variants.map((v, i) => (
                <div key={i} className="border border-mist bg-warm/40 p-3.5 flex flex-col gap-3" style={{ borderRadius: '4px' }}>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Tamanho</label>
                      <select
                        value={v.size}
                        onChange={e => updateVariant(i, 'size', e.target.value)}
                        className="w-full border border-mist bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                        style={{ borderRadius: '4px' }}
                      >
                        {SIZES.map(s => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Tecido</label>
                      <select
                        value={v.fabric}
                        onChange={e => updateVariant(i, 'fabric', e.target.value)}
                        className="w-full border border-mist bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                        style={{ borderRadius: '4px' }}
                      >
                        {FABRICS.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-faint block font-semibold tracking-[0.1em] uppercase">Cor</label>
                      {images.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openColorFromPhoto(i)}
                          className="text-[10px] font-semibold text-clay hover:text-clay-d flex items-center gap-1"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          Pegar da foto
                        </button>
                      )}
                    </div>
                    <ColorPicker
                      value={v.color}
                      colorName={v.colorName}
                      onChange={(hex, colorName) => {
                        updateVariant(i, 'color', hex);
                        updateVariant(i, 'colorName', colorName);
                      }}
                    />
                  </div>

                  <div className="flex items-end gap-2 pt-1 border-t border-mist/60">
                    {!isEdit && (
                      <div className="flex-1 pt-2.5">
                        <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Quantidade em estoque</label>
                        <input
                          type="number"
                          min={0}
                          value={v.qty}
                          onChange={e => updateVariant(i, 'qty', Number(e.target.value))}
                          inputMode="numeric"
                          className="w-full border border-mist px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20"
                          style={{ borderRadius: '4px' }}
                        />
                      </div>
                    )}
                    {isEdit && (
                      <p className="flex-1 text-[11px] text-faint pt-2.5">Estoque é gerenciado na página Estoque</p>
                    )}
                    <button
                      onClick={() => removeVariant(i)}
                      className="text-red-400 hover:text-red-600 transition-colors w-9 h-9 flex items-center justify-center shrink-0"
                      aria-label="Remover variação"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
                    </button>
                  </div>
                </div>
              ))}

              {variants.length > 0 && (
                <button onClick={addVariant} className="self-start text-[12px] font-semibold text-clay hover:text-clay-d flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                  Adicionar outra variação
                </button>
              )}
            </div>
          </FormSection>

          {/* ── 4. Especificações do tecido (colapsável) ── */}
          <FormSection step={4} title="Especificações do tecido" hint="Opcional — aparece na página do produto">
            <button
              type="button"
              onClick={() => setSpecsOpen(o => !o)}
              className="self-start flex items-center gap-1.5 text-[12px] font-semibold text-mid hover:text-ink transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${specsOpen ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
              {specsOpen ? 'Ocultar especificações' : 'Adicionar especificações'}
            </button>

            {specsOpen && (
              <div className="border border-mist p-4 grid grid-cols-2 gap-3" style={{ borderRadius: '4px' }}>
                <div>
                  <label className="label">Fio count</label>
                  <input type="number" min={0} placeholder="400" value={threadCount} onChange={e => setThreadCount(e.target.value)} className="input-sm" />
                </div>
                <div>
                  <label className="label">Gramatura (g/m²)</label>
                  <input type="number" min={0} placeholder="180" value={weightGsm} onChange={e => setWeightGsm(e.target.value)} className="input-sm" />
                </div>
                <div className="col-span-2">
                  <label className="label">Composição</label>
                  <input placeholder="100% Algodão" value={composition} onChange={e => setComposition(e.target.value)} className="input-sm" />
                </div>
                <div className="col-span-2">
                  <label className="label">Certificações <span className="font-normal normal-case text-faint">(vírgula)</span></label>
                  <input placeholder="OEKO-TEX, Fair Trade" value={certifications} onChange={e => setCertifications(e.target.value)} className="input-sm" />
                </div>
              </div>
            )}
          </FormSection>

          {/* ── 5. Visibilidade ── */}
          <FormSection step={5} title="Visibilidade">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
                className="w-4 h-4 accent-clay"
                style={{ borderRadius: '3px' }}
              />
              <span className="text-sm text-mid">Produto ativo (visível na loja)</span>
            </label>
          </FormSection>

          {/* ── Ações ── */}
          <div className="flex gap-3 pt-2 pb-8">
            <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1 py-3.5 text-base">
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
            </button>
            <button onClick={() => router.push('/painel/produtos')} className="border border-mist px-5 py-3.5 text-sm font-medium text-mid hover:bg-warm transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
