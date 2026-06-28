'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db, auth } from '@/lib/firebase/client';
import { CATEGORIES, SIZES, SIZE_LABEL, FABRICS } from '@/lib/productOptions';
import { IconAlert, IconCheck } from '@/components/ui/Icon';

type ConnStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'timeout' | 'logged_out' | 'error';

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

const selectInputClass = 'w-full border border-mist bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay/20';

export default function ImportarWhatsappPage() {
  const [number, setNumber] = useState('');

  const [connecting, setConnecting] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [connectError, setConnectError] = useState('');
  const [connected, setConnected] = useState(false);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState('');

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ created: number; failed: number } | null>(null);

  // Prefill com o número de WhatsApp já configurado em Configurações.
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => { if (d?.storePhone) setNumber(d.storePhone); })
      .catch(() => {});
  }, []);

  // Enquanto está conectando, escuta o status/QR em tempo real direto do Firestore.
  useEffect(() => {
    if (!connecting) return;
    const unsub = onSnapshot(doc(db, 'whatsappCatalogStatus', 'current'), (snap) => {
      const data = snap.data() as { status?: ConnStatus; qr?: string } | undefined;
      if (!data?.status) return;
      setConnStatus(data.status);
      setQr(data.status === 'qr' ? data.qr ?? null : null);
    });
    return unsub;
  }, [connecting]);

  async function authedFetch(url: string, init: RequestInit) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sessão expirada. Atualize a página e entre novamente.');
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `Erro ao processar (status ${res.status})`);
    return data;
  }

  async function handleConnect() {
    setConnectError('');
    setConnecting(true);
    setConnStatus('connecting');
    setQr(null);
    setConnected(false);
    try {
      const data = await authedFetch('/api/painel/whatsapp-catalog/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number }),
      });
      if (data.connected) {
        setConnected(true);
        setConnStatus('connected');
      } else {
        setConnStatus('error');
        setConnectError(data.error || 'Não foi possível conectar.');
      }
    } catch (err) {
      setConnStatus('error');
      setConnectError(err instanceof Error ? err.message : 'Não foi possível conectar.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleFetchProducts(reset: boolean) {
    setProductsError('');
    setLoadingProducts(true);
    try {
      const data = await authedFetch('/api/painel/whatsapp-catalog/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, cursor: reset ? undefined : cursor }),
      });
      const drafts = (data.products as FetchedProduct[]).map(toDraft);
      setItems((prev) => (reset ? drafts : [...prev, ...drafts]));
      setCursor(data.nextCursor || null);
    } catch (err) {
      setProductsError(err instanceof Error ? err.message : 'Não foi possível buscar os produtos.');
    } finally {
      setLoadingProducts(false);
    }
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
          imageUrls: it.imageUrls,
        })),
      };
      const data = await authedFetch('/api/painel/whatsapp-catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const results = data.results as Array<{ ok: true; productId: string } | { ok: false; reason: string }>;

      setItems((prev) => {
        const next: DraftItem[] = [];
        for (const it of prev) {
          const idx = attempted.indexOf(it);
          if (idx === -1) { next.push(it); continue; }
          const r = results[idx];
          if (r?.ok) continue; // importado com sucesso — remove da lista
          next.push({ ...it, lastError: r?.ok === false ? r.reason : 'Erro ao importar.' });
        }
        return next;
      });

      setImportSummary({ created: data.created ?? 0, failed: attempted.length - (data.created ?? 0) });
    } catch (err) {
      setImportSummary({ created: 0, failed: attempted.length });
      setItems((prev) => prev.map((it) => (attempted.includes(it) ? { ...it, lastError: err instanceof Error ? err.message : 'Erro ao importar.' } : it)));
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

      {/* ── Passo 1 — Conectar ── */}
      <section className="bg-paper border border-mist p-5 mb-5">
        <div className="flex items-baseline gap-2.5 mb-3">
          <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">1</span>
          <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">Conectar ao WhatsApp</h2>
        </div>
        <p className="text-[12px] text-faint mb-3 ml-[30px] max-w-md">
          Deixe o WhatsApp aberto no celular antes de clicar — vai aparecer um QR code aqui pra escanear em <strong>Configurações, Dispositivos conectados</strong>. Não precisa ser o número da loja, pode ser qualquer WhatsApp.
        </p>

        <div className="ml-[30px] flex flex-col gap-3 max-w-sm">
          <div>
            <label className="label">Número do catálogo (DDI + DDD + número)</label>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="554799964885"
              disabled={connecting}
              className="input-sm"
            />
          </div>

          {!connected && (
            <button
              onClick={handleConnect}
              disabled={connecting || !number.replace(/\D/g, '')}
              className="btn-primary py-2.5 px-5 text-[11px] tracking-[0.08em] uppercase self-start disabled:opacity-50"
            >
              {connecting ? 'Conectando…' : 'Conectar ao WhatsApp'}
            </button>
          )}

          {connecting && connStatus === 'qr' && qr && (
            <div className="flex flex-col items-center gap-2 border border-mist bg-white p-4 self-start">
              <QRCodeSVG value={qr} size={196} />
              <p className="text-[11px] text-faint text-center max-w-[220px]">
                Escaneie com o WhatsApp: Configurações, Dispositivos conectados, Conectar um dispositivo
              </p>
            </div>
          )}
          {connecting && connStatus === 'connecting' && !qr && (
            <p className="text-[12px] text-faint">Conectando…</p>
          )}

          {connectError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] px-3 py-2 flex items-start gap-2">
              <IconAlert size={12} className="shrink-0 mt-0.5" /> {connectError}
            </div>
          )}

          {connected && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-[12px] px-3 py-2 flex items-center gap-2">
              <IconCheck size={12} className="shrink-0" /> Conectado! Agora busque os produtos do catálogo.
            </div>
          )}
        </div>
      </section>

      {/* ── Passo 2 — Buscar produtos ── */}
      {connected && (
        <section className="bg-paper border border-mist p-5 mb-5">
          <div className="flex items-baseline gap-2.5 mb-3">
            <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">2</span>
            <h2 className="text-[13px] font-bold text-ink tracking-[0.02em]">Buscar produtos do catálogo</h2>
          </div>
          <div className="ml-[30px] flex flex-col gap-3">
            <button
              onClick={() => handleFetchProducts(true)}
              disabled={loadingProducts}
              className="btn-primary py-2.5 px-5 text-[11px] tracking-[0.08em] uppercase self-start disabled:opacity-50"
            >
              {loadingProducts ? 'Buscando…' : items.length > 0 ? 'Buscar de novo' : 'Buscar produtos'}
            </button>
            {productsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] px-3 py-2 flex items-start gap-2">
                <IconAlert size={12} className="shrink-0 mt-0.5" /> {productsError}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Passo 3 — Revisar e importar ── */}
      {items.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-2.5">
              <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center text-[10px] font-bold shrink-0 rounded-full">3</span>
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
                      <select value={it.category} onChange={(e) => updateItem(idx, { category: e.target.value })} className={selectInputClass} style={{ borderRadius: '4px' }}>
                        <option value="">Selecione</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tamanho</label>
                      <select value={it.size} onChange={(e) => updateItem(idx, { size: e.target.value })} className={selectInputClass} style={{ borderRadius: '4px' }}>
                        <option value="">Selecione</option>
                        {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tecido</label>
                      <select value={it.fabric} onChange={(e) => updateItem(idx, { fabric: e.target.value })} className={selectInputClass} style={{ borderRadius: '4px' }}>
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

          {cursor && (
            <button onClick={() => handleFetchProducts(false)} disabled={loadingProducts} className="mt-3 text-[12px] font-semibold text-clay hover:text-clay-d">
              {loadingProducts ? 'Carregando…' : 'Carregar mais produtos'}
            </button>
          )}

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
