'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { hexToColorName } from '@/lib/colorNames';
import { ColorPicker } from './ColorPicker';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { PhotoColorPicker } from './PhotoColorPicker';
import { CATEGORIES, SIZES, SIZE_LABEL, FABRICS, YARN_COUNTS } from '@/lib/productOptions';
import { formatProductName } from '@/lib/textFormat';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStaffPrefs, setStaffPref } from '@/lib/staffPrefs';

type Props = {
  initial?: Partial<Product> & { id?: string };
};

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
  const { user } = useAuth();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? (initial.price / 100).toFixed(2) : '');
  const [weightKg, setWeightKg] = useState(initial?.weightKg ? String(initial.weightKg) : '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  const [yarnCount, setYarnCount] = useState(initial?.yarnCount ?? '');
  // Ao criar um produto novo (não em edição), pré-preenche com a última
  // espessura de fio que ESSE staff escolheu — persistida por UID no
  // Firestore (users/{uid}.staffPrefs), não localStorage, então segue a
  // pessoa em qualquer navegador/dispositivo que ela usar pra logar.
  useEffect(() => {
    if (isEdit || !user) return;
    getStaffPrefs(user.uid).then(prefs => {
      if (prefs.lastYarnCount) setYarnCount(prefs.lastYarnCount);
    }).catch(() => {});
  }, [isEdit, user]);

  function handleYarnCountChange(v: string) {
    setYarnCount(v);
    if (user) setStaffPref(user.uid, 'lastYarnCount', v).catch(() => {});
  }

  const [composition, setComposition] = useState(initial?.composition ?? '');
  const [weightGsm, setWeightGsm] = useState(initial?.weightGsm ? String(initial.weightGsm) : '');
  const [certifications, setCertifications] = useState(initial?.certifications?.join(', ') ?? '');
  const [specsOpen, setSpecsOpen] = useState(!!(initial?.yarnCount || initial?.composition || initial?.weightGsm || initial?.certifications?.length));

  const [images, setImages] = useState<ImgEntry[]>(
    (initial?.images ?? []).map(url => ({ dataUrl: url, url }))
  );
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);

  const [variants, setVariants] = useState<VariantEntry[]>(
    initial?.variants?.map(v => ({ size: v.size, fabric: v.fabric ?? '', color: v.color ?? '', colorName: v.colorName ?? '', qty: 0 })) ?? []
  );

  const [showCamera, setShowCamera] = useState(false);
  const [colorPickerImageIndex, setColorPickerImageIndex] = useState<number | null>(null); // índice da imagem sendo usada pra extrair cor
  const [pendingVariantColorTarget, setPendingVariantColorTarget] = useState<number | null>(null); // índice da variação que vai receber a cor extraída
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Em modo edição: carrega os SKUs de inventário que já existem pra esse produto,
  // pra poder detectar variações novas/removidas/renomeadas ao salvar e manter
  // o estoque sincronizado em vez de deixar SKUs órfãos no Firestore.
  const [existingSkus, setExistingSkus] = useState<Record<string, { quantity: number; reserved: number }>>({});
  useEffect(() => {
    if (!isEdit || !initial?.id) return;
    const productId = initial.id;
    getDocs(query(collection(db, 'inventory'), where('productId', '==', productId))).then(snap => {
      const map: Record<string, { quantity: number; reserved: number }> = {};
      snap.forEach(d => {
        const data = d.data();
        map[d.id] = { quantity: data.quantity ?? 0, reserved: data.reserved ?? 0 };
      });
      setExistingSkus(map);
    }).catch(() => {});
  }, [isEdit, initial?.id]);

  function handlePhotoTaken(dataUrl: string, blob: Blob) {
    setShowCamera(false);
    setImages(prev => [...prev, { dataUrl, blob }]);
  }

  function removeImage(i: number) {
    const img = images[i];
    if (img.url) setRemovedUrls(prev => [...prev, img.url!]);
    setImages(prev => prev.filter((_, idx) => idx !== i));
  }

  function makeCover(i: number) {
    setImages(prev => {
      const next = [...prev];
      const [chosen] = next.splice(i, 1);
      next.unshift(chosen);
      return next;
    });
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
    setColorPickerImageIndex(0);
  }

  function handlePickedFromPhoto(hex: string, colorName: string) {
    if (pendingVariantColorTarget !== null) {
      updateVariant(pendingVariantColorTarget, 'color', hex);
      updateVariant(pendingVariantColorTarget, 'colorName', colorName);
    }
    setColorPickerImageIndex(null);
    setPendingVariantColorTarget(null);
  }

  const priceValid = !!price && !isNaN(parseFloat(price.replace(',', '.')));
  const weightKgValid = !!weightKg && !isNaN(parseFloat(weightKg)) && parseFloat(weightKg) > 0;

  // SKUs que o form atual vai gerar (com base nas variações de agora)
  const currentSkuSet = new Set(variants.map(v => makeVariantId(v.size, v.fabric)));
  // SKUs que existiam no inventário antes e não aparecem mais nas variações atuais
  // (variação removida, ou tamanho/tecido mudou — o que gera um SKU diferente)
  const orphanedSkus = isEdit
    ? Object.keys(existingSkus).filter(sku => !currentSkuSet.has(sku.replace(`${initial?.id}_`, '')))
    : [];
  const orphanedWithStock = orphanedSkus.filter(sku => {
    const s = existingSkus[sku];
    return s && (s.quantity > 0 || s.reserved > 0);
  });

  // Duas variações com o mesmo tamanho+tecido geram o mesmo SKU e se sobrescrevem
  // silenciosamente no inventário — detecta isso pra avisar antes de salvar.
  const variantIdCounts = new Map<string, number>();
  for (const v of variants) {
    const id = makeVariantId(v.size, v.fabric);
    variantIdCounts.set(id, (variantIdCounts.get(id) ?? 0) + 1);
  }
  const duplicateVariantIndexes = new Set(
    variants
      .map((v, i) => ({ i, id: makeVariantId(v.size, v.fabric) }))
      .filter(({ id }) => (variantIdCounts.get(id) ?? 0) > 1)
      .map(({ i }) => i)
  );
  const hasDuplicateVariants = duplicateVariantIndexes.size > 0;

  async function handleSubmit() {
    if (!name.trim()) { setError('Dê um nome para o produto.'); return; }
    if (!priceValid) { setError('Informe um preço válido.'); return; }
    if (!weightKgValid) { setError('Informe o peso do produto em kg (ex: 1.2).'); return; }
    if (images.length === 0) { setError('Adicione pelo menos uma foto.'); return; }
    if (variants.length === 0) { setError('Adicione pelo menos uma variação (tamanho/tecido/cor).'); return; }
    if (hasDuplicateVariants) { setError('Há variações repetidas com o mesmo tamanho e tecido — ajuste antes de salvar.'); return; }

    setSaving(true);
    setError('');
    try {
      // Deleta do Storage imagens que o admin removeu (evita acúmulo de arquivos)
      if (removedUrls.length > 0) {
        await Promise.allSettled(
          removedUrls.map(url => {
            try {
              const m = url.match(/\/o\/(.+?)\?/);
              if (!m) return Promise.resolve();
              return deleteObject(ref(storage, decodeURIComponent(m[1])));
            } catch { return Promise.resolve(); }
          })
        );
      }

      // Upload em paralelo — muito mais rápido que sequencial
      const now = new Date();
      const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      const uploadedUrls: string[] = (
        await Promise.all(
          images.map(async (img, i) => {
            if (img.url) return img.url;
            if (!img.blob) return null;
            const ext = img.blob.type === 'image/webp' ? 'webp'
                      : img.blob.type === 'image/avif' ? 'avif'
                      : 'jpg';
            const fname = `${Date.now()}_${i}.${ext}`;
            const storageRef = ref(storage, `products/${folder}/${fname}`);
            await uploadBytes(storageRef, img.blob, {
              contentType: img.blob.type || 'image/webp',
              cacheControl: 'public, max-age=31536000, immutable',
              customMetadata: { index: String(i) },
            });
            return getDownloadURL(storageRef);
          })
        )
      ).filter((u): u is string => !!u);

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
        name: formatProductName(name),
        description,
        price: priceCents,
        weightKg: parseFloat(weightKg),
        category,
        tags: tagArr,
        images: uploadedUrls,
        active,
        variants: builtVariants,
        updatedAt: serverTimestamp(),
        ...(yarnCount ? { yarnCount } : {}),
        ...(composition ? { composition } : {}),
        ...(weightGsm ? { weightGsm: parseInt(weightGsm) } : {}),
        ...(certifications ? { certifications: certifications.split(',').map(s => s.trim()).filter(Boolean) } : {}),
      };

      if (isEdit) {
        const productId = initial!.id!;

        // Bloqueia o salvamento se isso for apagar SKUs com estoque restante
        // sem confirmação — evita perder quantidade rastreada por acidente.
        if (orphanedWithStock.length > 0) {
          const count = orphanedWithStock.length;
          const { confirmed: ok } = await confirmDialog({
            message: `${count === 1 ? 'Uma variação removida ainda tem' : `${count} variações removidas ainda têm`} estoque cadastrado.`,
            detail: 'Se continuar, esse estoque será apagado permanentemente.',
            confirmLabel: 'Continuar mesmo assim',
            variant: 'danger',
          });
          if (!ok) { setSaving(false); return; }
        }

        await updateDoc(doc(db, 'products', productId), data);

        // Remove SKUs órfãos (variação removida ou tamanho/tecido alterado)
        for (const sku of orphanedSkus) {
          await deleteDoc(doc(db, 'inventory', sku)).catch(() => {});
        }

        // Cria SKUs novos que ainda não existem no inventário
        for (const v of variants) {
          const variantId = makeVariantId(v.size, v.fabric);
          const sku = `${productId}_${variantId}`;
          if (!existingSkus[sku]) {
            await setDoc(doc(db, 'inventory', sku), {
              productId, sku,
              variant: { id: variantId, size: v.size, fabric: v.fabric, color: v.color },
              quantity: 0, reserved: 0, lowStockThreshold: 3, history: [],
              updatedAt: serverTimestamp(),
            });
          }
        }
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
      {colorPickerImageIndex !== null && (
        <PhotoColorPicker
          images={images.map(img => img.dataUrl)}
          imageIndex={colorPickerImageIndex}
          onChangeImage={setColorPickerImageIndex}
          onPick={handlePickedFromPhoto}
          onClose={() => { setColorPickerImageIndex(null); setPendingVariantColorTarget(null); }}
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
                  <img src={img.dataUrl} alt="" className="h-20 w-20 border border-mist object-cover rounded-[4px]" />
                  {i === 0 ? (
                    <span className="absolute bottom-1 left-1 bg-ink/80 text-paper text-[8px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-sm">Capa</span>
                  ) : (
                    <button
                      onClick={() => makeCover(i)}
                      className="absolute bottom-1 left-1 bg-white/90 text-ink text-[8px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-sm hover:bg-white transition-colors"
                      title="Tornar capa"
                    >
                      Tornar capa
                    </button>
                  )}
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow"
                    aria-label="Remover foto"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}

              <button
                onClick={() => setShowCamera(true)}
                className="h-20 w-20 border-2 border-dashed border-clay/40 flex flex-col items-center justify-center gap-1 text-clay/70 hover:border-clay hover:text-clay transition-colors rounded-[4px]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
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

            <div className="grid grid-cols-3 gap-3">
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
                <label className="label">
                  Peso por unidade (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  placeholder="1.20"
                  inputMode="decimal"
                  className={`input ${weightKg && !weightKgValid ? 'border-red-400' : ''}`}
                />
              </div>
              <div>
                <label className="label">Categoria</label>
                <Select
                  value={category}
                  onChange={v => setCategory(v as typeof category)}
                  options={CATEGORIES.map(c => ({ value: c, label: c }))}
                />
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
              <div className="border border-dashed border-mist px-4 py-6 text-center rounded-[4px]">
                <p className="text-[12px] text-faint mb-3">Nenhuma variação ainda</p>
                <button onClick={addVariant} className="btn-outline text-[12px] px-4 py-2">
                  + Adicionar variação
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {variants.map((v, i) => (
                <div key={i} className={`border p-3.5 flex flex-col gap-3 rounded-[4px] ${duplicateVariantIndexes.has(i) ? 'border-red-300 bg-red-50/50' : 'border-mist bg-warm/40'}`}>
                  {duplicateVariantIndexes.has(i) && (
                    <p className="text-[11px] text-red-600 font-medium flex items-center gap-1.5 -mb-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Mesma combinação de tamanho e tecido de outra variação
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Tamanho</label>
                      <Select
                        value={v.size}
                        onChange={val => updateVariant(i, 'size', val)}
                        options={SIZES.map(s => ({ value: s, label: SIZE_LABEL[s] }))}
                        size="sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Tecido</label>
                      <Select
                        value={v.fabric}
                        onChange={val => updateVariant(i, 'fabric', val)}
                        options={FABRICS.map(f => ({ value: f, label: f }))}
                        size="sm"
                      />
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
                          className="w-full border border-mist px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20 rounded-[4px]"
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
              <div className="border border-mist p-4 grid grid-cols-2 gap-3 rounded-[4px]">
                <div>
                  <label className="label">Espessura do fio <span className="font-normal normal-case text-faint">(malha)</span></label>
                  <Select
                    value={yarnCount}
                    onChange={handleYarnCountChange}
                    options={[
                      { value: '', label: 'Não informar' },
                      ...YARN_COUNTS.map(y => ({ value: y, label: `Fio ${y}` })),
                    ]}
                    size="sm"
                  />
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
                className="w-4 h-4 accent-clay rounded-[3px]"
              />
              <span className="text-sm text-mid">Produto ativo (visível na loja)</span>
            </label>
          </FormSection>

          {/* ── Aviso: variações removidas que ainda têm estoque ── */}
          {isEdit && orphanedWithStock.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3 -mt-2 flex items-start gap-2.5 rounded-[4px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                {orphanedWithStock.length === 1
                  ? 'Uma variação removida ainda tem estoque cadastrado.'
                  : `${orphanedWithStock.length} variações removidas ainda têm estoque cadastrado.`} Ao salvar, esse estoque será apagado.
              </p>
            </div>
          )}

          {/* ── Ações ── */}
          <div className="flex gap-3 pt-2 pb-8">
            <button onClick={handleSubmit} disabled={saving || hasDuplicateVariants} className="btn-primary flex-1 py-3.5 text-base">
              {saving ? 'Salvando…' : hasDuplicateVariants ? 'Corrija as variações repetidas' : isEdit ? 'Salvar alterações' : 'Criar produto'}
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
