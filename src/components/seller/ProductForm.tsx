'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/client';
import type { Product } from '@/types';

type Props = {
  initial?: Partial<Product> & { id?: string };
};

const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'];
const SIZES = ['Solteiro', 'Casal', 'Queen', 'King'];
const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'];
const COLORS = ['Branco', 'Bege', 'Cinza', 'Azul', 'Rosa', 'Verde', 'Preto', 'Outro'];

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
    initial?.variants?.map((v: { size: string; fabric: string; color: string }) => ({ ...v, qty: 0 })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addVariant = () => {
    setVariants(v => [...v, { size: SIZES[0], fabric: FABRICS[0], color: COLORS[0], qty: 1 }]);
  };

  const removeVariant = (i: number) => setVariants(v => v.filter((_, idx) => idx !== i));

  const updateVariant = (i: number, field: string, value: string | number) => {
    setVariants(v => v.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!name || !price || !category) { setError('Preencha nome, preço e categoria.'); return; }
    setSaving(true);
    setError('');
    try {
      // upload new images
      const uploadedUrls: string[] = [];
      for (const file of imageFiles) {
        const r = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        uploadedUrls.push(await getDownloadURL(r));
      }

      const allImages = [...existingImages, ...uploadedUrls];
      const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100);
      const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);

      const data = {
        name,
        description,
        price: priceCents,
        category,
        tags: tagArr,
        images: allImages,
        active,
        variants: variants.map(({ size, fabric, color }) => ({ size, fabric, color })),
      };

      if (isEdit) {
        await updateDoc(doc(db, 'products', initial!.id!), data);
      } else {
        const prodRef = await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
        // create inventory docs per variant
        for (const v of variants) {
          const sku = `${prodRef.id}_${v.size}_${v.fabric}_${v.color}`.replace(/\s+/g, '_');
          await addDoc(collection(db, 'inventory'), {
            productId: prodRef.id,
            sku,
            variant: { size: v.size, fabric: v.fabric, color: v.color },
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
      setError('Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do produto</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$)</label>
            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="49,90"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags (separadas por vírgula)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="algodão, casal, branco"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fotos</label>
          {existingImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {existingImages.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  <button onClick={() => setExistingImages(imgs => imgs.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">×</button>
                </div>
              ))}
            </div>
          )}
          <input type="file" multiple accept="image/*" onChange={e => setImageFiles(Array.from(e.target.files ?? []))}
            className="text-sm text-gray-500" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Variações</label>
            <button onClick={addVariant} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Adicionar</button>
          </div>
          {variants.length === 0 && <p className="text-xs text-gray-400">Nenhuma variação. Clique em + Adicionar.</p>}
          {variants.map((v, i) => (
            <div key={i} className="flex gap-2 items-center mb-2 flex-wrap">
              <select value={v.size} onChange={e => updateVariant(i, 'size', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={v.fabric} onChange={e => updateVariant(i, 'fabric', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {FABRICS.map(f => <option key={f}>{f}</option>)}
              </select>
              <select value={v.color} onChange={e => updateVariant(i, 'color', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {COLORS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="number" min={0} value={v.qty} onChange={e => updateVariant(i, 'qty', Number(e.target.value))}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Qtd" />
              <button onClick={() => removeVariant(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="active" checked={active} onChange={e => setActive(e.target.checked)}
            className="rounded border-gray-300" />
          <label htmlFor="active" className="text-sm text-gray-700">Produto ativo (visível na loja)</label>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSubmit} disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar produto'}
          </button>
          <button onClick={() => router.push('/painel/produtos')}
            className="border border-gray-300 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
