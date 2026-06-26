'use client';
import { IconAlert, IconCoupons, IconInfo, IconCheck } from '@/components/ui/Icon';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

type Coupon = {
  id: string; code: string; type: 'percent' | 'fixed'; value: number;
  minOrderCents: number; maxUses: number; uses: number; active: boolean; expiresAt: string;
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
    try {
      await addDoc(collection(db, 'coupons'), {
        code: form.code.toUpperCase().trim(), type: form.type, value: form.value,
        minOrderCents: Math.round(form.minOrderCents * 100),
        maxUses: form.maxUses, uses: 0, active: true,
        expiresAt: form.expiresAt || null, createdAt: serverTimestamp(),
      });
      setForm(EMPTY); setShowForm(false);
    } catch { setError('Erro ao criar cupom. Tente novamente.'); }
    finally { setSaving(false); }
  };

  const toggleActive = (id: string, active: boolean) => updateDoc(doc(db, 'coupons', id), { active: !active });
  const remove = (id: string) => { if (confirm('Tem certeza que quer apagar este cupom? Os clientes não poderão mais usá-lo.')) deleteDoc(doc(db, 'coupons', id)); };

  const desconto = (c: Coupon) => c.type === 'percent' ? `${c.value}% de desconto` : `R$ ${c.value.toFixed(2)} de desconto`;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-normal text-[#1E1208] text-2xl">Cupons de desconto</h1>
          <p className="text-[13px] text-[#B09C8C] mt-1">Crie códigos para seus clientes usarem na hora de comprar.</p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setError(''); }}
          className={`text-[11px] font-bold tracking-[0.1em] uppercase px-4 py-2.5 border transition-colors ${
            showForm ? 'border-[#E6DFD5] text-[#705A48] hover:bg-[#F0EBE1]' : 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208] hover:bg-[#1E1208]/80'
          }`}>
          {showForm ? 'Cancelar' : '+ Criar cupom'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#FAF8F5] border border-[#E6DFD5] p-5 mb-6">
          <h2 className="text-[14px] font-bold text-[#1E1208] mb-4">Novo cupom</h2>
          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold flex items-center gap-1"><IconAlert size={11} />{error}</div>}

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Código do cupom</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: VERAO20, BEMVINDO10"
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 placeholder:normal-case placeholder:font-sans" />
              <p className="text-[11px] text-[#B09C8C] mt-1">Este é o código que o cliente vai digitar na hora de comprar.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Tipo de desconto</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
                  className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20">
                  <option value="percent">Porcentagem (ex: 10% off)</option>
                  <option value="fixed">Valor fixo (ex: R$ 20 off)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">
                  {form.type === 'percent' ? 'Quantos % de desconto?' : 'Quantos R$ de desconto?'}
                </label>
                <input type="number" min={0} value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Valor mínimo do pedido (R$)</label>
                <input type="number" min={0} value={form.minOrderCents} onChange={e => setForm(f => ({ ...f, minOrderCents: Number(e.target.value) }))}
                  placeholder="0 = sem mínimo"
                  className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 placeholder:text-[#C8BAB0]" />
                <p className="text-[11px] text-[#B09C8C] mt-1">Coloque 0 se não quiser exigir valor mínimo.</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Quantas vezes pode ser usado?</label>
                <input type="number" min={1} value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                  className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Data de validade (opcional)</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20" />
              <p className="text-[11px] text-[#B09C8C] mt-1">Deixe em branco para o cupom nunca expirar.</p>
            </div>

            {form.code && form.value > 0 && (
              <div className="bg-[#C4714A]/5 border border-[#C4714A]/20 px-4 py-3">
                <p className="text-[12px] text-[#1E1208]">
                  <IconInfo size={13} className="text-[#705A48]" /> <strong>Resumo:</strong> O cupom <strong className="font-mono">{form.code || '...'}</strong> vai dar{' '}
                  <strong>{form.type === 'percent' ? `${form.value}%` : `R$ ${form.value.toFixed(2)}`} de desconto</strong>
                  {form.minOrderCents > 0 && ` em pedidos acima de R$ ${form.minOrderCents.toFixed(2)}`}
                  {` e pode ser usado ${form.maxUses} vez${form.maxUses !== 1 ? 'es' : ''}`}
                  {form.expiresAt && ` até ${new Date(form.expiresAt + 'T00:00:00').toLocaleDateString('pt-BR')}`}.
                </p>
              </div>
            )}
          </div>

          <button onClick={handleCreate} disabled={saving}
            className="mt-5 w-full bg-[#1E1208] text-[#FAF8F5] text-sm font-semibold py-3.5 disabled:opacity-50 hover:bg-[#1E1208]/80 transition-colors">
            {saving ? 'Criando…' : 'Criar cupom'}
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="border border-[#E6DFD5] bg-[#FAF8F5] py-16 text-center">
          <IconCoupons size={40} className="text-[#E6DFD5] mx-auto mb-3" />
          <p className="text-sm text-[#B09C8C]">Nenhum cupom criado ainda.<br />Crie seu primeiro cupom clicando no botão acima!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {coupons.map(c => (
            <div key={c.id} className={`border bg-[#FAF8F5] px-5 py-4 ${!c.active ? 'opacity-50' : 'border-[#E6DFD5]'}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="font-mono font-bold text-[#1E1208] text-lg tracking-wider">{c.code}</span>
                  <p className="text-[13px] text-[#705A48] mt-0.5">{desconto(c)}{c.minOrderCents > 0 && ` em pedidos acima de R$ ${(c.minOrderCents/100).toFixed(2)}`}</p>
                </div>
                <button onClick={() => toggleActive(c.id, c.active)}
                  className={`shrink-0 text-[11px] font-bold px-3 py-1.5 border transition-colors ${
                    c.active ? 'border-[#C4714A] text-[#C4714A] hover:bg-[#C4714A] hover:text-white' : 'border-[#E6DFD5] text-[#B09C8C] hover:bg-[#F0EBE1]'
                  }`}>
                  {c.active ? 'Ativo' : 'Pausado'}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#B09C8C] pt-3 border-t border-[#E6DFD5]">
                <span>
                  Usado <strong>{c.uses}</strong> de <strong>{c.maxUses}</strong> vezes
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
