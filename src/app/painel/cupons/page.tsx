'use client';
import { IconAlert, IconCoupons, IconInfo } from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { Select } from '@/components/ui/Select';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import { Field } from '@/components/ui/Field';
import { PainelSkeleton } from '@/components/painel/PainelSkeleton';
import { formatCurrency } from '@/lib/utils/format';

type Coupon = {
  id: string; code: string; type: 'percent' | 'fixed'; value: number;
  minOrderCents: number; maxUses: number; usedCount: number; active: boolean; expiresAt: string;
};
type FormState = { code: string; type: 'percent' | 'fixed'; value: number; minOrderCents: number; maxUses: number; expiresAt: string; };
const EMPTY: FormState = { code: '', type: 'percent', value: 10, minOrderCents: 0, maxUses: 100, expiresAt: '' };

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(
      collection(db, 'coupons'),
      snap => { setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon))); setLoadError(false); },
      err => { console.error('[painel/cupons] onSnapshot:', err); setLoadError(true); setCoupons([]); }
    );
  }, []);

  const handleCreate = async () => {
    const code = form.code.toUpperCase().trim();
    if (!code) { setError('Digite o código do cupom.'); return; }
    // O código vira o ID do documento: "/" ou espaço quebravam o caminho.
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) { setError('Use só letras, números, - ou _ (de 3 a 30).'); return; }
    if (!(form.value > 0)) { setError('Digite um valor de desconto maior que zero.'); return; }
    if (form.type === 'percent' && form.value > 100) { setError('A porcentagem vai até 100%.'); return; }
    if (form.minOrderCents < 0 || form.maxUses < 1) { setError('Confira o pedido mínimo e o limite de usos.'); return; }
    setSaving(true); setError('');
    try {
      // IMPORTANTE: o código do cupom precisa ser o ID do documento, é
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
        // Valor fixo é guardado em centavos (é assim que o cálculo lê, ver
        // lib/orderPricing). Antes ia em reais: "R$ 20 off" dava R$ 0,20.
        code, type: form.type,
        value: form.type === 'fixed' ? Math.round(form.value * 100) : form.value,
        minOrderCents: Math.round(form.minOrderCents * 100),
        maxUses: form.maxUses, usedCount: 0, active: true,
        // Vale até o fim do dia escolhido no horário de Brasília (só a data
        // virava meia-noite UTC, e o cupom parava às 21h da véspera).
        expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59-03:00` : null, createdAt: serverTimestamp(),
      });
      setForm(EMPTY); setShowForm(false);
    } catch { setError('Erro ao criar cupom. Tente novamente.'); }
    finally { setSaving(false); }
  };

  const toggleActive = (id: string, active: boolean) =>
    updateDoc(doc(db, 'coupons', id), { active: !active })
      .catch(() => setError('Não foi possível alterar o cupom. Tente de novo.'));
  const remove = async (id: string) => {
    const { confirmed } = await confirmDialog({
      message: 'Apagar este cupom?',
      detail: 'Os clientes não poderão mais usá-lo. Esta ação não tem como desfazer.',
      confirmLabel: 'Apagar cupom',
      variant: 'danger',
    });
    if (!confirmed) return;
    deleteDoc(doc(db, 'coupons', id))
      .catch(() => setError('Não foi possível apagar o cupom. Tente de novo.'));
  };

  const desconto = (c: Coupon) => c.type === 'percent'
    ? `${c.value}% de desconto`
    : `${(c.value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`;

  return (
    <div className="max-w-6xl mx-auto">
      {/* No celular o botão desce para a própria linha: ao lado do título
          "+ CRIAR CUPOM" quebrava em duas linhas. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Cupons de desconto</h1>
          <p className="text-[13px] text-faint mt-1">Crie códigos para seus clientes usarem na hora de comprar.</p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setError(''); }}
          className={`w-full sm:w-auto shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 h-11 px-5 text-[13px] font-semibold border transition-colors ${ showForm ? 'border-mist text-mid hover:bg-warm' : 'bg-ink text-paper border-ink hover:bg-ink/80' } rounded-full`}>
          {showForm ? 'Cancelar' : <><span aria-hidden="true" className="text-[16px] leading-none">+</span> Criar cupom</>}
        </button>
      </div>

      {!showForm && error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold flex items-center gap-1 rounded-lg"><IconAlert size={11} />{error}</div>
      )}

      {showForm && (
        <div className="bg-paper border border-mist p-5 mb-6 rounded-xl">
          <h2 className="text-[14px] font-bold text-ink mb-4">Novo cupom</h2>
          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold flex items-center gap-1 rounded-lg"><IconAlert size={11} />{error}</div>}

          <div className="flex flex-col gap-4">
            <Field label="Código do cupom" required hint="É o que o cliente digita na hora de comprar.">
              {p => (
                <input {...p} value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="Ex: VERAO20, BEMVINDO10"
                  className="panel-input font-mono uppercase placeholder:normal-case placeholder:font-sans" />
              )}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tipo de desconto">
                {p => (
                  <Select
                    value={form.type}
                    onChange={v => setForm(f => ({ ...f, type: v as 'percent' | 'fixed' }))}
                    options={[
                      { value: 'percent', label: 'Porcentagem (ex: 10% off)' },
                      { value: 'fixed', label: 'Valor fixo (ex: R$ 20 off)' },
                    ]}
                    triggerId={p.id}
                    triggerClassName="panel-input flex items-center justify-between gap-2 cursor-pointer"
                  />
                )}
              </Field>
              <Field label={form.type === 'percent' ? 'Quantos % de desconto?' : 'Quantos R$ de desconto?'} required>
                {p => (
                  <input {...p} type="number" min={0} value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                    className="panel-input" />
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Valor mínimo do pedido (R$)" hint="Deixe 0 para não exigir mínimo.">
                {p => (
                  <input {...p} type="number" min={0} value={form.minOrderCents}
                    onChange={e => setForm(f => ({ ...f, minOrderCents: Number(e.target.value) }))}
                    placeholder="0 = sem mínimo"
                    className="panel-input" />
                )}
              </Field>
              <Field label="Quantas vezes pode ser usado?">
                {p => (
                  <input {...p} type="number" min={1} value={form.maxUses}
                    onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                    className="panel-input" />
                )}
              </Field>
            </div>

            <Field label="Data de validade" hint="Deixe em branco para o cupom nunca expirar.">
              {p => (
                <input {...p} type="date" value={form.expiresAt}
                  onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="panel-input" />
              )}
            </Field>

            {form.code && form.value > 0 && (
              <div className="bg-clay-l/5 border border-clay-l/20 px-4 py-3 rounded-xl">
                <p className="text-[12px] text-ink">
                  <IconInfo size={13} className="text-mid" /> <strong>Resumo:</strong> O cupom <strong className="font-mono">{form.code || '...'}</strong> vai dar{' '}
                  <strong>{form.type === 'percent' ? `${form.value}%` : formatCurrency(Math.round(form.value * 100))} de desconto</strong>
                  {form.minOrderCents > 0 && ` em pedidos acima de ${formatCurrency(Math.round(form.minOrderCents * 100))}`}
                  {` e pode ser usado ${form.maxUses} vez${form.maxUses !== 1 ? 'es' : ''}`}
                  {form.expiresAt && ` até ${new Date(form.expiresAt + 'T00:00:00').toLocaleDateString('pt-BR')}`}.
                </p>
              </div>
            )}
          </div>

          <button onClick={handleCreate} disabled={saving}
            className="mt-5 w-full bg-ink text-paper text-sm font-semibold py-3.5 disabled:opacity-50 hover:bg-ink/80 transition-colors rounded-xl">
            {saving ? 'Criando…' : 'Criar cupom'}
          </button>
        </div>
      )}

      {coupons === null ? (
        <PainelSkeleton rows={3} />
      ) : loadError ? (
        <PanelErrorState message="Não foi possível carregar os cupons." />
      ) : coupons.length === 0 ? (
        <div className="panel-card panel-empty">
          <span className="panel-empty-icon"><IconCoupons size={20} /></span>
          <p className="text-[13px] font-medium text-ink">Nenhum cupom ainda</p>
          <p className="text-[12px] text-faint mt-1">Crie um cupom para oferecer desconto no checkout.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {coupons.map(c => (
            // Pausado esmaece só o conteúdo: o botão de reativar continua
            // nítido (antes o cartão inteiro, botão incluso, ia a 50%).
            <div key={c.id} className="border border-mist bg-paper px-5 py-4 rounded-2xl">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className={`min-w-0 transition-opacity ${!c.active ? 'opacity-50' : ''}`}>
                  <span className="font-mono font-bold text-ink text-lg tracking-wider">{c.code}</span>
                  <p className="text-[13px] text-mid mt-0.5">{desconto(c)}{c.minOrderCents > 0 && ` em pedidos acima de ${formatCurrency(c.minOrderCents)}`}</p>
                </div>
                <button onClick={() => toggleActive(c.id, c.active)}
                  aria-pressed={c.active}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-9 text-[12px] font-semibold px-3.5 border transition-colors ${ c.active ? 'border-emerald-600/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' : 'border-mist text-mid hover:bg-warm' } rounded-full`}>
                  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-emerald-600' : 'bg-faint'}`} />
                  {c.active ? 'Ativo' : 'Pausado'}
                </button>
              </div>
              <div className={`flex items-center justify-between gap-3 text-[11px] text-faint pt-3 border-t border-mist ${!c.active ? '[&>span]:opacity-60' : ''}`}>
                <span>
                  Usado <strong>{c.usedCount ?? 0}</strong>{c.maxUses ? <> de <strong>{c.maxUses}</strong></> : null} {(c.usedCount ?? 0) === 1 && !c.maxUses ? 'vez' : 'vezes'}{!c.maxUses && ' · sem limite'}
                  {c.expiresAt && ` · Válido até ${new Date(c.expiresAt.length === 10 ? `${c.expiresAt}T12:00:00` : c.expiresAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`}
                </span>
                <button onClick={() => remove(c.id)} className="inline-flex items-center min-h-10 px-2 -mr-2 text-red-700 hover:text-red-800 font-semibold transition-colors">Apagar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
