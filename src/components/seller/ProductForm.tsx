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
 * 2. Tecido é sempre malha 100% algodão: o produto novo já vem com a linha
 *    (cor + estoque) pronta, sem escolher tecido.
 * 3. "Duplicar produto existente" — começa o cadastro a partir de um
 *    produto parecido (nome, categoria, tamanho, tecidos, peso, specs).
 * 4. Rascunho automático (localStorage) só pra criação de produto novo,
 *    recuperável se a aba fechar ou a página recarregar sem querer.
 * 5. Barra de ação fixa (sempre visível) + atalho Ctrl/Cmd+Enter salva.
 * 6. Produto novo é um passo a passo (Fotos → O que é → Nome e preço →
 *    Conferir) e termina numa tela de sucesso; a edição é uma página só.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { parseBRL, centsToInput, maskBRL } from '@/lib/parseBRL';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, setDoc, deleteDoc, collection, query, where, limit as fbLimit, getDocs, type DocumentReference } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db } from '@/lib/firebase/db';
import { storage } from '@/lib/firebase/storage';
import type { Product } from '@/types';
import { hexToColorName, sampleDominantColor, TEXTILE_COLORS } from '@/lib/colorNames';
import { colorKey, formatColorName, matchColorName, sortBySimilarity } from '@/lib/colorNameMatch';
import { ColorNameField, type ColorCheck } from './ColorNameField';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { CATEGORIES, SIZES, SIZE_LABEL, FABRICS, FABRIC_LABEL, DEFAULT_COMPOSITION, suggestProductName, suggestProductDescription, type Size } from '@/lib/productOptions';
import { formatProductName } from '@/lib/textFormat';
import { formatCurrency } from '@/lib/utils/format';
import { BrandLogo } from '@/components/BrandLogo';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStaffPrefs, setStaffPref } from '@/lib/staffPrefs';
import { getDoc } from 'firebase/firestore';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';
import { IconAlert } from '@/components/ui/Icon';
import { Stepper } from '@/components/ui/Stepper';
import { PRODUCT_DRAFT_KEY } from '@/lib/productDraft';

