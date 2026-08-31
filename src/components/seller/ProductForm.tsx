'use client';

/**
 * Cadastro de produto — v2.
 *
 * Redesenhado em cima da estrutura real dos dados: o SKU de cada variação
 * é gerado só por tamanho+tecido (ver makeVariantId), ou seja, um produto
 * SEMPRE tem um único tamanho, e cada tecido tem exatamente uma cor. O
 * form antigo escondia isso e tratava tamanho como algo por-variação,
 * obrigando a redigitar o mesmo tamanho pra cada tecido/cor adicionado.
 *
 * Mudanças principais:
 * 1. Tamanho é campo único do produto (não mais repetido por variação).
 * 2. Tecidos são chips de múltipla seleção — marcar um tecido já cria a
 *    linha (tecido + cor + estoque) na hora, sem precisar clicar
 *    "Adicionar variação" pra cada um.
 * 3. "Duplicar produto existente" — começa o cadastro a partir de um
 *    produto parecido (nome, categoria, tamanho, tecidos, peso, specs).
 * 4. Rascunho automático (localStorage) só pra criação de produto novo,
 *    recuperável se a aba fechar ou a página recarregar sem querer.
 * 5. Barra de ação fixa (sempre visível) + atalho Ctrl/Cmd+Enter salva.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, deleteDoc, collection, query, where, limit as fbLimit, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { hexToColorName, sampleDominantColor } from '@/lib/colorNames';
import { ColorPicker } from './ColorPicker';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { CATEGORIES, SIZES, SIZE_LABEL, FABRICS, YARN_COUNTS, suggestProductName, type Size } from '@/lib/productOptions';
import { formatProductName } from '@/lib/textFormat';
import { formatCurrency } from '@/lib/utils/format';
import { BrandLogo } from '@/components/BrandLogo';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStaffPrefs, setStaffPref } from '@/lib/staffPrefs';
import { getDoc } from 'firebase/firestore';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';

// Carregados só quando abertos de verdade — PhotoColorPicker,
// DefaultWeightsModal e DuplicateProductModal não são usados na maioria
// das visitas à tela (a maior parte dos cadastros nem chega a abrir
// esses popups). Em celular Android de entrada, cada KB de JS executado
// no carregamento inicial conta; adiar isso pra quando a pessoa realmente
// clica deixa a tela principal do cadastro pronta mais rápido.
const PhotoColorPicker = dynamic(() => import('./PhotoColorPicker').then(m => m.PhotoColorPicker), { ssr: false });
const DefaultWeightsModal = dynamic(() => import('./DefaultWeightsModal').then(m => m.DefaultWeightsModal), { ssr: false });
const DuplicateProductModal = dynamic(() => import('./DuplicateProductModal').then(m => m.DuplicateProductModal), { ssr: false });

/** Vibração tátil curta, só existe no Android (iOS Safari não implementa a
 * Vibration API) — confirma uma ação sem precisar checar a tela, útil
 * segurando o celular numa mão e cadastrando com a outra. Puramente
 * decorativo: se o navegador não suportar, simplesmente não faz nada. */
function tap(pattern: number | number[] = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* ignora */ }
}

type Props = {
  initial?: Partial<Product> & { id?: string };
};

function makeVariantId(size: string, fabric: string) {
  // SKU usa apenas size+fabric, cor não inclusa para evitar quebrar inventário ao trocar foto
  return `${size}_${fabric}`.toLowerCase().replace(/\s+/g, '_');
}

type ImgEntry = { dataUrl: string; blob?: Blob; url?: string };
type FabricRow = { fabric: string; color: string; colorName: string; qty: number };

const DRAFT_KEY = 'mikma:product-draft:v1';

type DraftShape = {
  name: string; nameEditedManually: boolean; description: string; price: string;
  category: string; size: Size; fronhaCount: number; tags: string; active: boolean;
  yarnCount: string; composition: string; weightGsm: string; certifications: string; specsOpen: boolean;
  weightKg: string; weightEditedManually: boolean;
  images: string[]; // só dataUrl, blob é reconstruído a partir daqui
  rows: FabricRow[];
  savedAt: number;
};

/* ───────────────────────────── Seção wrapper ───────────────────────────── */

function FormSection({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">{step}</span>
        <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">{title}</h2>
      </div>
      {hint && <p className="text-[12px] text-faint -mt-2 ml-[26px] sm:ml-[30px]">{hint}</p>}
      <div className="ml-[26px] sm:ml-[30px] flex flex-col gap-4">{children}</div>
    </section>
  );
}

