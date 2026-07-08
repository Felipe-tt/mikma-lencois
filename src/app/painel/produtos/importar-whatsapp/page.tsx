'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { auth } from '@/lib/firebase/client';
import { CATEGORIES, SIZES, SIZE_LABEL, FABRICS } from '@/lib/productOptions';
import { IconAlert, IconCheck } from '@/components/ui/Icon';

interface FetchedProduct {
  id: string;
  retailerId: string;
  name: string;
  description: string;
  priceBRL: number | null;
  currency: string;
  available: boolean;
  imageUrls: string[];
}

interface DraftItem extends FetchedProduct {
  selected: boolean;
  nameInput: string;
  descInput: string;
  priceInput: string;
  category: string;
  size: string;
  fabric: string;
  colorHex: string;
  colorName: string;
  weightKg: string;
  lastError?: string;
}

function toDraft(p: FetchedProduct): DraftItem {
  return {
    ...p,
    selected: true,
    nameInput: p.name,
    descInput: p.description,
    priceInput: p.priceBRL != null ? p.priceBRL.toFixed(2).replace('.', ',') : '',
    category: '',
    size: '',
    fabric: '',
    colorHex: '',
    colorName: '',
    weightKg: '',
  };
}

function isValid(it: DraftItem): boolean {
  const price = parseFloat(it.priceInput.replace(',', '.'));
  const weight = parseFloat(it.weightKg.replace(',', '.'));
  return (
    it.nameInput.trim().length >= 2 &&
    !!price && price > 0 &&
    (CATEGORIES as readonly string[]).includes(it.category) &&
    (SIZES as readonly string[]).includes(it.size) &&
    (FABRICS as readonly string[]).includes(it.fabric) &&
    !!weight && weight > 0 &&
    it.imageUrls.length > 0
  );
}

const selectInputClass = 'w-full border border-mist bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20 rounded-[4px]';

// ── Parser do CSV exportado do Meta Commerce Manager ────────────────────────
// O Commerce Manager exporta no formato padrão de feed de produtos da Meta
// (mesmo usado pra Facebook/Instagram Shops), mas os nomes exatos das
// colunas variam um pouco conforme o idioma da conta e a origem do feed.
// Por isso a leitura abaixo aceita várias variações de nome por campo, em
// vez de depender de um cabeçalho fixo.
const HEADER_ALIASES: Record<string, string[]> = {
  id: ['id', 'item_id', 'retailer_id', 'sku', 'product_id', 'content_id'],
  name: ['title', 'name', 'nome', 'product name', 'nome do produto'],
  description: ['description', 'descrição', 'descricao', 'desc'],
  price: ['price', 'sale_price', 'preço', 'preco', 'valor'],
  image: [
    'image_link', 'image_url', 'image link', 'image', 'photo url', 'photo',
    'foto', 'imagem', 'main_image', 'additional_image_link',
  ],
  availability: ['availability', 'disponibilidade', 'status'],
};

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/** Extrai um valor em reais de campos tipo "129.90 BRL", "R$ 129,90", "129,90". */
function parsePriceBRL(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;
  // "129.90" (ponto decimal, formato do feed da Meta) vs "129,90" (vírgula, formato BR)
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // "1.299,90" — ponto é milhar, vírgula é decimal
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Extrai todas as URLs de imagem de uma célula (podem vir separadas por vírgula/espaço/pipe). */
function extractImageUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,|\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

interface CsvParseResult {
  products: FetchedProduct[];
  skipped: number;
}

function parseCommerceManagerCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  const idCol = findColumn(headers, HEADER_ALIASES.id);
  const nameCol = findColumn(headers, HEADER_ALIASES.name);
  const descCol = findColumn(headers, HEADER_ALIASES.description);
  const priceCol = findColumn(headers, HEADER_ALIASES.price);
  const availCol = findColumn(headers, HEADER_ALIASES.availability);
  // Imagem pode estar espalhada em mais de uma coluna (image_link +
  // additional_image_link) — junta todas as que baterem o alias.
  const imageCols = headers.filter((h) =>
    HEADER_ALIASES.image.includes(h.trim().toLowerCase())
  );

  if (!nameCol) {
    throw new Error(
      'Não encontrei uma coluna de nome/título no CSV. Confirme se exportou o arquivo certo do Commerce Manager.'
    );
  }

  let skipped = 0;
  const products: FetchedProduct[] = [];

  parsed.data.forEach((row, i) => {
    const name = nameCol ? row[nameCol]?.trim() : '';
    if (!name) { skipped++; return; }

    const imageUrls = Array.from(
      new Set(imageCols.flatMap((c) => extractImageUrls(row[c])))
    );

    products.push({
      id: (idCol && row[idCol]) || `csv-${i}`,
      retailerId: (idCol && row[idCol]) || `csv-${i}`,
      name,
      description: descCol ? (row[descCol] ?? '') : '',
      priceBRL: priceCol ? parsePriceBRL(row[priceCol]) : null,
      currency: 'BRL',
      available: availCol ? /in stock|available|dispon[íi]vel/i.test(row[availCol] ?? '') : true,
      imageUrls,
    });
  });

  return { products, skipped };
}

