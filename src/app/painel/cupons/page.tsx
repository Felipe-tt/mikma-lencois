'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

type Coupon = {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrderCents: number;
  maxUses: number;
  uses: number;
  active: boolean;
  expiresAt: string;
};

type FormState = { code: string; type: 'percent' | 'fixed'; value: number; minOrderCents: number; maxUses: number; expiresAt: string };
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
    if (!form.code || !form.value) { setError('Preencha código e valor.'); return; }
    setSaving(true); setError('');
    try {
      await addDoc(collection(db, 'coupons'), {
        code: form.code.toUpperCase().trim(),
        type: form.type,
        value: form.value,
        minOrderCents: Math.round(form.minOrderCents * 100),
        maxUses: form.maxUses,
        uses: 0, active: true,
        expiresAt: form.expiresAt || null,
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY); setShowForm(false);
    } catch { setError('Erro ao criar cupom.'); }
    finally { setSaving(false); }
  };

  const toggleActive = (id: string, active: boolean) => updateDoc(doc(db, 'coupons', id), { active: !active });
  const remove = (id: string) => { if (confirm('Excluir cupom?')) deleteDoc(doc(db, 'coupons', id)); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Cupons</h1>
        <button
          onClick={() => { setShowForm(s => !s); setError(''); }}
          className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-colors ${
            showForm ? 'border-mist text-mid hover:bg-warm' : 'bg-ink text-paper border-ink'
          }`}
        >
          {showForm ? 'Cancelar' : '+ Novo cupom'}
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-paper border border-mist rounded-xl p-4 mb-5">
          <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-4">Novo cupom</h2>
          {error && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-2xs font-bold uppercase tracking-wider text-faint mb-1 block">Código</label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="VERAO20"
                  className="input uppercase w-full"
                />
              </div>
              <div>
                <label className="text-2xs font-bold uppercase tracking-wider text-faint mb-1 block">Tipo</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
                  className="input w-full"
                >
                  <option value="percent">Porcentagem (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-2xs font-bold uppercase tracking-wider text-faint mb-1 block">
                  Valor ({form.type === 'percent' ? '%' : 'R$'})
                </label>
                <input type="number" min={0} value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className="input w-full" inputMode="decimal" />
              </div>
              <div>
                <label className="text-2xs font-bold uppercase tracking-wider text-faint mb-1 block">Pedido mín. (R$)</label>
                <input type="number" min={0} value={form.minOrderCents}
                  onChange={e => setForm(f => ({ ...f, minOrderCents: Number(e.target.value) }))}
                  className="input w-full" inputMode="decimal" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-2xs font-bold uppercase tracking-wider text-faint mb-1 block">Máx. de usos</label>
                <input type="number" min={1} value={form.maxUses}
                  onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                  className="input w-full" inputMode="numeric" />
              </div>
              <div>
                <label className="text-2xs font-bold uppercase tracking-wider text-faint mb-1 block">Expira em</label>
                <input type="date" value={form.expiresAt}
                  onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="input w-full" />
              </div>
            </div>
          </div>
          <button
            onClick={handleCreate} disabled={saving}
            className="mt-4 w-full bg-ink text-paper text-sm font-semibold py-3 rounded-xl disabled:opacity-50 active:bg-ink/80 transition-colors"
          >
            {saving ? 'Criando…' : 'Criar cupom'}
          </button>
        </div>
      )}

      {/* Lista — cards no mobile */}
      {coupons.length === 0 ? (
        <div className="text-center py-16 border border-mist rounded-xl">
          <p className="text-3xl mb-3">🎟</p>
          <p className="text-sm text-faint">Nenhum cupom criado ainda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {coupons.map(c => (
            <div key={c.id} className="bg-paper border border-mist rounded-xl px-4 py-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="font-mono font-bold text-ink text-base tracking-wider">{c.code}</span>
                  <p className="text-sm text-mid mt-0.5">
                    {c.type === 'percent' ? `${c.value}% off` : `R$ ${(c.value).toFixed(2)} off`}
                    {c.minOrderCents > 0 && <span className="text-xs text-faint ml-1.5">· mín. R${(c.minOrderCents / 100).toFixed(0)}</span>}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(c.id, c.active)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border shrink-0 transition-colors ${
                    c.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-warm text-faint border-mist'
                  }`}
                >
                  {c.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-faint pt-3 border-t border-mist">
                <span>{c.uses} / {c.maxUses} usos · {c.expiresAt ? `expira ${c.expiresAt}` : 'sem validade'}</span>
                <button onClick={() => remove(c.id)} className="text-red-400 active:text-red-600 font-medium">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
