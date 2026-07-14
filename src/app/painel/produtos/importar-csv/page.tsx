'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { auth } from '@/lib/firebase/client';
import { CATEGORIES, SIZES, SIZE_LABEL, FABRICS } from '@/lib/productOptions';
import { IconAlert, IconCheck, IconTrash, IconX } from '@/components/ui/Icon';

// ── Tipos ────────────────────────────────────────────────────────────────
interface DraftImage { url: string; path: string }

interface StagingItem {
  localId: string;
  name: string;
  description: string;
  category: string;
  size: string;
  fabric: string;
  colorName: string;
  colorHex: string;
  priceInput: string;
  weightInput: string;
  sourceRaw: string;
}

interface SavedDraft {
  id: string;
  name: string;
  description: string;
  category: string;
  size: string;
  fabric: string;
  colorName: string;
  colorHex: string;
  priceBRL: number | null;
  weightKg: number | null;
  images: DraftImage[];
  sourceRaw: string;
  status: 'draft' | 'published';
  publishedProductId?: string;
}

// ── CSV genérico: aceita praticamente qualquer cabeçalho, pareando por
// aliases em vez de exigir um formato fixo (cada catálogo de fornecedor/
// planilha exporta com nomes de coluna diferentes). ──────────────────────
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nome', 'name', 'produto', 'título', 'titulo', 'title', 'item'],
  category: ['categoria', 'category'],
  size: ['tamanho', 'size'],
  color: ['cor', 'cor_variante', 'color', 'variante', 'variação', 'variacao'],
  price: ['preco_brl', 'preço', 'preco', 'price', 'valor', 'preço_brl'],
  description: ['observacao', 'observação', 'descricao', 'descrição', 'description', 'desc', 'obs'],
  fabric: ['tecido', 'fabric', 'material'],
  weight: ['peso', 'peso_kg', 'weight', 'weightkg'],
};

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parsePriceBR(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return '';
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value.toFixed(2).replace('.', ',') : '';
}

/** Tenta adivinhar o tamanho (enum da loja) a partir de um texto livre do CSV. */
function guessSize(raw: string): string {
  const low = raw.toLowerCase();
  if (low.includes('berço') || low.includes('berco')) return 'berco';
  if (low.includes('king')) return 'king';
  if (low.includes('queen')) return 'queen';
  if (low.includes('casal')) return 'casal';
  if (low.includes('solteiro')) return 'solteiro';
  return '';
}

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `staging-${Date.now()}-${localIdCounter}`;
}

function parseGenericCsv(csvText: string): { items: StagingItem[]; skipped: number } {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const nameCol = findColumn(headers, HEADER_ALIASES.name) ?? findColumn(headers, HEADER_ALIASES.category);
  const categoryCol = findColumn(headers, HEADER_ALIASES.category);
  const sizeCol = findColumn(headers, HEADER_ALIASES.size);
  const colorCol = findColumn(headers, HEADER_ALIASES.color);
  const priceCol = findColumn(headers, HEADER_ALIASES.price);
  const descCol = findColumn(headers, HEADER_ALIASES.description);
  const fabricCol = findColumn(headers, HEADER_ALIASES.fabric);
  const weightCol = findColumn(headers, HEADER_ALIASES.weight);

  if (!nameCol) {
    throw new Error('Não encontrei uma coluna de nome/categoria/produto no CSV. Confira o cabeçalho do arquivo.');
  }

  let skipped = 0;
  const items: StagingItem[] = [];
  parsed.data.forEach((row) => {
    const rawName = nameCol ? (row[nameCol] ?? '').trim() : '';
    if (!rawName) { skipped++; return; }

    const rawSize = sizeCol ? (row[sizeCol] ?? '') : '';
    const sizeGuess = guessSize(rawSize) || guessSize(rawName);

    items.push({
      localId: nextLocalId(),
      name: rawName,
      description: descCol ? (row[descCol] ?? '').trim() : '',
      category: categoryCol ? (row[categoryCol] ?? '').trim() : '',
      size: sizeGuess,
      fabric: fabricCol ? (row[fabricCol] ?? '').trim() : '',
      colorName: colorCol ? (row[colorCol] ?? '').trim() : '',
      colorHex: '',
      priceInput: priceCol ? parsePriceBR(row[priceCol]) : '',
      weightInput: weightCol ? parsePriceBR(row[weightCol]) : '',
      sourceRaw: JSON.stringify(row),
    });
  });

  return { items, skipped };
}

