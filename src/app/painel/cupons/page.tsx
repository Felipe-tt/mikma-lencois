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

const EMPTY = { code: '', type: 'percent' as const, value: 10, minOrderCents: 0, maxUses: 100, expiresAt: '' };

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<{ code: string; type: 'percent' | 'fixed'; value: number; minOrderCents: number; maxUses: number; expiresAt: string }>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'coupons'), snap => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
    });
    return unsub;
  }, []);

  const handleCreate = async () => {
    if (!form.code || !form.value) { setError('Preencha código e valor.'); return; }
    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'coupons'), {
        code: form.code.toUpperCase().trim(),
        type: form.type,
        value: form.value,
        minOrderCents: Math.round(form.minOrderCents * 100),
        maxUses: form.maxUses,
        uses: 0,
        active: true,
        expiresAt: form.expiresAt || null,
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY);
      setShowForm(false);
    } catch {
      setError('Erro ao criar cupom.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (id: string, active: boolean) => updateDoc(doc(db, 'coupons', id), { active: !active });
  const remove = (id: string) => deleteDoc(doc(db, 'coupons', id));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-ink">Cupons de desconto</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="bg-clay text-white px-4 py-2  text-sm font-medium hover:bg-clay transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Novo cupom'}
        </button>
      </div>

      {showForm && (
        <div className="bg-paper border border-mist  p-5 mb-6">
          <h2 className="text-sm font-semibold text-ink mb-4">Novo cupom</h2>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-mid mb-1">Código</label>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="VERAO20"
                className="input uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mid mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
                className="input"
              >
                <option value="percent">Porcentagem (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-mid mb-1">
                Valor ({form.type === 'percent' ? '%' : 'R$'})
              </label>
              <input
                type="number" min={0}
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mid mb-1">Pedido mínimo (R$)</label>
              <input
                type="number" min={0}
                value={form.minOrderCents}
                onChange={e => setForm(f => ({ ...f, minOrderCents: Number(e.target.value) }))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mid mb-1">Máximo de usos</label>
              <input
                type="number" min={1}
                value={form.maxUses}
                onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mid mb-1">Expira em (opcional)</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="input"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="mt-4 bg-clay text-white px-5 py-2  text-sm font-medium hover:bg-clay disabled:opacity-50 transition-colors"
          >
            {saving ? 'Criando...' : 'Criar cupom'}
          </button>
        </div>
      )}

      <div className="bg-paper border border-mist  overflow-hidden">
        {coupons.length === 0 ? (
          <div className="text-center py-10 text-sm text-faint">Nenhum cupom criado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-warm border-b border-mist">
              <tr>
                <th className="text-left px-4 py-3 text-mid font-medium">Código</th>
                <th className="text-left px-4 py-3 text-mid font-medium">Desconto</th>
                <th className="text-left px-4 py-3 text-mid font-medium">Usos</th>
                <th className="text-left px-4 py-3 text-mid font-medium">Validade</th>
                <th className="text-center px-4 py-3 text-mid font-medium">Status</th>
                <th className="text-right px-4 py-3 text-mid font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {coupons.map(c => (
                <tr key={c.id} className="hover:bg-warm">
                  <td className="px-4 py-3 font-mono font-medium text-ink">{c.code}</td>
                  <td className="px-4 py-3 text-mid">
                    {c.type === 'percent' ? `${c.value}%` : `R$ ${(c.value / 100).toFixed(2)}`}
                    {c.minOrderCents > 0 && <span className="text-xs text-faint ml-1">(mín. R${(c.minOrderCents / 100).toFixed(0)})</span>}
                  </td>
                  <td className="px-4 py-3 text-faint">{c.uses} / {c.maxUses}</td>
                  <td className="px-4 py-3 text-faint">{c.expiresAt || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(c.id, c.active)}
                      className={`text-xs px-2 py-1  font-medium transition-colors ${
                        c.active ? 'bg-green-100 text-green-700' : 'bg-warm text-faint'
                      }`}
                    >
                      {c.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(c.id)} className="text-xs text-red-400 hover:text-red-600">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