// id do campo da cor: o nome do tecido tem espaços ("Percal 200 fios"), e id com espaço é inválido.
const colorFieldId = (fabric: string) => `prod-cor-${fabric.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;

// Carregados só quando abertos de verdade — DefaultWeightsModal e DuplicateProductModal não são usados na maioria
// das visitas à tela (a maior parte dos cadastros nem chega a abrir
// esses popups). Em celular Android de entrada, cada KB de JS executado
// no carregamento inicial conta; adiar isso pra quando a pessoa realmente
// clica deixa a tela principal do cadastro pronta mais rápido.
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

const DRAFT_KEY = PRODUCT_DRAFT_KEY;

type DraftShape = {
  name: string; nameEditedManually: boolean; description: string; price: string;
  category: string; size: Size; fronhaCount: number; tags: string; active: boolean;
  yarnCount: string; composition: string; weightGsm: string; certifications: string; specsOpen: boolean;
  weightKg: string; weightEditedManually: boolean; weightTypedByHand: boolean;
  images: string[]; // só dataUrl, blob é reconstruído a partir daqui
  rows: FabricRow[];
  savedAt: number;
};

const defaultFronhas = (size: string) => (size === 'solteiro' || size === 'berco' ? 1 : 2);

/* ───────────────────────────── Seção wrapper ───────────────────────────── */

function FormSection({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">{step}</span>
        <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">{title}</h2>
      </div>
      {hint && <p className="text-[12px] text-faint -mt-2 ml-0 sm:ml-[30px]">{hint}</p>}
      <div className="ml-0 sm:ml-[30px] flex flex-col gap-4">{children}</div>
    </section>
  );
}

/* ───────────────────────────── Form principal ──────────────────────────── */

export default function ProductForm({ initial }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isEdit = !!initial?.id;
  // Edição sem salvar pergunta antes de sair pela barra de baixo ou pelo
  // menu. Produto novo não precisa: o rascunho fica salvo no aparelho.
  const [touched, setTouched] = useState(false);
  // Na fase de "bolha", depois do onChange do campo: na fase de captura o
  // re-render vinha antes e o React devolvia o valor antigo ao campo (o
  // primeiro caractere digitado no formulário sumia).
  const markTouched = () => { if (!touched) setTouched(true); };

  const [name, setName] = useState(initial?.name ?? '');
  const [nameEditedManually, setNameEditedManually] = useState(isEdit);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? centsToInput(initial.price) : '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
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

  // Fronhas do Jogo de Cama: segue o tamanho (berço e solteiro vêm com 1,
  // o resto com 2) até alguém mudar à mão em "Mudar".
  const [fronhaOverride, setFronhaOverride] = useState<number | null>(
    initial?.fronhaCount && initial.fronhaCount !== defaultFronhas(size) ? initial.fronhaCount : null,
  );
  const fronhaCount = fronhaOverride ?? defaultFronhas(size);
  const setFronhaCount = (n: number) => setFronhaOverride(n);
  const [fronhaOpen, setFronhaOpen] = useState(fronhaOverride !== null);

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
  useEffect(() => {
    if (isEdit || !user) return;
    getStaffPrefs(user.uid).then(prefs => {
      if (prefs.lastYarnCount) setYarnCount(prefs.lastYarnCount);
      // Pré-carrega categoria, tamanho e tecidos do último produto
      // cadastrado por essa pessoa — não só dentro do mesmo lote (isso já
      // existia via "cadastrar outro"), mas também ao abrir a tela do
      // zero em outro dia. A maioria de quem cadastra em volume trabalha
      // em rajadas do mesmo tipo de produto, então começar já perto do
      // que a pessoa provavelmente quer poupa a repetição inteira dessas
      // escolhas — só ajusta o que muda (foto, nome, preço, cor).
      if (prefs.lastCategory && (CATEGORIES as readonly string[]).includes(prefs.lastCategory)) {
        setCategory(prefs.lastCategory as typeof CATEGORIES[number]);
      }
      if (prefs.lastSize && (SIZES as readonly string[]).includes(prefs.lastSize)) {
        setSize(prefs.lastSize as Size);
      }
    }).catch(() => {});
  }, [isEdit, user]);

  function handleYarnCountChange(v: string) {
    setYarnCount(v);
    if (user) setStaffPref(user.uid, 'lastYarnCount', v).catch(() => {});
  }

  // Produto novo já sai com a composição (todo produto é malha 100% algodão).
  const [composition, setComposition] = useState(initial?.composition ?? (isEdit ? '' : DEFAULT_COMPOSITION));
  const [weightGsm, setWeightGsm] = useState(initial?.weightGsm ? String(initial.weightGsm) : '');
  const [certifications, setCertifications] = useState(initial?.certifications?.join(', ') ?? '');
  const [moreOpen, setMoreOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(!!(initial?.yarnCount || initial?.composition || initial?.weightGsm || initial?.certifications?.length));

  // ── Peso: auto-preenchido pelo tamanho selecionado (padrão configurável) ──
  // weightEditedManually trava o auto-preenchimento (usado tanto quando o
  // peso veio de uma FONTE — produto existente sendo editado, ou copiado
  // via "duplicar" — quanto quando a pessoa digitou o valor na mão).
  // weightTypedByHand distingue os dois casos: só fica true quando alguém
  // realmente digita no campo. Isso importa porque, ao trocar o tamanho de
  // propósito depois de carregar/copiar um peso de origem, faz sentido
  // voltar a seguir o padrão do tamanho novo — mas se a pessoa digitou o
  // peso na mão, esse valor é respeitado pra sempre, não importa o que
  // aconteça com o tamanho depois.
  const initialSizeForWeight = useRef<Size>((initial?.variants?.[0]?.size as Size) ?? SIZES[0]).current;
  const [weightKg, setWeightKg] = useState(initial?.weightKg ? String(initial.weightKg) : '');
  const [weightEditedManually, setWeightEditedManually] = useState(isEdit || !!initial?.weightKg);
  const [weightTypedByHand, setWeightTypedByHand] = useState(false);
  const [justAutoUpdatedWeight, setJustAutoUpdatedWeight] = useState(false);
  const [defaultWeightsBySize, setDefaultWeightsBySize] = useState<StoreSettings['defaultWeightsBySize']>(STORE_DEFAULTS.defaultWeightsBySize);
  const [weightsModalOpen, setWeightsModalOpen] = useState(false);
  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then(snap => {
      const data = snap.exists() ? snap.data() : {};
      if (data.defaultWeightsBySize) setDefaultWeightsBySize({ ...STORE_DEFAULTS.defaultWeightsBySize, ...data.defaultWeightsBySize });
    }).catch(() => {});
  }, []);
  // Trocar o tamanho de propósito, com um peso que veio de origem (não
  // digitado), destrava o auto-preenchimento pro tamanho novo — sem isso,
  // duplicar um produto ou editar um já existente e depois mudar o
  // tamanho deixava o peso preso pra sempre no valor antigo.
  useEffect(() => {
    if (weightEditedManually && !weightTypedByHand && size !== initialSizeForWeight) {
      setWeightEditedManually(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
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
  // Produto novo já começa com a única linha (malha): ninguém precisa
  // escolher tecido, só a cor e o estoque.
  const [rows, setRows] = useState<FabricRow[]>(() => initialRows.length > 0 || isEdit
    ? initialRows
    : [{ fabric: FABRICS[0], color: '#E8DCC8', colorName: '', qty: 1 }]);

  // ID das variações que JÁ existem: produtos publicados a partir de
  // rascunho/CSV usam "v1", não o `${tamanho}_${tecido}` deste formulário.
  // Sem reaproveitar o ID, abrir um desses produtos marcava a variação como
  // "removida" e salvar apagava o estoque dela (criando outra zerada).
  const [existingVariantIds] = useState(() => new Map(
    (initial?.variants ?? []).map(v => [`${v.size}|${v.fabric ?? FABRICS[0]}`, v.id]),
  ));
  const variantIdFor = (s: string, fabric: string) =>
    existingVariantIds.get(`${s}|${fabric}`) ?? makeVariantId(s, fabric);
  const rowMemory = useRef<Map<string, FabricRow>>(new Map(initialRows.map(r => [r.fabric, r])));

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
        colorName: '',
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
          setRows(cur => cur.map(r => r.fabric === fabric && r.color === fallbackHex ? { ...r, color: hex } : r));
        }).catch(() => {});
      }
      return [...prev, newRow];
    });
  }

  function updateRow(fabric: string, patch: Partial<FabricRow>) {
    setRows(prev => prev.map(r => r.fabric === fabric ? { ...r, ...patch } : r));
  }
  // A cor é escrita por quem cadastra: sem nome, o produto não sai.
  const colorUnchosen = rows.some(r => !r.colorName.trim());

  // ── Conferência do nome da cor contra as cores que a loja já usa ──
  // Evita a mesma cor escrita de jeitos diferentes ("azul marinho",
  // "Azul Marinho", "Azul marinhoo") virar cores diferentes na loja.
  const [storeColors, setStoreColors] = useState<string[] | null>(null);
  useEffect(() => {
    getDocs(query(collection(db, 'products'), fbLimit(500))).then(snap => {
      const byKey = new Map<string, string>();
      snap.forEach(d => {
        if (d.id === initial?.id) return;
        for (const v of (d.data().variants ?? []) as { colorName?: string }[]) {
          const n = v.colorName?.trim();
          if (n && !byKey.has(colorKey(n))) byKey.set(colorKey(n), formatColorName(n));
        }
      });
      setStoreColors([...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    }).catch(() => setStoreColors(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [keptTypos, setKeptTypos] = useState<Set<string>>(new Set());
  const [confirmedNew, setConfirmedNew] = useState<Set<string>>(new Set());
  const initialColorKeys = useRef(new Set((initial?.variants ?? []).map(v => colorKey(v.colorName ?? '')))).current;
  const paletteNames = TEXTILE_COLORS.map(c => c.name);

  function checkColor(colorName: string): ColorCheck {
    if (!colorName.trim()) return { state: 'empty' };
    const key = colorKey(colorName);
    // Sem a lista da loja (carregando ou sem rede) não trava o cadastro;
    // na edição, a cor que o produto já tinha não é questionada.
    if (!storeColors || initialColorKeys.has(key)) return { state: 'ok' };
    const m = matchColorName(colorName, storeColors);
    if (m.kind === 'same') return { state: 'existing', name: m.name };
    if (m.kind === 'typo' && !keptTypos.has(key)) return { state: 'typo', name: m.name };
    if (confirmedNew.has(key)) return { state: 'ok' };
    const p = matchColorName(colorName, paletteNames);
    const spelling = p.kind === 'typo' ? p.name : undefined;
    return { state: 'new', spelling };
  }
  const colorChecks = rows.map(r => checkColor(r.colorName));
  const colorPending = colorChecks.find(c => c.state === 'typo' || c.state === 'new') ?? null;
  const colorPendingMsg = colorPending?.state === 'typo'
    ? `Confira a cor: você quis dizer ${colorPending.name}?`
    : 'Confirme se é uma cor nova ou escolha uma das cores da loja.';
  // Nome final gravado: o da loja quando é a mesma cor, senão padronizado.
  function finalColorName(colorName: string): string {
    const c = checkColor(colorName);
    return c.state === 'existing' ? c.name : formatColorName(colorName);
  }

  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  useUnsavedGuard(isEdit && touched && !saving, { detail: 'As alterações deste produto ainda não foram salvas.' });
  const [error, setError] = useState('');
  // Produto novo é um passo a passo (uma etapa por tela, no celular é o que
  // menos confunde); a edição continua numa página só.
  const WIZARD_STEPS = ['Fotos', 'O que é', 'Nome e preço', 'Conferir'] as const;
  const [wizardStep, setWizardStep] = useState(1);
  const [created, setCreated] = useState<{ id: string; name: string; active: boolean } | null>(null);
  // Erro de preenchimento mostrado JUNTO do campo (e na barra de salvar):
  // antes só aparecia no topo da página, fora da tela, e parecia que o
  // botão não fazia nada.
  type FieldKey = 'fotos' | 'nome' | 'preco' | 'peso' | 'cor';
  const [fieldError, setFieldError] = useState<{ field: FieldKey; msg: string } | null>(null);
  const fieldErr = (field: FieldKey) => fieldError?.field === field ? (
    <p role="alert" className="text-[12px] font-medium text-red-600 mt-1.5 flex items-center gap-1.5">
      <IconAlert size={13} className="shrink-0" />{fieldError.msg}
    </p>
  ) : null;

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
  }, [currentNameSuggestion, nameEditedManually]);

  /* ───────────────────────── Rascunho automático ───────────────────────── */
  // Só pra criação de produto novo (edição sempre parte do doc real, não
  // faz sentido "recuperar rascunho" ali). Salva com debounce no
  // localStorage, oferece recuperar ao abrir a tela em branco, e apaga ao
  // salvar com sucesso ou ao descartar explicitamente.
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftShape | null>(null);
  const draftRestoredRef = useRef(false);
  const autoRestoreRef = useRef(false);
  useEffect(() => {
    if (pendingDraft && autoRestoreRef.current) { autoRestoreRef.current = false; void restoreDraft(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraft]);

  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setPendingDraft(JSON.parse(raw));
    } catch { /* localStorage indisponível ou JSON corrompido, ignora */ }
    if (new URLSearchParams(window.location.search).has('continuar')) autoRestoreRef.current = true;
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
    setWeightKg(d.weightKg); setWeightEditedManually(d.weightEditedManually); setWeightTypedByHand(d.weightTypedByHand);
    setRows(d.rows);
    // dataURL -> Blob de novo, pra poder subir pro Storage no submit
    // Decodifica na mão: fetch(data:...) é bloqueado pela CSP (connect-src)
    // e as fotos do rascunho sumiam ao recuperar.
    const restoredImages = d.images.map(dataUrl => {
      try {
        return { dataUrl, blob: dataUrlToBlob(dataUrl) } as ImgEntry;
      } catch { return null; }
    });
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
    // Só conta o que a pessoa fez: o nome sugerido e a linha de cor que já
    // vêm prontos não são "cadastro pela metade".
    const hasContent = (nameEditedManually && name) || description || price || images.length > 0;
    if (!hasContent || created) return;
    const t = setTimeout(() => {
      const draft: DraftShape = {
        name, nameEditedManually, description, price, category, size, fronhaCount, tags, active,
        yarnCount, composition, weightGsm, certifications, specsOpen,
        weightKg, weightEditedManually, weightTypedByHand,
        images: images.map(i => i.dataUrl),
        rows, savedAt: Date.now(),
      };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota cheia ou indisponível, ignora silenciosamente */ }
    }, 600);
    return () => clearTimeout(t);
  }, [isEdit, pendingDraft, name, nameEditedManually, description, price, category, size, fronhaCount, tags, active, yarnCount, composition, weightGsm, certifications, specsOpen, weightKg, weightEditedManually, weightTypedByHand, images, rows, created]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignora */ }
  }

  /* ─────────────────────── Duplicar produto existente ──────────────────── */
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  function applyDuplicateSource(p: Product) {
    setName(p.name + ' (cópia)'); setNameEditedManually(true);
    setDescription(p.description ?? '');
    setPrice(p.price ? centsToInput(p.price) : '');
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
      colorName: '',
      qty: 1,
    }));
    setRows(newRows);
    rowMemory.current = new Map(newRows.map(r => [r.fabric, r]));
    setDuplicateModalOpen(false);
  }

  const priceInputRef = useRef<HTMLInputElement>(null);
  function handlePhotosCaptured(photos: { dataUrl: string; blob: Blob }[]) {
    const isFirstPhoto = images.length === 0;
    setImages(prev => [...prev, ...photos]);
    if (isFirstPhoto) {
      // Tecidos pré-carregados do cadastro anterior (via staffPrefs) já
      // viram linha antes de existir qualquer foto, então a detecção
      // automática de cor (que só dispara ao marcar um tecido novo) nunca
      // rodou pra eles. Agora que a primeira foto chegou, tenta de novo
      // pra qualquer linha que ainda esteja na cor placeholder — sem isso,
      // o cadastro mais comum (categoria/tamanho/tecidos repetidos) nunca
      // se beneficiaria da cor automática.
      const cover = photos[0]?.dataUrl;
      if (cover) {
        const stillPlaceholder = new Set(rows.filter(r => r.color === '#E8DCC8').map(r => r.fabric));
        if (stillPlaceholder.size > 0) {
          sampleDominantColor(cover).then(hex => {
            if (!hex) return;
            const name = hexToColorName(hex);
            setRows(cur => cur.map(r => stillPlaceholder.has(r.fabric) ? { ...r, color: hex } : r));
          }).catch(() => {});
        }
      }
      // Depois da(s) primeira(s) foto(s), leva direto pro próximo campo que
      // realmente precisa de atenção — nome já vem sugerido sozinho, então
      // o que sobra é o preço. Só faz isso na primeira foto: se a pessoa já
      // tá preenchendo o resto e volta pra adicionar mais uma foto depois,
      // puxar o foco de volta seria mais irritante que útil.
      if (isEdit) setTimeout(() => {
        priceInputRef.current?.focus();
        priceInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }
  }

  function removeImage(i: number) {
    setTouched(true);
    const img = images[i];
    if (img.url) setRemovedUrls(prev => [...prev, img.url!]);
    setImages(prev => prev.filter((_, idx) => idx !== i));
  }

  function makeCover(i: number) {
    setTouched(true);
    setImages(prev => {
      const next = [...prev];
      const [chosen] = next.splice(i, 1);
      next.unshift(chosen);
      return next;
    });
  }

  const priceValid = !!price && parseBRL(price) > 0;
  const weightKgValid = parseDecimal(weightKg) > 0;

  // O aviso some sozinho assim que o campo fica certo.
  useEffect(() => {
    if (!fieldError) return;
    const ok = { fotos: images.length > 0, nome: !!name.trim(), preco: priceValid, peso: weightKgValid, cor: rows.length > 0 && !colorUnchosen && !colorPending }[fieldError.field];
    if (ok) setFieldError(null);
  }, [fieldError, images.length, name, priceValid, weightKgValid, rows.length, colorUnchosen, colorPending]);

  function failField(field: FieldKey, msg: string, elementId: string) {
    setError('');
    setFieldError({ field, msg });
    if (!isEdit) setWizardStep({ fotos: 1, nome: 3, preco: 3, cor: 3, peso: 4 }[field]);
    tap([30, 60, 30]);
    // Espera o campo aparecer (o peso fica em "Mais campos") e leva até ele.
    setTimeout(() => {
      const el = document.getElementById(elementId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
    }, 60);
  }

  // ── Checklist de progresso: orienta quem não conhece o formulário sobre
  // onde está e quanto falta, sem precisar rolar a tela pra descobrir o
  // que ainda não preencheu. Aparece fixo no topo.
  const steps = [
    { label: 'Fotos', done: images.length > 0 },
    { label: 'Nome e preço', done: !!name.trim() && priceValid && weightKgValid },
    // Cor conta como feita quando sai do bege inicial (escolhida ou tirada da foto).
    { label: 'Cor', done: rows.length > 0 && (isEdit || rows.every(r => r.color !== '#E8DCC8')) },
  ];
  const stepsDone = steps.filter(s => s.done).length;

  const currentSkuSet = new Set(rows.map(r => variantIdFor(size, r.fabric)));
  const orphanedSkus = isEdit
    ? Object.keys(existingSkus).filter(sku => !currentSkuSet.has(sku.replace(`${initial?.id}_`, '')))
    : [];
  const orphanedWithStock = orphanedSkus.filter(sku => {
    const s = existingSkus[sku];
    return s && (s.quantity > 0 || s.reserved > 0);
  });

  function goNext() {
    if (wizardStep === 1 && images.length === 0) return failField('fotos', 'Tire pelo menos uma foto do produto.', 'prod-fotos');
    if (wizardStep === 3) {
      if (!name.trim()) return failField('nome', 'Escreva o nome do produto.', 'prod-nome');
      if (!priceValid) return failField('preco', price ? 'Preço inválido. Digite o valor, por exemplo 8990 para R$ 89,90.' : 'Digite o preço de venda.', 'prod-preco');
      if (colorUnchosen) return failField('cor', 'Escreva o nome da cor.', colorFieldId(rows[0]?.fabric ?? FABRICS[0]));
      if (colorPending) return failField('cor', colorPendingMsg, colorFieldId(rows[0]?.fabric ?? FABRICS[0]));
    }
    setFieldError(null);
    tap();
    setWizardStep(s => Math.min(WIZARD_STEPS.length, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function goBack() {
    setFieldError(null);
    setWizardStep(s => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const [successToast, setSuccessToast] = useState('');
  const pendingNewRef = useRef<DocumentReference | null>(null);
  const pendingCreatedIdRef = useRef('');

  async function handleSubmit(mode: 'list' | 'another' = 'list') {
    // Na mesma ordem da tela, de cima para baixo.
    if (images.length === 0) return failField('fotos', 'Tire pelo menos uma foto do produto.', 'prod-fotos');
    if (!name.trim()) return failField('nome', 'Escreva o nome do produto.', 'prod-nome');
    if (!priceValid) return failField('preco', price ? 'Preço inválido. Digite só o valor, por exemplo 89,90.' : 'Digite o preço de venda.', 'prod-preco');
    if (!weightKgValid) {
      setMoreOpen(true);
      return failField('peso', 'Digite o peso de uma peça em kg, por exemplo 1,2.', 'prod-peso');
    }
    if (rows.length === 0 || colorUnchosen) return failField('cor', rows.length === 0 ? 'Escolha a cor do produto.' : 'Escreva o nome da cor.', colorFieldId(rows[0]?.fabric ?? FABRICS[0]));
    if (colorPending) return failField('cor', colorPendingMsg, colorFieldId(rows[0]?.fabric ?? FABRICS[0]));

    // A confirmação vem antes de qualquer upload ou exclusão: cancelar aqui
    // não pode deixar nada pela metade.
    if (isEdit && orphanedWithStock.length > 0) {
      const count = orphanedWithStock.length;
      const { confirmed: ok } = await confirmDialog({
        message: `${count === 1 ? 'Uma variação removida ainda tem' : `${count} variações removidas ainda têm`} estoque cadastrado.`,
        detail: 'Se continuar, esse estoque será apagado permanentemente.',
        confirmLabel: 'Continuar mesmo assim',
        variant: 'danger',
      });
      if (!ok) return;
    }

    setSaving(true);
    setError('');
    setFieldError(null);
    try {
      // Fotos removidas só são apagadas DEPOIS que o produto foi salvo.
      // Antes a exclusão começava junto com o upload: se o salvamento
      // falhasse (ou o vendedor cancelasse a confirmação acima), o produto
      // ficava apontando pra fotos que já não existiam.
      const deleteOldPhotos = () => removedUrls.length > 0
        ? Promise.allSettled(
            removedUrls.map(url => {
              try {
                const m = url.match(/\/o\/(.+?)\?/);
                if (!m) return Promise.resolve();
                return deleteObject(ref(storage, decodeURIComponent(m[1])));
              } catch { return Promise.resolve(); }
            })
          )
        : Promise.resolve();

      const now = new Date();
      const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      const uploadNewPhotos = Promise.all(
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
      );

      const uploaded = await uploadNewPhotos;
      const uploadedUrls: string[] = uploaded.filter((u): u is string => !!u);

      const priceCents = Math.round(parseBRL(price) * 100);
      const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
      const builtVariants = rows.map(({ fabric, color, colorName }) => ({
        id: variantIdFor(size, fabric),
        size,
        fabric,
        color,
        colorName: finalColorName(colorName),
      }));

      const data = {
        name: formatProductName(name),
        description,
        price: priceCents,
        weightKg: parseDecimal(weightKg),
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

        // Grava tudo em paralelo — antes eram writes sequenciais (1 por
        // tecido + 1 por SKU removido, um de cada vez), o que somava
        // segundos numa conexão de celular pra produtos com vários
        // tecidos. Promise.all despacha todas as escritas de uma vez.
        await Promise.all([
          updateDoc(doc(db, 'products', productId), data),
          ...orphanedSkus.map(sku => deleteDoc(doc(db, 'inventory', sku)).catch(err => {
            // Falha esperada só quando o SKU tem reserva de pedido pendente.
            console.warn('[ProductForm] não foi possível apagar o estoque da variação removida', sku, err);
          })),
          ...rows
            .map(r => ({ variantId: variantIdFor(size, r.fabric), r }))
            .filter(({ variantId }) => !existingSkus[`${productId}_${variantId}`])
            .map(({ variantId, r }) => setDoc(doc(db, 'inventory', `${productId}_${variantId}`), {
              productId, sku: `${productId}_${variantId}`,
              variant: { id: variantId, size, fabric: r.fabric, color: r.color },
              quantity: 0, reserved: 0, lowStockThreshold: 3, history: [],
              updatedAt: serverTimestamp(),
            })),
        ]);
      } else {
        // Mesmo ID em novas tentativas: se o produto foi gravado e o estoque
        // falhou (conexão ruim), salvar de novo completa ESTE produto em vez
        // de criar um duplicado ativo e sem estoque.
        const newRef = pendingNewRef.current ?? doc(collection(db, 'products'));
        pendingNewRef.current = newRef;
        await setDoc(newRef, { ...data, createdAt: serverTimestamp() });
        await Promise.all(rows.map(r => {
          const variantId = variantIdFor(size, r.fabric);
          const sku = `${newRef.id}_${variantId}`;
          return setDoc(doc(db, 'inventory', sku), {
            productId: newRef.id, sku,
            variant: { id: variantId, size, fabric: r.fabric, color: r.color },
            quantity: r.qty, reserved: 0, lowStockThreshold: 3, history: [],
            updatedAt: serverTimestamp(),
          });
        }));
      }
      await deleteOldPhotos();
      pendingCreatedIdRef.current = pendingNewRef.current?.id ?? '';
      pendingNewRef.current = null;
      clearDraft();
      if (!isEdit && user) {
        // Grava categoria/tamanho/tecidos como padrão pro próximo cadastro
        // dessa pessoa — mesmo em outro dia/sessão, não só dentro deste
        // lote. Fire-and-forget, não trava o fluxo de salvar por causa
        // disso.
        setStaffPref(user.uid, 'lastCategory', category).catch(() => {});
        setStaffPref(user.uid, 'lastSize', size).catch(() => {});
        setStaffPref(user.uid, 'lastFabrics', rows.map(r => r.fabric)).catch(() => {});
      }
      if (mode === 'another' && !isEdit) {
        tap([12, 40, 12]);
        setSuccessToast(`"${data.name}" criado!`);
        setTimeout(() => setSuccessToast(''), 3000);
        startAnother();
      } else if (!isEdit) {
        tap([12, 40, 12]);
        setCreated({ id: pendingCreatedIdRef.current, name: data.name, active });
        window.scrollTo({ top: 0 });
      } else {
        tap();
        setTouched(false);
        router.push('/painel/produtos');
      }
    } catch (e) {
      console.error(e);
      setError(navigator.onLine === false
        ? 'Sem internet. O produto continua aqui; tente salvar de novo quando a conexão voltar.'
        : 'Não deu para salvar. Tente de novo; nada do que você preencheu foi perdido.');
    } finally {
      setSaving(false);
    }
  }

  // Cadastro em lote: mantém tipo, tamanho, peso e especificações (o que se
  // repete entre produtos parecidos), limpa o que é deste item: nome, fotos,
  // preço, cor e quantidade. Volta para a primeira etapa.
  function startAnother() {
    setName(''); setNameEditedManually(false);
    setDescription('');
    setPrice('');
    setImages([]);
    setRemovedUrls([]);
    const resetRows = rows.map(r => ({ fabric: r.fabric, color: '#E8DCC8', colorName: '', qty: 1 }));
    setRows(resetRows);
    rowMemory.current = new Map(resetRows.map(r => [r.fabric, r]));
    setTags('');
    setCreated(null);
    setWizardStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // Blocos do formulário, montados uma vez e usados na edição (página
  // única) e no passo a passo do produto novo.
  const photosBlock = (
    <>
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.dataUrl} alt="" className="h-20 w-20 border border-mist object-cover rounded-xl" />
                  {i === 0 ? (
                    <span className="absolute bottom-1 left-1 bg-ink/80 text-paper text-[8px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-sm">Capa</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makeCover(i)}
                      className="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] font-bold tracking-wide uppercase px-2 py-1 rounded-full backdrop-blur-sm hover:bg-black/85 transition-colors"
                      title="Tornar capa"
                    >
                      Tornar capa
                    </button>
                  )}
                  {/* Dentro do canto da foto, discreto; vira vermelho só no
                      hover/toque. Antes era um círculo vermelho grande vazando
                      pra fora da miniatura e cobrindo a vizinha. */}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="group/rm absolute top-0 right-0 w-10 h-10 flex items-center justify-center"
                    aria-label="Remover foto"
                  >
                    {/* Círculo de 28px, área de toque de 40px. */}
                    <span className="w-7 h-7 rounded-full bg-black/70 text-white backdrop-blur-sm flex items-center justify-center group-hover/rm:bg-red-600 group-active/rm:scale-90 transition-[background-color,transform] duration-150">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </span>
                  </button>
                </div>
              ))}

              <button
                id="prod-fotos"
                type="button"
                onClick={() => setShowCamera(true)}
                className={`border-2 border-dashed border-clay/40 flex flex-col items-center justify-center gap-1 text-clay-d hover:border-clay transition-colors rounded-xl ${images.length === 0 ? 'w-full h-32 bg-clay/[0.04]' : 'h-20 w-20'}`}
              >
                <svg aria-hidden="true" width={images.length === 0 ? 30 : 22} height={images.length === 0 ? 30 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span className={images.length === 0 ? 'text-[15px] font-semibold' : 'text-[10px] font-medium'}>{images.length > 0 ? 'Mais fotos' : 'Tirar ou escolher foto'}</span>
              </button>
            </div>
            {fieldErr('fotos')}
    </>
  );
  const typeBlock = (
    <>
            <div>
              <label id="prod-categoria-label" className="label">Tipo de produto</label>
              <div role="group" aria-labelledby="prod-categoria-label" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => { tap(); setCategory(c); }}
                    className={`min-h-[52px] px-3 rounded-xl border text-[14px] font-semibold transition-colors ${
                      category === c
                        ? 'bg-ink text-paper border-ink'
                        : 'border-mist text-mid hover:border-clay/50 hover:text-clay bg-paper'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label id="prod-tamanho-label" className="label">Tamanho</label>
              <div role="group" aria-labelledby="prod-tamanho-label" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {SIZES.map(s => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={size === s}
                    onClick={() => { tap(); setSize(s); }}
                    className={`min-h-[52px] rounded-xl border text-[14px] font-semibold transition-colors ${
                      size === s
                        ? 'bg-ink text-paper border-ink'
                        : 'border-mist text-mid hover:border-clay/50 hover:text-clay bg-paper'
                    }`}
                  >
                    {SIZE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {category === 'Jogos de cama' && (fronhaOpen ? (
              <div>
                <label id="prod-fronhas-label" className="label">Quantas fronhas vêm no jogo?</label>
                <Stepper
                  labelledBy="prod-fronhas-label"
                  value={fronhaCount}
                  min={1}
                  max={10}
                  onChange={setFronhaCount}
                />
                <p className="text-[11.5px] text-faint mt-1.5">
                  Padrão: berço e solteiro com 1, casal, queen e king com 2.
                  {fronhaOverride !== null && (
                    <button type="button" onClick={() => { setFronhaOverride(null); setFronhaOpen(false); }} className="ml-1 font-semibold text-clay underline underline-offset-2">
                      Voltar ao padrão
                    </button>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-mid">
                Vem com <strong className="text-ink">{fronhaCount} {fronhaCount === 1 ? 'fronha' : 'fronhas'}</strong>.{' '}
                <button type="button" onClick={() => setFronhaOpen(true)} className="font-semibold text-clay underline underline-offset-2">Mudar</button>
              </p>
            ))}
    </>
  );
  const nameBlock = (
    <>
            <div>
              <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-1">
                <label htmlFor="prod-nome" className="label mb-0">Nome do produto</label>
                {nameEditedManually && currentNameSuggestion && name !== currentNameSuggestion && (
                  <button
                    type="button"
                    onClick={() => { setName(currentNameSuggestion); setNameEditedManually(false); }}
                    className="flex items-center gap-1 text-[11px] text-clay hover:text-ink transition-colors font-medium"
                  >
                    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
                    </svg>
                    Usar sugestão automática
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="prod-nome"
                  value={name}
                  onChange={e => { setName(e.target.value); setNameEditedManually(true); }}
                  placeholder="Jogo de cama queen algodão"
                  aria-invalid={fieldError?.field === 'nome'}
                  className={`input ${!nameEditedManually && name ? 'pr-9' : ''} ${justAutoUpdated ? 'bg-clay/[0.06] border-clay/40' : ''} ${fieldError?.field === 'nome' ? 'border-red-400' : ''}`}
                />
                {!nameEditedManually && name && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-clay/70 pointer-events-none"
                    title="Preenchido automaticamente"
                    aria-hidden="true"
                  >
                    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 3 11 6.5 14.5 8 11 9.5 9.5 13 8 9.5 4.5 8 8 6.5 9.5 3Z"/>
                      <path d="M18.5 13 19.5 15.5 22 16.5 19.5 17.5 18.5 20 17.5 17.5 15 16.5 17.5 15.5 18.5 13Z"/>
                    </svg>
                  </span>
                )}
              </div>
              {!nameEditedManually && name && (
                <p className="text-[11px] text-faint mt-1" aria-live="polite">
                  Preenchido sozinho com o tipo e o tamanho. Pode mudar se quiser.
                </p>
              )}
              {fieldErr('nome')}
            </div>
    </>
  );
  const priceBlock = (
    <>
            <div>
              <label htmlFor="prod-preco" className="label">Preço de venda</label>
              <div className="relative max-w-[14rem]">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-mid pointer-events-none">R$</span>
                <input
                  id="prod-preco"
                  ref={priceInputRef}
                  value={price}
                  onChange={e => setPrice(maskBRL(e.target.value))}
                  placeholder="0,00"
                  inputMode="numeric"
                  aria-invalid={fieldError?.field === 'preco' || (!!price && !priceValid)}
                  className={`input pl-12 text-[18px] ${(price && !priceValid) || fieldError?.field === 'preco' ? 'border-red-400' : ''}`}
                />
              </div>
              {price && !priceValid && fieldError?.field !== 'preco' && (
                <p className="text-[11.5px] text-red-600 mt-1">Digite o valor, por exemplo 8990 para R$ 89,90.</p>
              )}
              {fieldErr('preco')}
              {priceSuggestion !== null && !price && (
                <button
                  type="button"
                  onClick={() => setPrice(maskBRL(String(priceSuggestion)))}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-clay/30 bg-clay/5 px-3 py-1.5 text-[12px] font-semibold text-clay hover:bg-clay/10"
                >
                  Usar {formatCurrency(priceSuggestion)}
                  <span className="font-normal text-faint">· média dos parecidos</span>
                </button>
              )}
            </div>
    </>
  );
  const moreBlock = (
    <>
            {/* Como o "Mais campos" do catálogo do WhatsApp: à vista só o que
                todo produto precisa (foto, nome, preço, tamanho, cor). O peso
                já vem do tamanho; descrição e tags são opcionais. */}
            <button
              type="button"
              onClick={() => setMoreOpen(o => !o)}
              aria-expanded={moreOpen}
              className="self-start flex items-center gap-1.5 text-[12.5px] font-semibold text-clay hover:text-clay-d transition-colors"
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
              <span className="text-left">
                {moreOpen ? 'Menos campos' : 'Mais campos'}
                {!moreOpen && <span className="block font-normal text-[11.5px] text-faint">Descrição, peso e palavras de busca</span>}
              </span>
            </button>

            {moreOpen && (
              <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label htmlFor="prod-descricao" className="label mb-0">Descrição <span className="font-normal normal-case text-faint">(opcional)</span></label>
                {!description.trim() && (
                  <button
                    type="button"
                    onClick={() => setDescription(suggestProductDescription({
                      category: category as typeof CATEGORIES[number],
                      size,
                      fronhaCount: category === 'Jogos de cama' ? fronhaCount : undefined,
                      colorName: rows[0]?.colorName,
                    }))}
                    className="text-[12px] font-semibold text-clay hover:text-clay-d whitespace-nowrap"
                  >
                    Escrever para mim
                  </button>
                )}
              </div>
              <textarea
                id="prod-descricao"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Material, medidas, cuidados com lavagem..."
                className="input resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="prod-peso" className="label mb-0">
                  Peso de uma peça (kg) <span className="text-red-700">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setWeightsModalOpen(true)}
                  className="text-[10px] font-semibold text-clay hover:text-clay-d whitespace-nowrap"
                >
                  Editar padrões
                </button>
              </div>
              <div className="relative max-w-[10rem]">
                <input
                  id="prod-peso"
                  type="text"
                  value={weightKg}
                  onChange={e => { setWeightKg(e.target.value); setWeightEditedManually(true); setWeightTypedByHand(true); }}
                  placeholder="Ex.: 1,2"
                  inputMode="decimal"
                  className={`input ${(weightKg && !weightKgValid) || fieldError?.field === 'peso' ? 'border-red-400' : ''} ${justAutoUpdatedWeight ? 'bg-clay/[0.06] border-clay/40' : ''}`}
                />
                {!weightEditedManually && weightKg && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-clay/70 pointer-events-none"
                    title="Preenchido a partir do padrão desse tamanho"
                    aria-hidden="true"
                  >
                    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 3 11 6.5 14.5 8 11 9.5 9.5 13 8 9.5 4.5 8 8 6.5 9.5 3Z"/>
                      <path d="M18.5 13 19.5 15.5 22 16.5 19.5 17.5 18.5 20 17.5 17.5 15 16.5 17.5 15.5 18.5 13Z"/>
                    </svg>
                  </span>
                )}
              </div>
              {!weightEditedManually && weightKg && (
                <p className="text-[11px] text-faint mt-1">Já vem com o peso padrão desse tamanho. Usado para calcular o frete.</p>
              )}
              {fieldErr('peso')}
            </div>

            <div>
              <label htmlFor="prod-tags" className="label">Palavras para a busca <span className="font-normal normal-case text-faint">(opcional, separe com vírgula)</span></label>
              <input
                id="prod-tags"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="Ex.: presente, verão"
                className="input"
              />
            </div>

              </div>
            )}
    </>
  );
  const colorBlock = (
    <>
            <div className="flex flex-col gap-2.5">
              {rows.map(r => (
                <div key={r.fabric} className="border border-mist bg-warm/40 p-3.5 flex flex-col gap-3 rounded-xl">
                  {rows.length > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-ink">{r.fabric}</span>
                    <button
                      type="button"
                      onClick={() => toggleFabric(r.fabric)}
                      className="text-red-400 hover:text-red-600 transition-colors w-9 h-9 flex items-center justify-center shrink-0 -mr-1.5"
                      aria-label={`Remover ${r.fabric}`}
                    >
                      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label htmlFor={colorFieldId(r.fabric)} className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Nome da cor</label>
                      <ColorNameField
                        id={colorFieldId(r.fabric)}
                        value={r.color}
                        colorName={r.colorName}
                        check={colorChecks[rows.indexOf(r)] ?? { state: 'ok' }}
                        storeColors={sortBySimilarity(r.colorName, storeColors ?? [])}
                        invalid={fieldError?.field === 'cor'}
                        onChange={(hex, colorName) => updateRow(r.fabric, { color: hex, colorName })}
                        onKeepTypo={() => setKeptTypos(cur => new Set(cur).add(colorKey(r.colorName)))}
                        onConfirmNew={() => setConfirmedNew(cur => new Set(cur).add(colorKey(r.colorName)))}
                        onBlur={() => { if (r.colorName.trim()) updateRow(r.fabric, { colorName: finalColorName(r.colorName) }); }}
                      />
                      {fieldErr('cor')}
                    </div>

                    {!isEdit && (
                      <div>
                        <label htmlFor={`prod-estoque-${r.fabric}`} className="text-[10px] text-faint mb-1 block font-semibold tracking-[0.1em] uppercase">Quantas tem</label>
                        <Stepper
                          id={`prod-estoque-${r.fabric}`}
                          value={r.qty}
                          min={0}
                          max={9999}
                          onChange={n => updateRow(r.fabric, { qty: n })}
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
    </>
  );
  const visibilityBlock = (
    <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
                className="w-4 h-4 accent-clay rounded-[3px]"
              />
              <span className="text-sm text-mid">{isEdit ? 'Mostrar na loja' : 'Mostrar na loja assim que salvar'} <span className="block text-[11.5px] text-faint">{isEdit ? 'Desmarque para esconder sem apagar.' : 'Desmarque se ainda for terminar depois.'}</span></span>
            </label>
    </>
  );

  if (created) {
    const storeUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/produtos/${created.id}`;
    const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${created.name}\n${storeUrl}`)}`;
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-0 pb-24 pt-6 flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-full bg-clay/10 text-clay flex items-center justify-center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div>
          <h2 className="font-display text-2xl text-ink">{created.active ? 'Produto publicado!' : 'Produto salvo!'}</h2>
          <p className="text-[13.5px] text-mid mt-1.5">
            {created.active
              ? <>&ldquo;{created.name}&rdquo; já aparece na loja.</>
              : <>&ldquo;{created.name}&rdquo; ficou escondido. Para mostrar na loja, abra o produto em Produtos.</>}
          </p>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <button onClick={startAnother} className="btn-primary w-full py-3.5 text-[15px]">
            Cadastrar outro parecido
          </button>
          {created.active && (
            <>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="w-full border border-mist rounded-xl py-3.5 text-[15px] font-medium text-ink hover:bg-warm transition-colors">
                Mandar no WhatsApp
              </a>
              <a href={`/produtos/${created.id}`} target="_blank" rel="noopener noreferrer" className="w-full border border-mist rounded-xl py-3.5 text-[15px] font-medium text-ink hover:bg-warm transition-colors">
                Ver na loja
              </a>
            </>
          )}
          <button onClick={() => router.push('/painel/produtos')} className="w-full py-3 text-[14px] font-medium text-mid hover:text-ink">
            Voltar para Produtos
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showCamera && (
        <PhotoCaptureModal onDone={handlePhotosCaptured} onClose={() => setShowCamera(false)} />
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

      <div className="max-w-xl mx-auto px-0 pb-40" onInput={markTouched} onChange={markTouched}>
        {/* ── Progresso do passo a passo ── */}
        {!isEdit && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-mid">Passo {wizardStep} de {WIZARD_STEPS.length}</p>
              <p className="text-[12px] text-faint">{WIZARD_STEPS[wizardStep - 1]}</p>
            </div>
            <div className="flex gap-1.5" aria-hidden="true">
              {WIZARD_STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < wizardStep ? 'bg-clay' : 'bg-mist'}`} />
              ))}
            </div>
          </div>
        )}

        {!isEdit && wizardStep === 1 && pendingDraft && !draftBannerDismissed && (
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

        {!isEdit && wizardStep === 1 && (
          <button
            type="button"
            onClick={() => setDuplicateModalOpen(true)}
            className="mb-5 w-full border border-dashed border-mist hover:border-clay/50 hover:bg-clay/5 transition-colors px-4 py-2.5 flex items-center justify-center gap-2 text-[12px] font-semibold text-mid hover:text-clay rounded-xl"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Começar a partir de um produto parecido
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
            <IconAlert size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {isEdit ? (
        <div className="flex flex-col gap-8">
          <FormSection step={1} title="Fotos do produto" hint="A primeira foto é a capa da loja.">
            {photosBlock}
          </FormSection>

          <FormSection step={2} title="Que produto é esse?">
            {typeBlock}
            {nameBlock}
            {priceBlock}
            {moreBlock}
          </FormSection>

          <FormSection step={3} title="Cor e estoque" hint={FABRIC_LABEL}>
            {colorBlock}
          </FormSection>

          <FormSection step={4} title="Aparecer na loja">
            {visibilityBlock}
          </FormSection>

          {/* ── Aviso: variações removidas que ainda têm estoque ── */}
          {isEdit && orphanedWithStock.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3 -mt-2 flex items-start gap-2.5 rounded-[4px]">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                {orphanedWithStock.length === 1
                  ? 'Uma variação removida ainda tem estoque cadastrado.'
                  : `${orphanedWithStock.length} variações removidas ainda têm estoque cadastrado.`} Ao salvar, esse estoque será apagado.
              </p>
            </div>
          )}
        </div>
        ) : (
        <div className="flex flex-col gap-5">
          {wizardStep === 1 && (
            <FormSection step={1} title="Fotos do produto" hint="A primeira foto é a capa da loja.">
              {photosBlock}
            </FormSection>
          )}
          {wizardStep === 2 && (
            <FormSection step={2} title="Que produto é esse?">
              {typeBlock}
            </FormSection>
          )}
          {wizardStep === 3 && (
            <FormSection step={3} title="Nome, preço e cor">
              {nameBlock}
              {priceBlock}
              <div>
                {colorBlock}
              </div>
            </FormSection>
          )}
          {wizardStep === 4 && (
            <FormSection step={4} title="Confira antes de publicar">
            {/* ── Prévia ao vivo — pra quem não é técnico, ver como vai
                aparecer pro cliente é mais confiável que confiar nos
                campos abstratos do formulário. Atualiza junto com o
                preenchimento, sem precisar publicar pra conferir. ── */}
            {(images[0] || name || price) && (
              <div>
                <p className="text-[10px] text-faint font-semibold tracking-[0.12em] uppercase mb-2">É assim que vai aparecer na loja</p>
                <div className="border border-mist bg-paper w-40 overflow-hidden shadow-sm rounded-xl">
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
                      {priceValid ? formatCurrency(Math.round(parseBRL(price) * 100)) : 'R$ —'}
                    </p>
                  </div>
                </div>
              </div>
            )}
              {moreBlock}
              {visibilityBlock}
            </FormSection>
          )}
        </div>
        )}
      </div>

      {/* Toast de sucesso — só aparece no fluxo "cadastrar outro", já que
          não há navegação de página que sirva de confirmação nesse caso */}
      {successToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-full text-[13px] font-medium shadow-lg flex items-center gap-2 transition-opacity duration-200">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          {successToast}
        </div>
      )}

      {/* Barra de ação fixa — sempre visível, sem precisar rolar até o fim.
          No mobile ela fica ACIMA da barra de navegação inferior do painel
          via .above-panel-tabbar (ver globals.css), senão as duas disputam
          o bottom:0 e ficam sobrepostas. */}
      <div className="fixed above-panel-tabbar left-0 right-0 lg:left-64 bg-paper/95 backdrop-blur border-t border-mist z-40 rounded-t-2xl lg:rounded-none shadow-modal lg:shadow-none lg:pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto px-4 py-3 flex flex-col gap-2">
          {(fieldError || error) && (
            <p role="status" className="text-[12.5px] font-medium text-red-600 text-center leading-snug">
              {fieldError?.msg ?? error}
            </p>
          )}
          {isEdit ? (
            <div className="flex gap-3 items-center">
              <button onClick={() => handleSubmit('list')} disabled={saving} className="btn-primary flex-1 py-3.5 sm:py-3 text-[15px]">
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
              <button onClick={() => router.push('/painel/produtos')} className="border border-mist px-4 py-3.5 sm:py-3 text-sm font-medium text-mid hover:bg-warm transition-colors shrink-0 rounded-xl">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex gap-3 items-center">
              {wizardStep > 1 ? (
                <button onClick={goBack} disabled={saving} className="border border-mist px-5 py-3.5 sm:py-3 text-[15px] font-medium text-mid hover:bg-warm transition-colors shrink-0 rounded-xl">
                  Voltar
                </button>
              ) : (
                <button onClick={() => router.push('/painel/produtos')} className="border border-mist px-5 py-3.5 sm:py-3 text-[15px] font-medium text-mid hover:bg-warm transition-colors shrink-0 rounded-xl">
                  Cancelar
                </button>
              )}
              {wizardStep < WIZARD_STEPS.length ? (
                <button onClick={goNext} className="btn-primary flex-1 py-3.5 sm:py-3 text-[15px]">
                  Continuar
                </button>
              ) : (
                <button onClick={() => handleSubmit('list')} disabled={saving} className="btn-primary flex-1 py-3.5 sm:py-3 text-[15px]">
                  {saving ? 'Salvando…' : active ? 'Publicar na loja' : 'Salvar escondido'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Peso aceita vírgula ou ponto como decimal ("0,6" ou "0.6"), nunca milhar.
function parseDecimal(s: string): number {
  const t = s.trim();
  return /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : NaN;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/webp';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