export default function ImportarWhatsappPage() {
  const [csvError, setCsvError] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<DraftItem[]>([]);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ created: number; failed: number } | null>(null);

  async function authedFetch(url: string, init: RequestInit) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sessão expirada. Atualize a página e entre novamente.');
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    // Algumas rotas (connect, products) devolvem 200 mesmo em erro de
    // propósito — evita que proxies/CDNs na frente do Cloud Run
    // interceptem status 5xx e substituam a resposta por uma página de
    // erro genérica. Por isso checamos `data.error` mesmo com res.ok.
    if (!res.ok || data?.error) throw new Error(data?.error ?? `Erro ao processar (status ${res.status})`);
    return data;
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const { products, skipped } = parseCommerceManagerCsv(text);
        if (products.length === 0) {
          setCsvError('Nenhum produto encontrado nesse CSV. Confira se o arquivo exportado tem linhas de produto.');
          return;
        }
        setItems(products.map(toDraft));
        if (skipped > 0) {
          setCsvError(`${skipped} linha(s) ignorada(s) por não ter nome de produto.`);
        }
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Não foi possível ler esse CSV.');
      }
    };
    reader.onerror = () => setCsvError('Não foi possível ler esse arquivo.');
    reader.readAsText(file, 'utf-8');
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch, lastError: undefined } : it)));
  }

  function toggleAll() {
    setItems((prev) => {
      const allSelected = prev.every((it) => it.selected);
      return prev.map((it) => ({ ...it, selected: !allSelected }));
    });
  }

  const selectedValid = items.filter((it) => it.selected && isValid(it));
  const selectedInvalidCount = items.filter((it) => it.selected && !isValid(it)).length;

  async function handleImport() {
    setImporting(true);
    setImportSummary(null);
    const attempted = selectedValid;
    try {
      // ── Passo 1: pedir URLs assinadas para todas as imagens ──────────────
      // Baixa cada imagem do CDN do WhatsApp no browser (sem passar pelo Cloud Run)
      // e pede ao servidor uma URL assinada para upload direto ao Storage.
      const allImageUrls = attempted.flatMap((it) => it.imageUrls);

      // Baixa os blobs no browser
      const blobs: Array<{ blob: Blob; contentType: string } | null> = await Promise.all(
        allImageUrls.map(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const contentType = res.headers.get('content-type') || 'image/jpeg';
            if (!contentType.startsWith('image/')) return null;
            const blob = await res.blob();
            if (blob.size === 0 || blob.size > 8 * 1024 * 1024) return null;
            return { blob, contentType };
          } catch {
            return null;
          }
        })
      );

      // Pede URLs assinadas apenas para os que conseguiu baixar
      const validBlobs = blobs.map((b, i) => ({ ...b, originalUrl: allImageUrls[i] }));
      const signPayload = {
        files: validBlobs.map((b) =>
          b?.blob ? { contentType: b.contentType, sizeBytes: b.blob.size } : null
        ).filter(Boolean),
      };

      const signData = await authedFetch('/api/painel/whatsapp-catalog/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signPayload),
      });

      const uploads: Array<{ signedUrl: string; publicUrl: string }> = signData.uploads ?? [];

      // ── Passo 2: fazer upload direto browser → Storage ──────────────────
      let uploadIdx = 0;
      const hostedUrlMap = new Map<string, string>(); // originalUrl → publicUrl
      for (let i = 0; i < validBlobs.length; i++) {
        const b = validBlobs[i];
        if (!b?.blob) continue;
        const upload = uploads[uploadIdx++];
        if (!upload) continue;
        try {
          await fetch(upload.signedUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': b.contentType ?? 'application/octet-stream',
              'x-goog-meta-firebasestoragedownloadtokens': upload.publicUrl.match(/token=([^&]+)/)?.[1] ?? '',
              'x-goog-meta-cache-control': 'public, max-age=31536000, immutable',
            },
            body: b.blob,
          });
          hostedUrlMap.set(b.originalUrl, upload.publicUrl);
        } catch {
          // falha num upload não deve travar tudo
        }
      }

      // ── Passo 3: enviar ao servidor só os metadados + URLs hospedadas ───
      const payload = {
        items: attempted.map((it) => ({
          name: it.nameInput.trim(),
          description: it.descInput,
          priceBRL: parseFloat(it.priceInput.replace(',', '.')),
          category: it.category,
          size: it.size,
          fabric: it.fabric,
          colorHex: it.colorHex,
          colorName: it.colorName,
          weightKg: parseFloat(it.weightKg.replace(',', '.')),
          imageUrls: it.imageUrls
            .map((u) => hostedUrlMap.get(u))
            .filter((u): u is string => Boolean(u)),
          active: true,
        })).filter((it) => it.imageUrls.length > 0),
      };

      if (payload.items.length === 0) {
        setImportSummary({ created: 0, failed: attempted.length });
        return;
      }

      const data = await authedFetch('/api/painel/whatsapp-catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const created: number = data.created ?? 0;
      const failed = attempted.length - created;

      // Remove os importados com sucesso da lista
      setItems((prev) => {
        const successIds = new Set((data.productIds ?? []) as string[]);
        if (successIds.size === 0) return prev;
        let removed = 0;
        return prev.filter((it) => {
          if (attempted.includes(it) && removed < successIds.size) {
            removed++;
            return false;
          }
          return true;
        });
      });

      setImportSummary({ created, failed });
    } catch (err) {
      setImportSummary({ created: 0, failed: attempted.length });
      setItems((prev) =>
        prev.map((it) =>
          attempted.includes(it)
            ? { ...it, lastError: err instanceof Error ? err.message : 'Erro ao importar.' }
            : it
        )
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Importar catálogo do WhatsApp</h1>
          <p className="text-[13px] text-faint mt-1">
            Traga os produtos do catálogo do WhatsApp Business — depois é só revisar tamanho, tecido e peso antes de importar pro site.
          </p>
        </div>
        <Link href="/painel/produtos" className="text-[12px] font-semibold text-mid hover:text-ink shrink-0 whitespace-nowrap">Voltar</Link>
      </div>

      {/* ── Passo 1 — Exportar do Commerce Manager ── */}
      <section className="bg-paper border border-mist p-5 mb-5">
        <div className="flex items-baseline gap-2.5 mb-3">
          <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">1</span>
          <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">Exportar o catálogo do Commerce Manager</h2>
        </div>

        <ol className="ml-[30px] flex flex-col gap-3 max-w-lg text-[13px] text-ink">
          <li className="flex gap-2.5">
            <span className="font-bold text-clay shrink-0">1.</span>
            <span>
              Acesse o{' '}
              <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer" className="font-semibold text-clay hover:text-clay-d underline">
                Meta Commerce Manager
              </a>{' '}
              com a conta que administra o catálogo do WhatsApp Business.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-bold text-clay shrink-0">2.</span>
            <span>Selecione o catálogo vinculado ao seu número de WhatsApp.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-bold text-clay shrink-0">3.</span>
            <span>No menu lateral, abra <strong>Itens do catálogo</strong> (ou <em>Data feed / Fontes de dados</em>, dependendo do idioma da conta).</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-bold text-clay shrink-0">4.</span>
            <span>Clique em <strong>Baixar</strong> (ou <em>Download</em>) e escolha o formato <strong>CSV</strong>.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-bold text-clay shrink-0">5.</span>
            <span>Envie o arquivo baixado aqui embaixo.</span>
          </li>
        </ol>

        <p className="ml-[30px] mt-3 text-[11px] text-faint max-w-lg">
          Esse caminho usa só a exportação oficial da Meta — sem conectar nem simular nenhum WhatsApp por aqui, então não corre risco de o número ser banido.
        </p>

        {csvFileName && !csvError && (
          <p className="ml-[30px] mt-3 text-[12px] text-faint">Arquivo selecionado: <strong>{csvFileName}</strong></p>
        )}

        <div className="ml-[30px] mt-4 flex flex-col gap-3 max-w-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary py-2.5 px-5 text-[11px] tracking-[0.08em] uppercase self-start"
          >
            {items.length > 0 ? 'Enviar outro CSV' : 'Enviar CSV do Commerce Manager'}
          </button>

          {csvError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] px-3 py-2 flex items-start gap-2">
              <IconAlert size={12} className="shrink-0 mt-0.5" /> {csvError}
            </div>
          )}

          {items.length > 0 && !csvError && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-[12px] px-3 py-2 flex items-center gap-2">
              <IconCheck size={12} className="shrink-0" /> {items.length} produto{items.length !== 1 ? 's' : ''} encontrado{items.length !== 1 ? 's' : ''} no arquivo — revise abaixo antes de importar.
            </div>
          )}
        </div>
      </section>

      {/* ── Passo 2 — Revisar e importar ── */}
      {items.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-2.5">
              <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">2</span>
              <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">
                Revisar e importar ({items.length} produto{items.length !== 1 ? 's' : ''})
              </h2>
            </div>
            <button onClick={toggleAll} className="text-[11px] font-semibold text-clay hover:text-clay-d">
              {items.every((it) => it.selected) ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {items.map((it, idx) => {
              const valid = isValid(it);
              return (
                <div
                  key={`${it.id}-${idx}`}
                  className={`border p-4 flex gap-4 ${it.selected ? 'border-mist bg-paper' : 'border-mist/50 bg-warm/40 opacity-60'}`}
                >
                  <input
                    type="checkbox"
                    checked={it.selected}
                    onChange={(e) => updateItem(idx, { selected: e.target.checked })}
                    className="w-4 h-4 accent-clay mt-1 shrink-0"
                  />
                  <div className="w-16 h-16 bg-warm border border-mist shrink-0 overflow-hidden">
                    {it.imageUrls[0] ? (
                      <img src={it.imageUrls[0]} alt={it.nameInput || 'Produto'} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="col-span-2 sm:col-span-4">
                      <label className="label">Nome</label>
                      <input value={it.nameInput} onChange={(e) => updateItem(idx, { nameInput: e.target.value })} className="input-sm" />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <label className="label">Descrição</label>
                      <textarea value={it.descInput} onChange={(e) => updateItem(idx, { descInput: e.target.value })} rows={2} className="input-sm" />
                    </div>
                    <div>
                      <label className="label">Preço (R$)</label>
                      <input value={it.priceInput} onChange={(e) => updateItem(idx, { priceInput: e.target.value })} placeholder="129,90" className="input-sm" />
                      <p className="text-[10px] text-faint mt-1">Estimado — confira com o app do WhatsApp</p>
                    </div>
                    <div>
                      <label className="label">Categoria</label>
                      <select value={it.category} onChange={(e) => updateItem(idx, { category: e.target.value })} className={selectInputClass}>
                        <option value="">Selecione</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tamanho</label>
                      <select value={it.size} onChange={(e) => updateItem(idx, { size: e.target.value })} className={selectInputClass}>
                        <option value="">Selecione</option>
                        {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tecido</label>
                      <select value={it.fabric} onChange={(e) => updateItem(idx, { fabric: e.target.value })} className={selectInputClass}>
                        <option value="">Selecione</option>
                        {FABRICS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Peso (kg)</label>
                      <input value={it.weightKg} onChange={(e) => updateItem(idx, { weightKg: e.target.value })} placeholder="0,8" className="input-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Cor <span className="font-normal normal-case text-faint">(opcional)</span></label>
                      <div className="flex gap-2">
                        <input value={it.colorHex} onChange={(e) => updateItem(idx, { colorHex: e.target.value })} placeholder="#1a1a2e" className="input-sm" />
                        <input value={it.colorName} onChange={(e) => updateItem(idx, { colorName: e.target.value })} placeholder="Azul marinho" className="input-sm" />
                      </div>
                    </div>

                    {it.selected && !valid && (
                      <p className="col-span-2 sm:col-span-4 text-[11px] text-amber-700">
                        Preencha nome, preço, categoria, tamanho, tecido e peso pra importar este produto.
                      </p>
                    )}
                    {it.lastError && (
                      <p className="col-span-2 sm:col-span-4 text-[11px] text-red-600">{it.lastError}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleImport}
              disabled={importing || selectedValid.length === 0}
              className="btn-primary py-3 px-6 text-[11px] tracking-[0.08em] uppercase disabled:opacity-50"
            >
              {importing ? 'Importando…' : `Importar ${selectedValid.length} produto${selectedValid.length !== 1 ? 's' : ''}`}
            </button>
            {selectedInvalidCount > 0 && (
              <span className="text-[12px] text-faint">{selectedInvalidCount} selecionado(s) com campos faltando</span>
            )}
          </div>

          {importSummary && (
            <div className="mt-4 border border-mist bg-warm p-4">
              <p className="text-[13px] font-semibold text-ink">
                {importSummary.created} produto{importSummary.created !== 1 ? 's' : ''} importado{importSummary.created !== 1 ? 's' : ''} com sucesso.
                {importSummary.failed > 0 && ` ${importSummary.failed} não foi(ram) importado(s) — veja o motivo em cada card acima.`}
              </p>
              {importSummary.created > 0 && (
                <Link href="/painel/produtos" className="inline-block mt-3 text-[12px] font-semibold text-clay hover:text-clay-d">
                  Ver produtos importados
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
