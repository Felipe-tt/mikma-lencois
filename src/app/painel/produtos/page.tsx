'use client';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import { IconAlert, IconSearch, IconProducts } from '@/components/ui/Icon';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { readDraftName } from '@/lib/productDraft';

export default function PainelProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadError, setLoadError] = useState(false);
  // Cadastro que ficou pela metade neste aparelho (rascunho salvo sozinho).
  const [draftName, setDraftName] = useState<string | null>(null);
  useEffect(() => { setDraftName(readDraftName()); }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'products'), orderBy('createdAt', 'desc')),
      snap => { setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))); setLoading(false); setLoadError(false); },
      err => { console.error('[painel/produtos] onSnapshot:', err); setLoading(false); setLoadError(true); }
    );
  }, []);

  async function authedFetch(url: string, init: RequestInit) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sessão expirada. Atualize a página e entre novamente.');
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Erro ao processar (status ${res.status})`);
    }
    return res;
  }

  async function toggleActive(id: string, active: boolean) {
    setErrorMsg(''); setBusyId(id);
    try {
      await authedFetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível alterar a visibilidade. Tente novamente.');
    } finally { setBusyId(null); }
  }

  // Mesmo diálogo de Cupons/Avaliações (antes era uma confirmação inline
  // de 22px de altura, só aqui).
  async function deleteProduct(id: string, name: string) {
    const { confirmed } = await confirmDialog({
      message: `Apagar "${name}"?`,
      detail: 'O produto sai da loja e do painel. Esta ação não tem como desfazer.',
      confirmLabel: 'Apagar produto',
      variant: 'danger',
    });
    if (!confirmed) return;
    setErrorMsg(''); setBusyId(id);
    try {
      await authedFetch(`/api/products/${id}`, { method: 'DELETE' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível apagar o produto. Tente novamente.');
    } finally { setBusyId(null); }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loadError) return (
    <div className="max-w-6xl mx-auto"><PanelErrorState onRetry={() => window.location.reload()} /></div>
  );

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1,2,3,4].map(i => <div key={i} className="h-[72px] skeleton border border-mist rounded-xl" />)}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="sr-only lg:not-sr-only font-display font-normal text-ink text-2xl">Produtos</h1>
        <p className="text-[13px] text-faint mt-1">Gerencie os produtos da sua loja. Produtos visíveis aparecem no site para os clientes.</p>
      </div>

      {draftName !== null && (
        <Link
          href="/painel/produtos/novo?continuar=1"
          className="mb-4 flex items-center justify-between gap-3 border border-clay/30 bg-clay/5 px-4 py-3 rounded-xl hover:bg-clay/10 transition-colors"
        >
          <span className="text-[13px] text-ink min-w-0">
            Você tem um cadastro pela metade{draftName ? <>: <strong className="font-semibold">{draftName}</strong></> : ''}
          </span>
          <span className="text-[13px] font-semibold text-clay shrink-0">Continuar</span>
        </Link>
      )}

      {errorMsg && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold flex items-center gap-2 rounded-lg">
          <IconAlert size={12} className="shrink-0" /> {errorMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 min-w-0">
          <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Digite o nome do produto..."
            aria-label="Buscar produto"
            type="search"
            className="w-full border border-mist bg-paper pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/40 rounded-xl"
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] sm:flex gap-3">
          <Link
            href="/painel/produtos/novo"
            className="inline-flex items-center justify-center min-h-11 bg-ink text-paper text-[14px] font-semibold normal-case tracking-normal px-5 py-2.5 hover:bg-ink/80 active:scale-[0.97] transition-[background-color,transform] duration-150 rounded-xl whitespace-nowrap"
          >
            + Novo produto
          </Link>
          <Link
            href="/painel/produtos/importar-csv"
            className="inline-flex items-center justify-center min-h-11 border border-mist text-ink text-[14px] font-semibold normal-case tracking-normal px-4 py-2.5 hover:bg-warm active:scale-[0.97] transition-[background-color,transform] duration-150 rounded-xl whitespace-nowrap"
          >
            Importar planilha
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-mist py-16 text-center bg-paper rounded-xl">
          {search ? <IconSearch size={36} className="text-mist mx-auto mb-3" /> : <IconProducts size={36} className="text-mist mx-auto mb-3" />}
          <p className="text-sm text-faint">{search ? 'Nenhum produto encontrado com esse nome.' : 'Você ainda não cadastrou nenhum produto.'}</p>
          {!search && <p className="text-[12px] text-clay mt-2 font-semibold">Clique em &quot;+ Novo produto&quot; para começar!</p>}
        </div>
      ) : (
        <div className="bg-paper border border-mist overflow-x-auto rounded-xl">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[56px_minmax(160px,1fr)_100px_90px_90px_120px] gap-4 px-4 py-3 border-b border-mist bg-warm min-w-[700px]">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint"></span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint">Produto</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint">Categoria</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint text-right">Preço</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint text-center">Visível</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint text-right">Ações</span>
          </div>
          {filtered.map((p, idx) => {
            const isBusy = busyId === p.id;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[40px_1fr] gap-x-3 gap-y-2.5 sm:gap-4 sm:grid-cols-[56px_minmax(160px,1fr)_100px_90px_90px_120px] px-4 py-3 items-center hover:bg-warm transition-colors sm:min-w-[700px] ${idx < filtered.length - 1 ? 'border-b border-mist' : ''}`}
              >
                {/* Thumb */}
                <div className="relative w-10 h-10 bg-warm border border-mist shrink-0 overflow-hidden rounded-xl">
                  {p.images?.[0] ? (
                    <Image src={p.images[0]} alt={p.name} fill className="object-cover" sizes="40px" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="font-display text-sm text-faint">M</span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink leading-snug line-clamp-1">{p.name}</p>
                  <p className="text-[13px] text-faint sm:hidden">{p.category} · <span className="font-semibold text-ink">{formatCurrency(p.price)}</span></p>
                </div>

                {/* Category, desktop */}
                <span className="hidden sm:block text-[12px] text-mid truncate">{p.category}</span>

                {/* Price, desktop */}
                <span className="hidden sm:block font-display text-sm text-ink text-right">{formatCurrency(p.price)}</span>

                {/* Status */}
                <div className="hidden sm:flex justify-center">
                  <button
                    onClick={() => toggleActive(p.id, p.active)}
                    disabled={isBusy}
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 border transition-colors disabled:opacity-50 disabled:cursor-wait ${ p.active ? 'border-clay-l text-clay hover:bg-clay-l hover:text-paper' : 'border-mist text-faint hover:bg-warm' } rounded-full`}
                  >
                    {isBusy ? '…' : p.active ? 'Visível' : 'Oculto'}
                  </button>
                </div>

                {/* Actions: no celular vão numa segunda linha, senão espremiam
                    o nome do produto até "Len…". */}
                <div className="col-span-2 sm:col-span-1 flex items-center gap-3 justify-between sm:justify-end pl-[52px] sm:pl-0">
                  <button
                    onClick={() => toggleActive(p.id, p.active)}
                    disabled={isBusy}
                    aria-pressed={p.active}
                    className={`sm:hidden min-h-10 whitespace-nowrap text-[13px] font-semibold normal-case tracking-normal px-3.5 border transition-colors disabled:opacity-50 ${ p.active ? 'border-clay-l text-clay' : 'border-mist text-faint' } rounded-full`}
                  >
                    {isBusy ? '…' : p.active ? 'Aparece no site' : 'Escondido'}
                  </button>

                  <div className="flex items-center gap-1">
                    <Link
                      href={`/painel/produtos/${p.id}`}
                      className="inline-flex items-center min-h-10 px-3 rounded-xl text-[12.5px] font-semibold text-clay hover:text-clay-d hover:bg-warm transition-colors"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => deleteProduct(p.id, p.name)}
                      disabled={isBusy}
                      aria-label={`Apagar ${p.name}`}
                      className="inline-flex items-center min-h-10 px-3 rounded-xl text-[12.5px] font-semibold text-faint hover:text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {isBusy ? 'Apagando…' : 'Apagar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-faint">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
