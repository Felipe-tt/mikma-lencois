'use client';
import { IconAlert, IconSearch, IconProducts } from '@/components/ui/Icon';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

export default function PainelProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'products'), orderBy('createdAt', 'desc')),
      snap => { setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))); setLoading(false); }
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

  async function deleteProduct(id: string) {
    setErrorMsg(''); setBusyId(id);
    try {
      await authedFetch(`/api/products/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível apagar o produto. Tente novamente.');
    } finally { setBusyId(null); }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1,2,3,4].map(i => <div key={i} className="h-[72px] skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Produtos</h1>
        <p className="text-[13px] text-faint mt-1">Gerencie os produtos da sua loja. Produtos visíveis aparecem no site para os clientes.</p>
      </div>

      {errorMsg && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold flex items-center gap-2">
          <IconAlert size={12} className="shrink-0" /> {errorMsg}
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Digite o nome do produto..."
            className="w-full border border-mist bg-paper pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/40"
          />
        </div>
        <Link
          href="/painel/produtos/importar-csv"
          className="shrink-0 border border-mist text-ink text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-warm transition-colors"
        >
          Importar de CSV
        </Link>
        <Link
          href="/painel/produtos/novo"
          className="shrink-0 bg-ink text-paper text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-ink/80 transition-colors"
        >
          + Novo produto
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-mist py-16 text-center bg-paper">
          {search ? <IconSearch size={36} className="text-mist mx-auto mb-3" /> : <IconProducts size={36} className="text-mist mx-auto mb-3" />}
          <p className="text-sm text-faint">{search ? 'Nenhum produto encontrado com esse nome.' : 'Você ainda não cadastrou nenhum produto.'}</p>
          {!search && <p className="text-[12px] text-clay-l mt-2 font-semibold">Clique em &quot;+ Novo produto&quot; para começar!</p>}
        </div>
      ) : (
        <div className="bg-paper border border-mist overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[56px_1fr_100px_80px_90px_130px] gap-4 px-4 py-3 border-b border-mist bg-warm">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint"></span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint">Produto</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint">Categoria</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint text-right">Preço</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint text-center">Visível</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint text-right">Ações</span>
          </div>
          {filtered.map((p, idx) => {
            const isBusy = busyId === p.id;
            const isConfirming = confirmDeleteId === p.id;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[56px_1fr_auto] sm:grid-cols-[56px_1fr_100px_80px_90px_130px] gap-4 px-4 py-3 items-center hover:bg-warm transition-colors ${idx < filtered.length - 1 ? 'border-b border-mist' : ''}`}
              >
                {/* Thumb */}
                <div className="relative w-10 h-10 bg-warm border border-mist shrink-0 overflow-hidden">
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
                  <p className="text-[11px] text-faint sm:hidden">{p.category} · {formatCurrency(p.price)}</p>
                </div>

                {/* Category — desktop */}
                <span className="hidden sm:block text-[12px] text-mid truncate">{p.category}</span>

                {/* Price — desktop */}
                <span className="hidden sm:block font-display text-sm text-ink text-right">{formatCurrency(p.price)}</span>

                {/* Status */}
                <div className="hidden sm:flex justify-center">
                  <button
                    onClick={() => toggleActive(p.id, p.active)}
                    disabled={isBusy}
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 border transition-colors disabled:opacity-50 disabled:cursor-wait ${
                      p.active
                        ? 'border-clay-l text-clay-l hover:bg-clay-l hover:text-paper'
                        : 'border-mist text-faint hover:bg-warm'
                    }`}
                  >
                    {isBusy ? '…' : p.active ? 'Visível' : 'Oculto'}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => toggleActive(p.id, p.active)}
                    disabled={isBusy}
                    className={`sm:hidden text-[10px] font-bold tracking-[0.1em] uppercase px-2 py-1 border transition-colors disabled:opacity-50 ${
                      p.active
                        ? 'border-clay-l text-clay-l'
                        : 'border-mist text-faint'
                    }`}
                  >
                    {isBusy ? '…' : p.active ? 'Visível' : 'Oculto'}
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => deleteProduct(p.id)}
                        disabled={isBusy}
                        className="text-[10px] font-bold uppercase px-2 py-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? 'Apagando…' : 'Confirmar'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isBusy}
                        className="text-[10px] font-semibold text-faint hover:text-ink px-1.5 py-1 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/painel/produtos/${p.id}`}
                        className="text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        disabled={isBusy}
                        className="text-[11px] font-semibold text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                      >
                        Apagar
                      </button>
                    </>
                  )}
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
