'use client';
import { IconAlert, IconCoupons, IconInfo } from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

type Coupon = {
  id: string; code: string; type: 'percent' | 'fixed'; value: number;
  minOrderCents: number; maxUses: number; usedCount: number; active: boolean; expiresAt: string;
};
type FormState = { code: string; type: 'percent' | 'fixed'; value: number; minOrderCents: number; maxUses: number; expiresAt: string; };
const EMPTY: FormState = { code: '', type: 'percent', value: 10, minOrderCents: 0, maxUses: 100, expiresAt: '' };

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'coupons'), snap => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
    });
  }, []);

  const handleCreate = async () => {
    if (!form.code) { setError('Digite o código do cupom.'); return; }
    if (!form.value) { setError('Digite o valor do desconto.'); return; }
    setSaving(true); setError('');
    const code = form.code.toUpperCase().trim();
    try {
      // IMPORTANTE: o código do cupom precisa ser o ID do documento — é
      // assim que /api/checkout/validate-coupon e as rotas de pagamento
      // (create-checkout, create-pix) procuram o cupom. Antes isso usava
      // addDoc (ID aleatório, código só como campo), e por isso nenhum
      // cupom criado pelo painel era encontrado na hora de aplicar.
      const ref = doc(db, 'coupons', code);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        setError(`Já existe um cupom com o código ${code}.`);
        setSaving(false);
        return;
      }
      await setDoc(ref, {
        code, type: form.type, value: form.value,
        minOrderCents: Math.round(form.minOrderCents * 100),
        maxUses: form.maxUses, usedCount: 0, active: true,
        expiresAt: form.expiresAt || null, createdAt: serverTimestamp(),
      });
      setForm(EMPTY); setShowForm(false);
    } catch { setError('Erro ao criar cupom. Tente novamente.'); }
    finally { setSaving(false); }
  };

  const toggleActive = (id: string, active: boolean) => updateDoc(doc(db, 'coupons', id), { active: !active });
  const remove = async (id: string) => {
    const { confirmed } = await confirmDialog({
      message: 'Apagar este cupom?',
      detail: 'Os clientes não poderão mais usá-lo. Esta ação não tem como desfazer.',
      confirmLabel: 'Apagar cupom',
      variant: 'danger',
    });
    if (!confirmed) return;
    deleteDoc(doc(db, 'coupons', id));
  };

  const desconto = (c: Coupon) => c.type === 'percent' ? `${c.value}% de desconto` : `R$ ${c.value.toFixed(2)} de desconto`;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Cupons de desconto</h1>
          <p className="text-[13px] text-faint mt-1">Crie códigos para seus clientes usarem na hora de comprar.</p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setError(''); }}
          className={`text-[11px] font-bold tracking-[0.1em] uppercase px-4 py-2.5 border transition-colors ${
            showForm ? 'border-mist text-mid hover:bg-warm' : 'bg-ink text-paper border-ink hover:bg-ink/80'
          }`}>
          {showForm ? 'Cancelar' : '+ Criar cupom'}
        </button>
      </div>

      {showForm && (
        <div className="bg-paper border border-mist p-5 mb-6">
          <h2 className="text-[14px] font-bold text-ink mb-4">Novo cupom</h2>
          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold flex items-center gap-1"><IconAlert size={11} />{error}</div>}

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-mid mb-1.5">Código do cupom</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: VERAO20, BEMVINDO10"
                className="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-clay-l/20 placeholder:normal-case placeholder:font-sans" />
              <p className="text-[11px] text-faint mt-1">Este é o código que o cliente vai digitar na hora de comprar.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-mid mb-1.5">Tipo de desconto</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
                  className="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20">
                  <option value="percent">Porcentagem (ex: 10% off)</option>
                  <option value="fixed">Valor fixo (ex: R$ 20 off)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-mid mb-1.5">
                  {form.type === 'percent' ? 'Quantos % de desconto?' : 'Quantos R$ de desconto?'}
                </label>
                <input type="number" min={0} value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-mid mb-1.5">Valor mínimo do pedido (R$)</label>
                <input type="number" min={0} value={form.minOrderCents} onChange={e => setForm(f => ({ ...f, minOrderCents: Number(e.target.value) }))}
                  placeholder="0 = sem mínimo"
                  className="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 placeholder:text-faint-l" />
                <p className="text-[11px] text-faint mt-1">Coloque 0 se não quiser exigir valor mínimo.</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-mid mb-1.5">Quantas vezes pode ser usado?</label>
                <input type="number" min={1} value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                  className="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-mid mb-1.5">Data de validade (opcional)</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20" />
              <p className="text-[11px] text-faint mt-1">Deixe em branco para o cupom nunca expirar.</p>
            </div>

            {form.code && form.value > 0 && (
              <div className="bg-clay-l/5 border border-clay-l/20 px-4 py-3">
                <p className="text-[12px] text-ink">
                  <IconInfo size={13} className="text-mid" /> <strong>Resumo:</strong> O cupom <strong className="font-mono">{form.code || '...'}</strong> vai dar{' '}
                  <strong>{form.type === 'percent' ? `${form.value}%` : `R$ ${form.value.toFixed(2)}`} de desconto</strong>
                  {form.minOrderCents > 0 && ` em pedidos acima de R$ ${form.minOrderCents.toFixed(2)}`}
                  {` e pode ser usado ${form.maxUses} vez${form.maxUses !== 1 ? 'es' : ''}`}
                  {form.expiresAt && ` até ${new Date(form.expiresAt + 'T00:00:00').toLocaleDateString('pt-BR')}`}.
                </p>
              </div>
            )}
          </div>

          <button onClick={handleCreate} disabled={saving}
            className="mt-5 w-full bg-ink text-paper text-sm font-semibold py-3.5 disabled:opacity-50 hover:bg-ink/80 transition-colors">
            {saving ? 'Criando…' : 'Criar cupom'}
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="border border-mist bg-paper py-16 text-center">
          <IconCoupons size={40} className="text-mist mx-auto mb-3" />
          <p className="text-sm text-faint">Nenhum cupom criado ainda.<br />Crie seu primeiro cupom clicando no botão acima!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {coupons.map(c => (
            <div key={c.id} className={`border bg-paper px-5 py-4 ${!c.active ? 'opacity-50' : 'border-mist'}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="font-mono font-bold text-ink text-lg tracking-wider">{c.code}</span>
                  <p className="text-[13px] text-mid mt-0.5">{desconto(c)}{c.minOrderCents > 0 && ` em pedidos acima de R$ ${(c.minOrderCents/100).toFixed(2)}`}</p>
                </div>
                <button onClick={() => toggleActive(c.id, c.active)}
                  className={`shrink-0 text-[11px] font-bold px-3 py-1.5 border transition-colors ${
                    c.active ? 'border-clay-l text-clay-l hover:bg-clay-l hover:text-paper' : 'border-mist text-faint hover:bg-warm'
                  }`}>
                  {c.active ? 'Ativo' : 'Pausado'}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-faint pt-3 border-t border-mist">
                <span>
                  Usado <strong>{c.usedCount ?? 0}</strong> de <strong>{c.maxUses}</strong> vezes
                  {c.expiresAt && ` · Válido até ${new Date(c.expiresAt + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                </span>
                <button onClick={() => remove(c.id)} className="text-red-400 hover:text-red-600 font-semibold transition-colors">Apagar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
