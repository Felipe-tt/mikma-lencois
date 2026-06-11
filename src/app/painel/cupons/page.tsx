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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B8B2AA] mb-1">{children}</label>;
}
function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border border-[#E8E4DC] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40 ${props.className ?? ''}`} />;
}
function Select({ ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="w-full border border-[#E8E4DC] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />;
}

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
        type: form.type, value: form.value,
        minOrderCents: Math.round(form.minOrderCents * 100),
        maxUses: form.maxUses, uses: 0, active: true,
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
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Promoções</p>
          <h1 className="font-display font-normal text-[#0F0E0C] text-2xl">Cupons</h1>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setError(''); }}
          className={`text-[11px] font-bold tracking-[0.1em] uppercase px-4 py-2.5 border transition-colors ${
            showForm
              ? 'border-[#E8E4DC] text-[#6B6660] hover:bg-[#F0EBE1]'
              : 'bg-[#0F0E0C] text-[#FAFAF8] border-[#0F0E0C] hover:bg-[#0F0E0C]/80'
          }`}
        >
          {showForm ? 'Cancelar' : '+ Novo cupom'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#FAFAF8] border border-[#E8E4DC] p-5 mb-5">
          <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] mb-4">Novo cupom</h2>
          {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="VERAO20" className="uppercase" /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}>
                  <option value="percent">Porcentagem (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor ({form.type === 'percent' ? '%' : 'R$'})</Label><Input type="number" min={0} value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} inputMode="decimal" /></div>
              <div><Label>Pedido mín. (R$)</Label><Input type="number" min={0} value={form.minOrderCents} onChange={e => setForm(f => ({ ...f, minOrderCents: Number(e.target.value) }))} inputMode="decimal" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Máx. de usos</Label><Input type="number" min={1} value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))} inputMode="numeric" /></div>
              <div><Label>Expira em</Label><Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
            </div>
          </div>
          <button
            onClick={handleCreate} disabled={saving}
            className="mt-5 w-full bg-[#0F0E0C] text-[#FAFAF8] text-sm font-semibold py-3 disabled:opacity-50 hover:bg-[#0F0E0C]/80 transition-colors"
          >
            {saving ? 'Criando…' : 'Criar cupom'}
          </button>
        </div>
      )}

      {/* List */}
      {coupons.length === 0 ? (
        <div className="border border-[#E8E4DC] bg-[#FAFAF8] py-16 text-center">
          <p className="text-2xl mb-3">🎟</p>
          <p className="text-sm text-[#B8B2AA]">Nenhum cupom criado ainda.</p>
        </div>
      ) : (
        <div className="bg-[#FAFAF8] border border-[#E8E4DC] overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_80px_100px_80px_64px] gap-4 px-5 py-3 border-b border-[#E8E4DC] bg-[#F5F3EF]">
            {['Código', 'Desconto', 'Mín.', 'Usos', 'Validade', ''].map((h, i) => (
              <span key={i} className={`text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] ${i >= 1 && i < 5 ? 'text-center' : ''}`}>{h}</span>
            ))}
          </div>

          {coupons.map((c, idx) => (
            <div key={c.id} className={`px-5 py-4 ${idx < coupons.length - 1 ? 'border-b border-[#E8E4DC]' : ''} hover:bg-[#F5F3EF] transition-colors`}>
              {/* Mobile */}
              <div className="sm:hidden">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="font-mono font-bold text-[#0F0E0C] text-base tracking-wider">{c.code}</span>
                    <p className="text-[12px] text-[#6B6660] mt-0.5">
                      {c.type === 'percent' ? `${c.value}% off` : `R$ ${c.value.toFixed(2)} off`}
                      {c.minOrderCents > 0 && <span className="text-[#B8B2AA] ml-1.5">· mín. R${(c.minOrderCents / 100).toFixed(0)}</span>}
                    </p>
                  </div>
                  <button onClick={() => toggleActive(c.id, c.active)}
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 border shrink-0 transition-colors ${
                      c.active ? 'border-[#C4714A] text-[#C4714A]' : 'border-[#E8E4DC] text-[#B8B2AA]'
                    }`}>
                    {c.active ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#B8B2AA] pt-3 border-t border-[#E8E4DC]">
                  <span>{c.uses} / {c.maxUses} usos · {c.expiresAt ? `exp. ${c.expiresAt}` : 'sem validade'}</span>
                  <button onClick={() => remove(c.id)} className="text-red-400 hover:text-red-600 font-semibold transition-colors">Excluir</button>
                </div>
              </div>

              {/* Desktop */}
              <div className="hidden sm:grid grid-cols-[1fr_80px_80px_100px_80px_64px] gap-4 items-center">
                <div>
                  <span className="font-mono font-bold text-[#0F0E0C] tracking-wider">{c.code}</span>
                </div>
                <div className="text-center">
                  <span className="text-sm text-[#0F0E0C]">
                    {c.type === 'percent' ? `${c.value}%` : `R$${c.value}`}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-sm text-[#6B6660]">
                    {c.minOrderCents > 0 ? `R$${(c.minOrderCents / 100).toFixed(0)}` : '—'}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[12px] text-[#6B6660]">{c.uses} / {c.maxUses}</span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-[#B8B2AA]">{c.expiresAt || '—'}</span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => toggleActive(c.id, c.active)}
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2 py-1 border transition-colors ${
                      c.active ? 'border-[#C4714A] text-[#C4714A] hover:bg-[#C4714A] hover:text-white' : 'border-[#E8E4DC] text-[#B8B2AA] hover:bg-[#F0EBE1]'
                    }`}>
                    {c.active ? '●' : '○'}
                  </button>
                  <button onClick={() => remove(c.id)} className="text-[11px] text-red-400 hover:text-red-600 font-semibold transition-colors">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