/* ───────────────────────────── Form principal ──────────────────────────── */

export default function ProductForm({ initial }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [nameEditedManually, setNameEditedManually] = useState(isEdit);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? (initial.price / 100).toFixed(2) : '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [fronhaCount, setFronhaCount] = useState(initial?.fronhaCount ?? 2);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  // ── Tamanho: campo único do produto (não mais por variação) ──
  // Detecta se um produto legado tem variações de tamanhos diferentes
  // (não deveria existir, dado que o SKU já é size+fabric, mas se existir
  // por algum motivo, avisa que salvar vai unificar tudo pro tamanho
  // escolhido abaixo).
  const initialSizes = new Set((initial?.variants ?? []).map(v => v.size));
  const [size, setSize] = useState<Size>((initial?.variants?.[0]?.size as Size) ?? SIZES[0]);
  const hasMixedLegacySizes = isEdit && initialSizes.size > 1;

  // ── Sugestão de preço: tira a maior dúvida de quem não é do ramo ──
  // "quanto eu cobro?" — olha produtos parecidos (mesma categoria, de
  // preferência mesmo tamanho) já cadastrados e sugere a média. Só uma
  // sugestão clicável, nunca preenche sozinho — preço é decisão de
  // negócio, não algo pra automatizar sem confirmação.
  const [priceSuggestion, setPriceSuggestion] = useState<number | null>(null);
  useEffect(() => {
    if (isEdit || !category) { setPriceSuggestion(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Só filtro de igualdade (categoria), sem orderBy misto — não
        // precisa de índice composto novo no Firestore.
        const snap = await getDocs(query(collection(db, 'products'), where('category', '==', category), fbLimit(40)));
        if (cancelled) return;
        const sameSizePrices: number[] = [];
        const anyPrices: number[] = [];
        snap.forEach(d => {
          const data = d.data();
          if (typeof data.price !== 'number' || data.price <= 0) return;
          anyPrices.push(data.price);
          if (data.variants?.[0]?.size === size) sameSizePrices.push(data.price);
        });
        const pool = sameSizePrices.length > 0 ? sameSizePrices : anyPrices;
        if (pool.length === 0) { setPriceSuggestion(null); return; }
        setPriceSuggestion(Math.round(pool.reduce((a, b) => a + b, 0) / pool.length));
      } catch { if (!cancelled) setPriceSuggestion(null); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [category, size, isEdit]);

  const [yarnCount, setYarnCount] = useState(initial?.yarnCount ?? '');
  const [lastFabric, setLastFabric] = useState<string>(FABRICS[0]);
  useEffect(() => {
    if (isEdit || !user) return;
    getStaffPrefs(user.uid).then(prefs => {
      if (prefs.lastYarnCount) setYarnCount(prefs.lastYarnCount);
      if (prefs.lastFabric) setLastFabric(prefs.lastFabric);
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

  // ── Peso: auto-preenchido pelo tamanho selecionado (padrão configurável) ──
  const [weightKg, setWeightKg] = useState(initial?.weightKg ? String(initial.weightKg) : '');
  const [weightEditedManually, setWeightEditedManually] = useState(isEdit || !!initial?.weightKg);
  const [justAutoUpdatedWeight, setJustAutoUpdatedWeight] = useState(false);
  const [defaultWeightsBySize, setDefaultWeightsBySize] = useState<StoreSettings['defaultWeightsBySize']>(STORE_DEFAULTS.defaultWeightsBySize);
  const [weightsModalOpen, setWeightsModalOpen] = useState(false);
  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then(snap => {
      const data = snap.exists() ? snap.data() : {};
      if (data.defaultWeightsBySize) setDefaultWeightsBySize({ ...STORE_DEFAULTS.defaultWeightsBySize, ...data.defaultWeightsBySize });
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (weightEditedManually) return;
    const suggested = defaultWeightsBySize[size as keyof typeof defaultWeightsBySize];
    if (!suggested) return;
    setWeightKg(String(suggested));
    setJustAutoUpdatedWeight(true);
    const t = setTimeout(() => setJustAutoUpdatedWeight(false), 900);
    return () => clearTimeout(t);
  }, [size, weightEditedManually, defaultWeightsBySize]);

  const [images, setImages] = useState<ImgEntry[]>(
    (initial?.images ?? []).map(url => ({ dataUrl: url, url }))
  );
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);

  // ── Tecidos: chips de múltipla seleção. Marcar um tecido cria a linha
  // (fabric+color+qty) na hora; desmarcar remove — mas guarda a cor/qty
  // que a pessoa já tinha digitado (qtyMemory) caso marque de novo.
  const initialRows: FabricRow[] = (initial?.variants ?? []).map(v => ({
    fabric: v.fabric ?? FABRICS[0],
    color: v.color || '#E8DCC8',
    colorName: v.colorName || hexToColorName(v.color || '#E8DCC8'),
    qty: 0,
  }));
  const [rows, setRows] = useState<FabricRow[]>(initialRows);
  const rowMemory = useRef<Map<string, FabricRow>>(new Map(initialRows.map(r => [r.fabric, r])));
  const [autoColoredFabrics, setAutoColoredFabrics] = useState<Set<string>>(new Set());

  function toggleFabric(fabric: string) {
    tap();
    setRows(prev => {
      const exists = prev.some(r => r.fabric === fabric);
      if (exists) {
        // Guarda o estado atual antes de remover, pra devolver se marcar de novo
        const row = prev.find(r => r.fabric === fabric);
        if (row) rowMemory.current.set(fabric, row);
        return prev.filter(r => r.fabric !== fabric);
      }
      const remembered = rowMemory.current.get(fabric);
      const fallbackHex = '#E8DCC8';
      const newRow: FabricRow = remembered ?? {
        fabric,
        color: fallbackHex,
        colorName: hexToColorName(fallbackHex),
        qty: 1,
      };
      // Se não tinha memória (tecido novo pra essa sessão) e já existe
      // foto, tenta adivinhar a cor sozinho a partir da capa — a pessoa
      // não precisa saber que existe um jeito de "pegar cor da foto",
      // já vem pronto, só ajusta se não bater.
      if (!remembered && images[0]) {
        sampleDominantColor(images[0].dataUrl).then(hex => {
          if (!hex) return;
          const name = hexToColorName(hex);
          setRows(cur => cur.map(r => r.fabric === fabric && r.color === fallbackHex ? { ...r, color: hex, colorName: name } : r));
          setAutoColoredFabrics(cur => new Set(cur).add(fabric));
        }).catch(() => {});
      }
      return [...prev, newRow];
    });
  }

  function updateRow(fabric: string, patch: Partial<FabricRow>) {
    setRows(prev => prev.map(r => r.fabric === fabric ? { ...r, ...patch } : r));
    if (patch.color) setAutoColoredFabrics(cur => { const next = new Set(cur); next.delete(fabric); return next; });
  }

  const [showCamera, setShowCamera] = useState(false);
  const [colorPickerImageIndex, setColorPickerImageIndex] = useState<number | null>(null);
  const [pendingColorTargetFabric, setPendingColorTargetFabric] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const currentNameSuggestion = suggestProductName({
    category: category as typeof CATEGORIES[number],
    size,
    fronhaCount: category === 'Jogos de cama' ? fronhaCount : undefined,
  });

  const [justAutoUpdated, setJustAutoUpdated] = useState(false);
  useEffect(() => {
    if (nameEditedManually) return;
    setName(currentNameSuggestion);
    setJustAutoUpdated(true);
    const t = setTimeout(() => setJustAutoUpdated(false), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNameSuggestion, nameEditedManually]);

  /* ───────────────────────── Rascunho automático ───────────────────────── */
  // Só pra criação de produto novo (edição sempre parte do doc real, não
  // faz sentido "recuperar rascunho" ali). Salva com debounce no
  // localStorage, oferece recuperar ao abrir a tela em branco, e apaga ao
  // salvar com sucesso ou ao descartar explicitamente.
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftShape | null>(null);
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setPendingDraft(JSON.parse(raw));
    } catch { /* localStorage indisponível ou JSON corrompido, ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreDraft() {
    if (!pendingDraft) return;
    const d = pendingDraft;
    setName(d.name); setNameEditedManually(d.nameEditedManually);
    setDescription(d.description); setPrice(d.price);
    setCategory(d.category as typeof CATEGORIES[number]); setSize(d.size);
    setFronhaCount(d.fronhaCount); setTags(d.tags); setActive(d.active);
    setYarnCount(d.yarnCount); setComposition(d.composition);
    setWeightGsm(d.weightGsm); setCertifications(d.certifications); setSpecsOpen(d.specsOpen);
    setWeightKg(d.weightKg); setWeightEditedManually(d.weightEditedManually);
    setRows(d.rows);
    // dataURL -> Blob de novo, pra poder subir pro Storage no submit
    const restoredImages = await Promise.all(d.images.map(async dataUrl => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        return { dataUrl, blob } as ImgEntry;
      } catch { return null; }
    }));
    setImages(restoredImages.filter((i): i is ImgEntry => !!i));
    draftRestoredRef.current = true;
    setPendingDraft(null);
    setDraftBannerDismissed(true);
  }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignora */ }
    setPendingDraft(null);
    setDraftBannerDismissed(true);
  }

  // Autosave com debounce — não salva enquanto o banner de "recuperar
  // rascunho anterior" ainda não foi resolvido (evita sobrescrever o
  // rascunho antigo antes da pessoa decidir usá-lo ou não).
  useEffect(() => {
    if (isEdit || (pendingDraft && !draftRestoredRef.current)) return;
    const hasContent = name || description || price || images.length > 0 || rows.length > 0;
    if (!hasContent) return;
    const t = setTimeout(() => {
      const draft: DraftShape = {
        name, nameEditedManually, description, price, category, size, fronhaCount, tags, active,
        yarnCount, composition, weightGsm, certifications, specsOpen,
        weightKg, weightEditedManually,
        images: images.map(i => i.dataUrl),
        rows, savedAt: Date.now(),
      };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota cheia ou indisponível, ignora silenciosamente */ }
    }, 600);
    return () => clearTimeout(t);
  }, [isEdit, pendingDraft, name, nameEditedManually, description, price, category, size, fronhaCount, tags, active, yarnCount, composition, weightGsm, certifications, specsOpen, weightKg, weightEditedManually, images, rows]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignora */ }
  }

  /* ─────────────────────── Duplicar produto existente ──────────────────── */
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  function applyDuplicateSource(p: Product) {
    setName(p.name + ' (cópia)'); setNameEditedManually(true);
    setDescription(p.description ?? '');
    setPrice(p.price ? (p.price / 100).toFixed(2) : '');
    setCategory((p.category as typeof CATEGORIES[number]) ?? CATEGORIES[0]);
    if (p.variants?.[0]?.size) setSize(p.variants[0].size as Size);
    if (p.fronhaCount) setFronhaCount(p.fronhaCount);
    setTags(p.tags?.join(', ') ?? '');
    setYarnCount(p.yarnCount ?? '');
    setComposition(p.composition ?? '');
    setWeightGsm(p.weightGsm ? String(p.weightGsm) : '');
    setCertifications(p.certifications?.join(', ') ?? '');
    setSpecsOpen(!!(p.yarnCount || p.composition || p.weightGsm || p.certifications?.length));
    if (p.weightKg) { setWeightKg(String(p.weightKg)); setWeightEditedManually(true); }
    // Copia os tecidos (linhas), mas NUNCA fotos/cor/estoque — cada produto
    // novo tem lote e fotos próprios, mesmo partindo de um "parecido".
    const newRows: FabricRow[] = (p.variants ?? []).map(v => ({
      fabric: v.fabric ?? FABRICS[0],
      color: '#E8DCC8',
      colorName: hexToColorName('#E8DCC8'),
      qty: 1,
    }));
    setRows(newRows);
    rowMemory.current = new Map(newRows.map(r => [r.fabric, r]));
    setDuplicateModalOpen(false);
  }

  function handlePhotosCaptured(photos: { dataUrl: string; blob: Blob }[]) {
    setImages(prev => [...prev, ...photos]);
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

  function openColorFromPhoto(fabric: string) {
    if (images.length === 0) return;
    setPendingColorTargetFabric(fabric);
    setColorPickerImageIndex(0);
  }

  function handlePickedFromPhoto(hex: string, colorName: string) {
    if (pendingColorTargetFabric !== null) {
      updateRow(pendingColorTargetFabric, { color: hex, colorName });
    }
    setColorPickerImageIndex(null);
    setPendingColorTargetFabric(null);
  }

  const priceValid = !!price && !isNaN(parseFloat(price.replace(',', '.')));
  const weightKgValid = !!weightKg && !isNaN(parseFloat(weightKg)) && parseFloat(weightKg) > 0;

  // ── Checklist de progresso: orienta quem não conhece o formulário sobre
  // onde está e quanto falta, sem precisar rolar a tela pra descobrir o
  // que ainda não preencheu. Aparece fixo no topo.
  const steps = [
    { label: 'Fotos', done: images.length > 0 },
    { label: 'Informações', done: !!name.trim() && priceValid && weightKgValid },
    { label: 'Tecidos', done: rows.length > 0 },
  ];
  const stepsDone = steps.filter(s => s.done).length;

  const currentSkuSet = new Set(rows.map(r => makeVariantId(size, r.fabric)));
  const orphanedSkus = isEdit
    ? Object.keys(existingSkus).filter(sku => !currentSkuSet.has(sku.replace(`${initial?.id}_`, '')))
    : [];
  const orphanedWithStock = orphanedSkus.filter(sku => {
    const s = existingSkus[sku];
    return s && (s.quantity > 0 || s.reserved > 0);
  });

  const [successToast, setSuccessToast] = useState('');

  async function handleSubmit(mode: 'list' | 'another' = 'list') {
    if (!name.trim()) { setError('Dê um nome para o produto.'); return; }
    if (!priceValid) { setError('Informe um preço válido.'); return; }
    if (!weightKgValid) { setError('Informe o peso do produto em kg (ex: 1.2).'); return; }
    if (images.length === 0) { setError('Adicione pelo menos uma foto.'); return; }
    if (rows.length === 0) { setError('Marque pelo menos um tecido disponível.'); return; }

    setSaving(true);
    setError('');
    try {
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
      const builtVariants = rows.map(({ fabric, color, colorName }) => ({
        id: makeVariantId(size, fabric),
        size,
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
        ...(category === 'Jogos de cama' ? { fronhaCount } : {}),
      };

      if (isEdit) {
        const productId = initial!.id!;

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

        for (const sku of orphanedSkus) {
          await deleteDoc(doc(db, 'inventory', sku)).catch(() => {});
        }

        for (const r of rows) {
          const variantId = makeVariantId(size, r.fabric);
          const sku = `${productId}_${variantId}`;
          if (!existingSkus[sku]) {
            await setDoc(doc(db, 'inventory', sku), {
              productId, sku,
              variant: { id: variantId, size, fabric: r.fabric, color: r.color },
              quantity: 0, reserved: 0, lowStockThreshold: 3, history: [],
              updatedAt: serverTimestamp(),
            });
          }
        }
      } else {
        const newRef = doc(collection(db, 'products'));
        await setDoc(newRef, { ...data, createdAt: serverTimestamp() });
        for (const r of rows) {
          const variantId = makeVariantId(size, r.fabric);
          const sku = `${newRef.id}_${variantId}`;
          await setDoc(doc(db, 'inventory', sku), {
            productId: newRef.id, sku,
            variant: { id: variantId, size, fabric: r.fabric, color: r.color },
            quantity: r.qty, reserved: 0, lowStockThreshold: 3, history: [],
            updatedAt: serverTimestamp(),
          });
        }
      }
      clearDraft();
      if (mode === 'another' && !isEdit) {
        // Cadastro em lote: mantém categoria/tamanho/tecidos/especificações
        // (o que costuma se repetir entre produtos parecidos cadastrados
        // em sequência), limpa só o que é específico deste item — nome,
        // fotos, preço, cores e quantidades.
        tap([12, 40, 12]);
        setSuccessToast(`"${data.name}" criado!`);
        setTimeout(() => setSuccessToast(''), 3000);
        setName(''); setNameEditedManually(false);
        setDescription('');
        setPrice('');
        setImages([]);
        setRemovedUrls([]);
        const resetRows = rows.map(r => ({ fabric: r.fabric, color: '#E8DCC8', colorName: hexToColorName('#E8DCC8'), qty: 1 }));
        setRows(resetRows);
        rowMemory.current = new Map(resetRows.map(r => [r.fabric, r]));
        setTags('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        tap();
        router.push('/painel/produtos');
      }
    } catch (e) {
      console.error(e);
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  // Atalho Ctrl/Cmd+Enter salva de qualquer lugar da tela — evita ter que
  // rolar até o fim depois de preencher tudo.
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;
  const canSubmitRef = useRef(true);
  canSubmitRef.current = !saving;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmitRef.current) {
        e.preventDefault();
        handleSubmitRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {showCamera && (
        <PhotoCaptureModal onDone={handlePhotosCaptured} onClose={() => setShowCamera(false)} />
      )}
      {colorPickerImageIndex !== null && (
        <PhotoColorPicker
          images={images.map(img => img.dataUrl)}
          imageIndex={colorPickerImageIndex}
          onChangeImage={setColorPickerImageIndex}
          onPick={handlePickedFromPhoto}
          onClose={() => { setColorPickerImageIndex(null); setPendingColorTargetFabric(null); }}
        />
      )}
      {weightsModalOpen && (
        <DefaultWeightsModal
          current={defaultWeightsBySize}
          onClose={() => setWeightsModalOpen(false)}
          onSaved={next => {
            setDefaultWeightsBySize(next);
            if (!weightEditedManually) {
              const updated = next[size as keyof typeof next];
              if (updated) setWeightKg(String(updated));
            }
          }}
        />
      )}
      {duplicateModalOpen && (
        <DuplicateProductModal onPick={applyDuplicateSource} onClose={() => setDuplicateModalOpen(false)} />
      )}

      <div className="max-w-xl mx-auto px-4 sm:px-0 pb-40">
        {/* ── Checklist de progresso — orienta quem não conhece o formulário ── */}
        {!isEdit && (
          <div className="mb-5 flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-1.5 flex-1">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors ${
                    s.done ? 'bg-clay text-paper' : 'bg-mist text-faint'
                  }`}>
                    {s.done ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                    ) : (i + 1)}
                  </span>
                  <span className={`text-[11px] font-medium whitespace-nowrap ${s.done ? 'text-ink' : 'text-faint'}`}>{s.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`h-[2px] flex-1 rounded-full ${s.done ? 'bg-clay/40' : 'bg-mist'}`} />}
              </div>
            ))}
            </div>
            <span className="text-[10px] text-faint font-mono shrink-0">{stepsDone}/{steps.length}</span>
          </div>
        )}

        {!isEdit && pendingDraft && !draftBannerDismissed && (
          <div className="mb-5 border border-clay/30 bg-clay/5 px-4 py-3 rounded-[4px] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px] text-ink">
              Encontramos um rascunho não finalizado{pendingDraft.name ? ` de "${pendingDraft.name}"` : ''}.
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={restoreDraft} className="text-[12px] font-semibold text-clay hover:text-clay-d">Continuar rascunho</button>
              <button onClick={discardDraft} className="text-[12px] font-semibold text-faint hover:text-mid">Descartar</button>
            </div>
          </div>
        )}

        {!isEdit && (
          <button
            type="button"
            onClick={() => setDuplicateModalOpen(true)}
            className="mb-5 w-full border border-dashed border-mist hover:border-clay/50 hover:bg-clay/5 transition-colors rounded-[4px] px-4 py-2.5 flex items-center justify-center gap-2 text-[12px] font-semibold text-mid hover:text-clay"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Duplicar de um produto existente
          </button>
        )}

        {hasMixedLegacySizes && (
          <div className="mb-5 border border-amber-300 bg-amber-50 px-4 py-3 rounded-[4px]">
            <p className="text-[12px] text-amber-800 leading-relaxed">
              Este produto tem variações com tamanhos diferentes cadastradas de um jeito antigo. Ao salvar, todas as variações passam a usar o tamanho escolhido abaixo.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2 rounded-[4px]">
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
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                    aria-label="Remover foto"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
              <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-1">
                <label className="label mb-0">Nome do produto</label>
                {nameEditedManually && currentNameSuggestion && name !== currentNameSuggestion && (
                  <button
                    type="button"
                    onClick={() => { setName(currentNameSuggestion); setNameEditedManually(false); }}
                    className="flex items-center gap-1 text-[11px] text-clay hover:text-ink transition-colors font-medium"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
                    </svg>
                    Usar sugestão automática
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setNameEditedManually(true); }}
                  placeholder="Jogo de cama queen algodão"
                  className={`input ${!nameEditedManually && name ? 'pr-9' : ''} ${justAutoUpdated ? 'bg-clay/[0.06] border-clay/40' : ''}`}
                />
                {!nameEditedManually && name && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-clay/70 pointer-events-none"
                    title="Preenchido automaticamente"
                    aria-hidden="true"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 3 11 6.5 14.5 8 11 9.5 9.5 13 8 9.5 4.5 8 8 6.5 9.5 3Z"/>
                      <path d="M18.5 13 19.5 15.5 22 16.5 19.5 17.5 18.5 20 17.5 17.5 15 16.5 17.5 15.5 18.5 13Z"/>
                    </svg>
                  </span>
                )}
              </div>
              {!nameEditedManually && name && (
                <p className="text-[11px] text-faint mt-1" aria-live="polite">
                  Preenchido automaticamente a partir da categoria{category === 'Jogos de cama' ? ', tamanho e fronhas' : ' e tamanho'}. Pode editar à vontade.
                </p>
              )}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Preço (R$)</label>
                <input
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="49,90"
                  inputMode="decimal"
                  className={`input ${price && !priceValid ? 'border-red-400' : ''}`}
                />
                {priceSuggestion !== null && !price && (
                  <button
                    type="button"
                    onClick={() => setPrice((priceSuggestion / 100).toFixed(2))}
                    className="text-[11px] text-clay hover:text-clay-d font-medium mt-1 flex items-center gap-1"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    Sugestão: R$ {(priceSuggestion / 100).toFixed(2)} <span className="text-faint font-normal">(baseado em produtos parecidos)</span>
                  </button>
                )}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Tamanho</label>
                <Select
                  value={size}
                  onChange={v => setSize(v as Size)}
                  options={SIZES.map(s => ({ value: s, label: SIZE_LABEL[s] }))}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">
                    Peso por unidade (kg) <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setWeightsModalOpen(true)}
                    className="text-[10px] font-semibold text-clay hover:text-clay-d whitespace-nowrap"
                  >
                    Editar padrões
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={weightKg}
                    onChange={e => { setWeightKg(e.target.value); setWeightEditedManually(true); }}
                    placeholder="1.20"
                    inputMode="decimal"
                    className={`input ${weightKg && !weightKgValid ? 'border-red-400' : ''} ${justAutoUpdatedWeight ? 'bg-clay/[0.06] border-clay/40' : ''}`}
                  />
                  {!weightEditedManually && weightKg && (
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-clay/70 pointer-events-none"
                      title="Preenchido a partir do padrão desse tamanho"
                      aria-hidden="true"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 3 11 6.5 14.5 8 11 9.5 9.5 13 8 9.5 4.5 8 8 6.5 9.5 3Z"/>
                        <path d="M18.5 13 19.5 15.5 22 16.5 19.5 17.5 18.5 20 17.5 17.5 15 16.5 17.5 15.5 18.5 13Z"/>
                      </svg>
                    </span>
                  )}
                </div>
                {!weightEditedManually && weightKg && (
                  <p className="text-[11px] text-faint mt-1">Padrão do tamanho selecionado</p>
                )}
              </div>
            </div>

            {category === 'Jogos de cama' && (
              <div>
                <label className="label">
                  Quantas fronhas vêm no jogo? <span className="font-normal normal-case text-faint">(solteiro/berço geralmente 1, casal/queen/king geralmente 2)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={fronhaCount}
                  onChange={e => setFronhaCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input-sm w-24"
                />
                <p className="text-[11px] text-faint mt-1">
                  Usado pra reservar a quantidade certa de estoque quando o cliente troca a fronha padrão do jogo por outra do catálogo.
                </p>
              </div>
            )}

            <div>
              <label className="label">Tags <span className="font-normal normal-case text-faint">(separadas por vírgula)</span></label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="algodão, casal, branco"
                className="input"
              />
            </div>

            {/* ── Prévia ao vivo — pra quem não é técnico, ver como vai
                aparecer pro cliente é mais confiável que confiar nos
                campos abstratos do formulário. Atualiza junto com o
                preenchimento, sem precisar publicar pra conferir. ── */}
            {(images[0] || name || price) && (
              <div>
                <p className="text-[10px] text-faint font-semibold tracking-[0.12em] uppercase mb-2">É assim que vai aparecer na loja</p>
                <div className="border border-mist bg-paper w-40 rounded-[4px] overflow-hidden shadow-sm">
                  <div className="relative aspect-[3/4] bg-warm">
                    {images[0] ? (
                      <img src={images[0].dataUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BrandLogo alt="" className="w-14 h-auto opacity-[0.12]" />
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 pt-2.5 pb-3">
                    <p className="text-[10.5px] font-medium text-ink leading-snug line-clamp-2 mb-1.5 min-h-[2.4em]">
                      {name || 'Nome do produto'}
                    </p>
                    <p className="font-display text-[0.95rem] text-ink font-normal leading-none tracking-[-0.01em]">
                      {priceValid ? formatCurrency(Math.round(parseFloat(price.replace(',', '.')) * 100)) : 'R$ —'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </FormSection>

          {/* ── 3. Tecidos e cores ── */}
          <FormSection
            step={3}
            title="Tecidos disponíveis"
            hint="Marque os tecidos que esse produto tem — cada um vira uma linha de estoque, com uma cor"
          >
            <div className="flex flex-wrap gap-1.5">
              {FABRICS.map(f => {
                const on = rows.some(r => r.fabric === f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFabric(f)}
                    className={`px-3.5 py-2.5 text-[13px] font-medium rounded-full border transition-colors ${
                      on ? 'bg-ink text-paper border-ink' : 'border-mist text-mid hover:border-clay/50 hover:text-clay'
                    }`}
                  >
                    {on && '✓ '}{f}
                  </button>
                );
              })}
            </div>

            {rows.length === 0 && (
              <p className="text-[12px] text-faint border border-dashed border-mist px-4 py-4 text-center rounded-[4px]">
                Marque ao menos um tecido acima pra continuar
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              {rows.map(r => (
                <div key={r.fabric} className="border border-mist bg-warm/40 p-3.5 flex flex-col gap-3 rounded-[4px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-ink">{r.fabric}</span>
                    <button
                      onClick={() => toggleFabric(r.fabric)}
                      className="text-red-400 hover:text-red-600 transition-colors w-9 h-9 flex items-center justify-center shrink-0 -mr-1.5"
                      aria-label={`Remover ${r.fabric}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-faint block font-semibold tracking-[0.1em] uppercase">Cor</label>
                        {images.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openColorFromPhoto(r.fabric)}
                            className="text-[10px] font-semibold text-clay hover:text-clay-d flex items-center gap-1"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            Pegar da foto
                          </button>
                        )}
                      </div>
                      <ColorPicker
                        value={r.color}
                        colorName={r.colorName}
                        onChange={(hex, colorName) => updateRow(r.fabric, { color: hex, colorName })}
                      />
                      {autoColoredFabrics.has(r.fabric) && (
                        <p className="text-[10.5px] text-clay/80 mt-1 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          Cor detectada da foto — ajuste se não bateu
                        </p>
                      )}
                    </div>

                    {!isEdit && (
                      <div className="w-24">
                        <label className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Estoque</label>
                        <input
                          type="number"
                          min={0}
                          value={r.qty}
                          onChange={e => updateRow(r.fabric, { qty: Number(e.target.value) })}
                          inputMode="numeric"
                          className="w-full border border-mist px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20 rounded-[4px]"
                        />
                      </div>
                    )}
                  </div>
                  {isEdit && (
                    <p className="text-[11px] text-faint">Estoque é gerenciado na página Estoque</p>
                  )}
                </div>
              ))}
            </div>
          </FormSection>

          {/* ── 4. Especificações do tecido (colapsável) ── */}
          <FormSection step={4} title="Especificações do tecido" hint="Opcional, aparece na página do produto">
            <button
              type="button"
              onClick={() => setSpecsOpen(o => !o)}
              className="self-start flex items-center gap-1.5 text-[12px] font-semibold text-mid hover:text-ink transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${specsOpen ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
              {specsOpen ? 'Ocultar especificações' : 'Adicionar especificações'}
            </button>

            {specsOpen && (
              <div className="border border-mist p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-[4px]">
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
        </div>
      </div>

      {/* Toast de sucesso — só aparece no fluxo "cadastrar outro", já que
          não há navegação de página que sirva de confirmação nesse caso */}
      {successToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-full text-[13px] font-medium shadow-lg flex items-center gap-2 transition-opacity duration-200">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          {successToast}
        </div>
      )}

      {/* ── Barra de ação fixa — sempre visível, sem precisar rolar até o fim ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-paper/95 backdrop-blur border-t border-mist z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto px-4 py-3 flex flex-col gap-2">
          <div className="flex gap-3 items-center">
            <button onClick={() => handleSubmit('list')} disabled={saving} className="btn-primary flex-1 py-3.5 sm:py-3 text-[15px]">
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
            </button>
            <button onClick={() => router.push('/painel/produtos')} className="border border-mist px-4 py-3.5 sm:py-3 text-sm font-medium text-mid hover:bg-warm transition-colors rounded-[4px] shrink-0">
              Cancelar
            </button>
            <span className="hidden sm:inline text-[10px] text-faint whitespace-nowrap">⌘/Ctrl + Enter</span>
          </div>
          {!isEdit && (
            <button
              onClick={() => handleSubmit('another')}
              disabled={saving}
              className="text-[12.5px] font-semibold text-clay hover:text-clay-d py-1 flex items-center justify-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              Criar e cadastrar outro produto
            </button>
          )}
        </div>
      </div>
    </>
  );
}
