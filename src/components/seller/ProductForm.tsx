'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase/client';
import type { Product } from '@/types';

type Props = {
  initial?: Partial<Product> & { id?: string };
};

const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'];
const SIZES = ['solteiro', 'casal', 'queen', 'king'] as const;
const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King' };
const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'];
const COLORS = ['Branco', 'Bege', 'Cinza', 'Azul', 'Rosa', 'Verde', 'Preto', 'Outro'];

function makeVariantId(size: string, fabric: string, color: string) {
  return `${size}_${fabric}_${color}`.toLowerCase().replace(/\s+/g, '_');
}

export default function ProductForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? (initial.price / 100).toFixed(2) : '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(initial?.images ?? []);
  const [variants, setVariants] = useState<{ size: string; fabric: string; color: string; qty: number }[]>(
    initial?.variants?.map((v) => ({ size: v.size, fabric: v.fabric ?? '', color: v.color ?? '', qty: 0 })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addVariant = () =>
    setVariants((v) => [...v, { size: SIZES[0], fabric: FABRICS[0], color: COLORS[0], qty: 1 }]);

  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));

  const updateVariant = (i: number, field: string, value: string | number) =>
    setVariants((v) => v.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const handleSubmit = async () => {
    if (!name || !price || !category) {
      setError('Preencha nome, preço e categoria.');
      return;
    }
    if (variants.length === 0) {
      setError('Adicione pelo menos uma variação.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Upload de novas imagens
      const uploadedUrls: string[] = [];
      for (const file of imageFiles) {
        const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        uploadedUrls.push(await getDownloadURL(storageRef));
      }

      const allImages = [...existingImages, ...uploadedUrls];
      if (allImages.length === 0) {
        setError('Adicione pelo menos uma foto.');
        setSaving(false);
        return;
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
        name,
        description,
        price: priceCents,
        category,
        tags: tagArr,
        images: allImages,
        active,
        variants: builtVariants,
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await updateDoc(doc(db, 'products', initial!.id!), data);
      } else {
        // Criar produto com ID gerado
        const newRef = doc(collection(db, 'products'));
        await setDoc(newRef, { ...data, createdAt: serverTimestamp() });

        // Criar docs de inventário por variação
        for (const v of variants) {
          const variantId = makeVariantId(v.size, v.fabric, v.color);
          const sku = `${newRef.id}_${variantId}`;
          const invRef = doc(db, 'inventory', sku);
          await setDoc(invRef, {
            productId: newRef.id,
            sku,
            variant: { id: variantId, size: v.size, fabric: v.fabric, color: v.color },
            quantity: v.qty,
            reserved: 0,
            lowStockThreshold: 3,
            history: [],
            updatedAt: serverTimestamp(),
          });
        }
      }

      router.push('/painel/produtos');
    } catch (e) {
      console.error(e);
      setError('Erro ao salvar produto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {error && (
        <p className="mb-4  border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {/* Nome */}
        <div>
          <label className="label">Nome do produto</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jogo de cama queen algodão"
            className="w-full  border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="label">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Descreva o produto, material, cuidados com a lavagem..."
            className="w-full resize-none  border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
          />
        </div>

        {/* Preço + Categoria */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Preço (R$)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="49,90"
              className="w-full  border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
            />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full  border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="label">
            Tags <span className="font-normal text-faint">(separadas por vírgula)</span>
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="algodão, casal, branco"
            className="w-full  border border-mist px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
          />
        </div>

        {/* Fotos */}
        <div>
          <label className="label">Fotos</label>
          {existingImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {existingImages.map((url, i) => (
                <div key={i} className="relative">
                  <img
                    src={url}
                    alt=""
                    className="h-16 w-16  border border-mist object-cover"
                  />
                  <button
                    onClick={() => setExistingImages((imgs) => imgs.filter((_, idx) => idx !== i))}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center  bg-red-500 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
            className="text-sm text-faint"
          />
          {imageFiles.length > 0 && (
            <p className="mt-1 text-xs text-faint">{imageFiles.length} foto(s) selecionada(s)</p>
          )}
        </div>

        {/* Variações */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-mid">Variações</label>
            <button
              onClick={addVariant}
              className="text-xs font-medium text-mid hover:text-ink"
            >
              + Adicionar variação
            </button>
          </div>

          {variants.length === 0 && (
            <p className="text-xs text-faint">Nenhuma variação. Clique em + Adicionar variação.</p>
          )}

          <div className="flex flex-col gap-2">
            {variants.map((v, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2  border border-mist bg-warm p-2"
              >
                <select
                  value={v.size}
                  onChange={(e) => updateVariant(i, 'size', e.target.value)}
                  className="rounded border border-mist bg-paper px-2 py-1 text-sm"
                >
                  {SIZES.map((s) => (
                    <option key={s} value={s}>{SIZE_LABEL[s]}</option>
                  ))}
                </select>
                <select
                  value={v.fabric}
                  onChange={(e) => updateVariant(i, 'fabric', e.target.value)}
                  className="rounded border border-mist bg-paper px-2 py-1 text-sm"
                >
                  {FABRICS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <select
                  value={v.color}
                  onChange={(e) => updateVariant(i, 'color', e.target.value)}
                  className="rounded border border-mist bg-paper px-2 py-1 text-sm"
                >
                  {COLORS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {!isEdit && (
                  <input
                    type="number"
                    min={0}
                    value={v.qty}
                    onChange={(e) => updateVariant(i, 'qty', Number(e.target.value))}
                    placeholder="Qtd"
                    className="w-16 rounded border border-mist bg-paper px-2 py-1 text-sm"
                  />
                )}
                <button
                  onClick={() => removeVariant(i)}
                  className="ml-auto text-sm text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Ativo */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-mist"
          />
          <label htmlFor="active" className="text-sm text-mid">
            Produto ativo (visível na loja)
          </label>
        </div>

        {/* Ações */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
          </button>
          <button
            onClick={() => router.push('/painel/produtos')}
            className=" border border-mist px-6 py-2 text-sm font-medium text-mid transition-colors hover:bg-warm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