/** Converte qualquer imagem pra WebP no navegador — bem menor que JPEG/PNG
 *  na mesma qualidade visual, então toda imagem de rascunho entra já
 *  otimizada, sem depender de reprocessar no servidor. */
function compressToWebp(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas indisponível')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Falha ao gerar webp')); return; }
        resolve(blob);
      }, 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem')); };
    img.src = url;
  });
}

const inputSm = 'w-full border border-mist bg-paper px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-clay/20 rounded-[4px]';
const selectSm = inputSm;

export default function ImportarCsvPage() {
  // ── Passo 1: CSV → staging local (ainda não salvo) ──
  const [csvError, setCsvError] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [staging, setStaging] = useState<StagingItem[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);

  // ── Rascunhos já salvos (persistem entre sessões) ──
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [draftsError, setDraftsError] = useState('');
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [deletingAll, setDeletingAll] = useState(false);

  async function authedFetch(url: string, init: RequestInit) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sessão expirada. Atualize a página e entre novamente.');
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(typeof data?.error === 'string' ? data.error : (data?.error?.formErrors?.[0] ?? `Erro (status ${res.status})`));
    return data;
  }

  const fetchDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    setDraftsError('');
    try {
      const data = await authedFetch('/api/painel/catalog-drafts', { method: 'GET' });
      setDrafts((data.drafts ?? []) as SavedDraft[]);
    } catch (err) {
      setDraftsError(err instanceof Error ? err.message : 'Não deu pra carregar os rascunhos.');
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const { items, skipped } = parseGenericCsv(text);
        if (items.length === 0) {
          setCsvError('Nenhuma linha com nome/produto encontrada nesse CSV.');
          return;
        }
        setStaging((prev) => [...prev, ...items]);
        if (skipped > 0) setCsvError(`${skipped} linha(s) ignorada(s) por não ter nome.`);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Não foi possível ler esse CSV.');
      }
    };
    reader.onerror = () => setCsvError('Não foi possível ler esse arquivo.');
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  function updateStaging(idx: number, patch: Partial<StagingItem>) {
    setStaging((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeStaging(idx: number) {
    setStaging((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveStagingAsDrafts() {
    if (staging.length === 0 || savingBatch) return;
    setSavingBatch(true);
    setCsvError('');
    try {
      const items = staging.map((it) => ({
        name: it.name,
        description: it.description,
        category: it.category,
        size: it.size,
        fabric: it.fabric,
        colorName: it.colorName,
        colorHex: it.colorHex,
        priceBRL: it.priceInput ? parseFloat(it.priceInput.replace(',', '.')) : null,
        weightKg: it.weightInput ? parseFloat(it.weightInput.replace(',', '.')) : null,
        sourceRaw: it.sourceRaw,
      }));
      await authedFetch('/api/painel/catalog-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      setStaging([]);
      setCsvFileName('');
      await fetchDrafts();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Não deu pra salvar como rascunho.');
    } finally {
      setSavingBatch(false);
    }
  }

  // ── Edição / imagens / publicação dos rascunhos salvos ──
  function setBusy(id: string, v: boolean) { setRowBusy((p) => ({ ...p, [id]: v })); }
  function setErr(id: string, v: string) { setRowError((p) => ({ ...p, [id]: v })); }

  function updateDraftLocal(id: string, patch: Partial<SavedDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function saveDraftField(draft: SavedDraft) {
    setBusy(draft.id, true);
    setErr(draft.id, '');
    try {
      await authedFetch(`/api/painel/catalog-drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          category: draft.category,
          size: draft.size,
          fabric: draft.fabric,
          colorName: draft.colorName,
          colorHex: draft.colorHex,
          priceBRL: draft.priceBRL,
          weightKg: draft.weightKg,
        }),
      });
    } catch (err) {
      setErr(draft.id, err instanceof Error ? err.message : 'Não salvou essa alteração.');
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function deleteDraft(id: string) {
    setBusy(id, true);
    try {
      await authedFetch(`/api/painel/catalog-drafts/${id}`, { method: 'DELETE' });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setErr(id, err instanceof Error ? err.message : 'Não deu pra apagar.');
      setBusy(id, false);
    }
  }

  async function deleteAllDrafts() {
    const targets = drafts.filter((d) => d.status !== 'published');
    if (targets.length === 0) return;
    const ok = window.confirm(
      `Apagar ${targets.length} rascunho${targets.length !== 1 ? 's' : ''} pendente${targets.length !== 1 ? 's' : ''}? Isso também apaga as imagens já enviadas. Rascunhos já publicados não são afetados.`
    );
    if (!ok) return;

    setDeletingAll(true);
    setDraftsError('');
    const results = await Promise.allSettled(
      targets.map((d) => authedFetch(`/api/painel/catalog-drafts/${d.id}`, { method: 'DELETE' }))
    );
    const failedIds = new Set(
      targets.filter((_, i) => results[i].status === 'rejected').map((d) => d.id)
    );
    setDrafts((prev) => prev.filter((d) => d.status === 'published' || failedIds.has(d.id)));
    if (failedIds.size > 0) {
      setDraftsError(`${failedIds.size} rascunho(s) não foram apagados — tente de novo.`);
    }
    setDeletingAll(false);
  }

  async function publishDraft(id: string) {
    setBusy(id, true);
    setErr(id, '');
    try {
      const data = await authedFetch(`/api/painel/catalog-drafts/${id}/publish`, { method: 'POST' });
      updateDraftLocal(id, { status: 'published', publishedProductId: data.productId });
    } catch (err) {
      setErr(id, err instanceof Error ? err.message : 'Não deu pra publicar — confira os campos obrigatórios.');
    } finally {
      setBusy(id, false);
    }
  }

  async function handleAddImages(draft: SavedDraft, files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(draft.id, true);
    setErr(draft.id, '');
    try {
      const fileArr = Array.from(files);
      const webps = await Promise.all(fileArr.map((f) => compressToWebp(f)));

      const { uploads } = await authedFetch('/api/painel/catalog-drafts/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: webps.map((b) => ({ contentType: 'image/webp', sizeBytes: b.size })),
        }),
      }) as { uploads: { signedUrl: string; publicUrl: string; destination: string }[] };

      await Promise.all(
        webps.map((blob, i) =>
          fetch(uploads[i].signedUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'image/webp',
              'x-goog-meta-firebasestoragedownloadtokens': uploads[i].publicUrl.match(/token=([^&]+)/)?.[1] ?? '',
              'x-goog-meta-cache-control': 'public, max-age=31536000, immutable',
            },
            body: blob,
          })
        )
      );

      const newImages: DraftImage[] = uploads.map((u) => ({ url: u.publicUrl, path: u.destination }));
      const allImages = [...draft.images, ...newImages];

      await authedFetch(`/api/painel/catalog-drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: allImages }),
      });
      updateDraftLocal(draft.id, { images: allImages });
    } catch (err) {
      setErr(draft.id, err instanceof Error ? err.message : 'Não deu pra enviar essas imagens.');
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function removeImage(draft: SavedDraft, imgIdx: number) {
    const allImages = draft.images.filter((_, i) => i !== imgIdx);
    setBusy(draft.id, true);
    try {
      await authedFetch(`/api/painel/catalog-drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: allImages }),
      });
      updateDraftLocal(draft.id, { images: allImages });
    } catch (err) {
      setErr(draft.id, err instanceof Error ? err.message : 'Não deu pra remover a imagem.');
    } finally {
      setBusy(draft.id, false);
    }
  }

  const pendingDrafts = drafts.filter((d) => d.status !== 'published');
  const publishedDrafts = drafts.filter((d) => d.status === 'published');

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Importar catálogo de um CSV</h1>
          <p className="text-[13px] text-faint mt-1 max-w-2xl">
            Suba qualquer CSV (nome/categoria, tamanho, cor, preço...), revise e edite as linhas, e salve como
            rascunho. Rascunhos ficam guardados aqui — não viram produto na loja até você adicionar as fotos e
            clicar em publicar.
          </p>
        </div>
        <Link href="/painel/produtos" className="text-[12px] font-semibold text-mid hover:text-ink shrink-0 whitespace-nowrap">Voltar</Link>
      </div>

      {/* ── Passo 1: upload + edição antes de salvar ── */}
      <section className="bg-paper border border-mist p-5 mb-6">
        <div className="flex items-baseline gap-2.5 mb-3">
          <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">1</span>
          <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">Suba o CSV</h2>
        </div>

        <p className="ml-[30px] text-[13px] text-ink max-w-lg">
          Aceita qualquer cabeçalho comum (nome, categoria, tamanho, cor, preço, observação, tecido, peso) —
          não precisa ser um formato específico.
        </p>

        <div className="ml-[30px] mt-4 flex flex-col gap-3 max-w-sm">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary py-2.5 px-5 text-[11px] tracking-[0.08em] uppercase self-start"
          >
            Enviar CSV
          </button>
          {csvFileName && !csvError && (
            <p className="text-[12px] text-faint">Arquivo: <strong>{csvFileName}</strong></p>
          )}
          {csvError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] px-3 py-2 flex items-start gap-2">
              <IconAlert size={12} className="shrink-0 mt-0.5" /> {csvError}
            </div>
          )}
        </div>

        {staging.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-semibold text-ink">{staging.length} linha{staging.length !== 1 ? 's' : ''} pra revisar antes de salvar</p>
              <button
                onClick={saveStagingAsDrafts}
                disabled={savingBatch}
                className="btn-primary py-2 px-4 text-[11px] tracking-[0.08em] uppercase disabled:opacity-50"
              >
                {savingBatch ? 'Salvando...' : `Salvar ${staging.length} como rascunho`}
              </button>
            </div>
            <div className="overflow-x-auto border border-mist">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-warm text-left text-faint uppercase text-[10px] tracking-wide">
                    <th className="p-2 min-w-[180px]">Nome</th>
                    <th className="p-2 min-w-[130px]">Categoria</th>
                    <th className="p-2 min-w-[110px]">Tamanho</th>
                    <th className="p-2 min-w-[130px]">Tecido</th>
                    <th className="p-2 min-w-[120px]">Cor</th>
                    <th className="p-2 min-w-[90px]">Preço R$</th>
                    <th className="p-2 min-w-[80px]">Peso (kg)</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {staging.map((it, idx) => (
                    <tr key={it.localId} className="border-t border-mist align-top">
                      <td className="p-1.5">
                        <input className={inputSm} value={it.name} onChange={(e) => updateStaging(idx, { name: e.target.value })} />
                      </td>
                      <td className="p-1.5">
                        <select className={selectSm} value={it.category} onChange={(e) => updateStaging(idx, { category: e.target.value })}>
                          <option value="">Selecione</option>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <select className={selectSm} value={it.size} onChange={(e) => updateStaging(idx, { size: e.target.value })}>
                          <option value="">Selecione</option>
                          {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <select className={selectSm} value={it.fabric} onChange={(e) => updateStaging(idx, { fabric: e.target.value })}>
                          <option value="">Selecione</option>
                          {FABRICS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <input className={inputSm} value={it.colorName} onChange={(e) => updateStaging(idx, { colorName: e.target.value })} />
                      </td>
                      <td className="p-1.5">
                        <input className={inputSm} value={it.priceInput} onChange={(e) => updateStaging(idx, { priceInput: e.target.value })} placeholder="0,00" />
                      </td>
                      <td className="p-1.5">
                        <input className={inputSm} value={it.weightInput} onChange={(e) => updateStaging(idx, { weightInput: e.target.value })} placeholder="0,800" />
                      </td>
                      <td className="p-1.5 text-center">
                        <button onClick={() => removeStaging(idx)} aria-label="Remover linha" className="text-faint hover:text-red-600">
                          <IconX size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Passo 2: rascunhos salvos — editar, adicionar imagens, publicar ── */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-2.5 mb-3">
          <div className="flex items-baseline gap-2.5">
            <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">2</span>
            <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">
              Rascunhos salvos {pendingDrafts.length > 0 && `(${pendingDrafts.length} pendente${pendingDrafts.length !== 1 ? 's' : ''})`}
            </h2>
          </div>
          {pendingDrafts.length > 0 && (
            <button
              onClick={deleteAllDrafts}
              disabled={deletingAll}
              className="text-[11px] font-semibold text-faint hover:text-red-600 flex items-center gap-1 disabled:opacity-50"
            >
              <IconTrash size={12} /> {deletingAll ? 'Apagando...' : 'Apagar todos os rascunhos'}
            </button>
          )}
        </div>

        {loadingDrafts && <p className="ml-[30px] text-[13px] text-faint">Carregando...</p>}
        {draftsError && (
          <div className="ml-[30px] bg-red-50 border border-red-200 text-red-700 text-[12px] px-3 py-2 flex items-start gap-2 max-w-lg">
            <IconAlert size={12} className="shrink-0 mt-0.5" /> {draftsError}
          </div>
        )}
        {!loadingDrafts && pendingDrafts.length === 0 && (
          <p className="ml-[30px] text-[13px] text-faint">Nenhum rascunho pendente. Suba um CSV acima pra começar.</p>
        )}

        <div className="flex flex-col gap-3 mt-3">
          {pendingDrafts.map((d) => {
            const busy = !!rowBusy[d.id];
            const err = rowError[d.id];
            return (
              <div key={d.id} className="border border-mist bg-paper p-4">
                <div className="flex gap-4">
                  <div className="flex flex-wrap gap-2 shrink-0" style={{ maxWidth: 220 }}>
                    {d.images.map((img, i) => (
                      <div key={img.path} className="relative w-16 h-16 border border-mist overflow-hidden">
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(d, i)}
                          disabled={busy}
                          className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white text-[11px] flex items-center justify-center"
                          aria-label="Remover imagem"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 border border-dashed border-mist flex items-center justify-center text-[10px] text-faint text-center cursor-pointer hover:bg-warm">
                      + foto
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => { handleAddImages(d, e.target.files); e.target.value = ''; }}
                      />
                    </label>
                  </div>

                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="col-span-2 sm:col-span-4">
                      <label className="label">Nome</label>
                      <input className={inputSm} value={d.name} onChange={(e) => updateDraftLocal(d.id, { name: e.target.value })} onBlur={() => saveDraftField(d)} />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <label className="label">Descrição</label>
                      <textarea className={inputSm} rows={2} value={d.description} onChange={(e) => updateDraftLocal(d.id, { description: e.target.value })} onBlur={() => saveDraftField(d)} />
                    </div>
                    <div>
                      <label className="label">Preço (R$)</label>
                      <input
                        className={inputSm}
                        value={d.priceBRL != null ? d.priceBRL.toFixed(2).replace('.', ',') : ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value.replace(',', '.'));
                          updateDraftLocal(d.id, { priceBRL: Number.isFinite(v) ? v : null });
                        }}
                        onBlur={() => saveDraftField(d)}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="label">Peso (kg)</label>
                      <input
                        className={inputSm}
                        value={d.weightKg != null ? String(d.weightKg).replace('.', ',') : ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value.replace(',', '.'));
                          updateDraftLocal(d.id, { weightKg: Number.isFinite(v) ? v : null });
                        }}
                        onBlur={() => saveDraftField(d)}
                        placeholder="0,800"
                      />
                    </div>
                    <div>
                      <label className="label">Categoria</label>
                      <select className={selectSm} value={d.category} onChange={(e) => { updateDraftLocal(d.id, { category: e.target.value }); }} onBlur={() => saveDraftField(d)}>
                        <option value="">Selecione</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tamanho</label>
                      <select className={selectSm} value={d.size} onChange={(e) => { updateDraftLocal(d.id, { size: e.target.value }); }} onBlur={() => saveDraftField(d)}>
                        <option value="">Selecione</option>
                        {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tecido</label>
                      <select className={selectSm} value={d.fabric} onChange={(e) => { updateDraftLocal(d.id, { fabric: e.target.value }); }} onBlur={() => saveDraftField(d)}>
                        <option value="">Selecione</option>
                        {FABRICS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="label">Cor <span className="font-normal normal-case text-faint">(opcional)</span></label>
                      <div className="flex gap-2">
                        <input className={inputSm} value={d.colorHex} onChange={(e) => updateDraftLocal(d.id, { colorHex: e.target.value })} onBlur={() => saveDraftField(d)} placeholder="#1a1a2e" />
                        <input className={inputSm} value={d.colorName} onChange={(e) => updateDraftLocal(d.id, { colorName: e.target.value })} onBlur={() => saveDraftField(d)} placeholder="Azul marinho" />
                      </div>
                    </div>
                  </div>
                </div>

                {err && <p className="mt-2 text-[11px] text-red-600">{err}</p>}

                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => publishDraft(d.id)}
                    disabled={busy}
                    className="btn-primary py-2 px-4 text-[11px] tracking-[0.08em] uppercase disabled:opacity-50"
                  >
                    {busy ? 'Aguarde...' : 'Publicar'}
                  </button>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    disabled={busy}
                    className="text-[11px] font-semibold text-faint hover:text-red-600 flex items-center gap-1"
                  >
                    <IconTrash size={12} /> Apagar rascunho
                  </button>
                  {d.sourceRaw && (
                    <details className="text-[11px] text-faint">
                      <summary className="cursor-pointer select-none">Ver linha original do CSV</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-all bg-warm p-2 border border-mist">{d.sourceRaw}</pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Já publicados a partir de rascunho (histórico rápido) ── */}
      {publishedDrafts.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">Publicados recentemente</h2>
          </div>
          <div className="flex flex-col gap-2">
            {publishedDrafts.map((d) => (
              <div key={d.id} className="border border-mist bg-warm/40 p-3 flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-ink"><IconCheck size={12} className="text-green-600" /> {d.name}</span>
                {d.publishedProductId && (
                  <Link href="/painel/produtos" className="font-semibold text-clay hover:text-clay-d">Ver na lista de produtos</Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
