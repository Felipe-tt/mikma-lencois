'use client';

/**
 * Popup "Pesos padrão por tamanho".
 *
 * Guarda em settings/store.defaultWeightsBySize um peso (kg) sugerido pra
 * cada tamanho (solteiro/casal/queen/king/berco/unico). O ProductForm usa
 * isso pra auto-preencher o campo "Peso por unidade" assim que o admin
 * escolhe o tamanho da 1ª variação, eliminando a digitação repetida do
 * mesmo valor toda vez que cadastra um produto do mesmo tamanho.
 *
 * Sempre grava o objeto inteiro (todos os tamanhos), nunca um merge parcial
 * de chave única — getSettings()/leitura no client fazem
 * `{ ...STORE_DEFAULTS, ...docData }`, um objeto parcial aqui sobrescreveria
 * os tamanhos não alterados.
 */

import { useState } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { Overlay } from '@/components/ui/Overlay';
import { SIZES, SIZE_LABEL } from '@/lib/productOptions';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';

type Props = {
  current: StoreSettings['defaultWeightsBySize'];
  onClose: () => void;
  onSaved: (next: StoreSettings['defaultWeightsBySize']) => void;
};

export function DefaultWeightsModal({ current, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const s of SIZES) {
      const v = current[s] ?? STORE_DEFAULTS.defaultWeightsBySize[s] ?? 0.8;
      out[s] = String(v);
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setValue(size: string, v: string) {
    setValues(prev => ({ ...prev, [size]: v }));
  }

  async function handleSave(close: () => void) {
    const next: Record<string, number> = {};
    for (const s of SIZES) {
      const n = parseFloat((values[s] ?? '').replace(',', '.'));
      if (!n || n <= 0) {
        setError(`Informe um peso válido para "${SIZE_LABEL[s]}".`);
        return;
      }
      next[s] = n;
    }
    setSaving(true);
    setError('');
    try {
      // Le o doc atual pra so sobrescrever a chave defaultWeightsBySize sem
      // apagar o resto das configuracoes da loja (o doc settings/store tem
      // dezenas de outros campos nao relacionados a isso).
      const ref = doc(db, 'settings', 'store');
      const snap = await getDoc(ref);
      await setDoc(ref, { ...(snap.exists() ? snap.data() : {}), defaultWeightsBySize: next }, { merge: true });
      onSaved(next as StoreSettings['defaultWeightsBySize']);
      close();
    } catch (e) {
      console.error(e);
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay
      onClose={onClose}
      labelledBy="weights-title"
      className="bg-paper w-full max-w-sm rounded-2xl shadow-xl p-5 flex flex-col gap-4 max-h-[85dvh] overflow-y-auto overscroll-contain"
    >
      {close => (<>
        <div>
          <h2 id="weights-title" className="text-[14px] font-bold text-ink">Pesos padrão por tamanho</h2>
          <p className="text-[12px] text-faint mt-1">
            Usado pra sugerir o peso automaticamente ao cadastrar um produto novo.
            Você sempre pode ajustar o peso de um produto específico depois.
          </p>
        </div>

        {error && (
          <div role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600 rounded-xl">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {SIZES.map(s => (
            <div key={s} className="flex items-center justify-between gap-3">
              <label htmlFor={`weight-${s}`} className="text-[13px] text-mid font-medium">{SIZE_LABEL[s]}</label>
              <div className="relative w-28">
                <input
                  id={`weight-${s}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={values[s] ?? ''}
                  onChange={e => setValue(s, e.target.value)}
                  className="input-sm w-full pr-9 text-right"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-faint pointer-events-none">kg</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => handleSave(close)} disabled={saving} className="btn-primary flex-1 py-2.5 text-[13px]">
            {saving ? <><span className="spinner" />Salvando…</> : 'Salvar padrões'}
          </button>
          <button type="button" onClick={close} className="border border-mist px-4 py-2.5 text-[13px] font-medium text-mid hover:bg-warm hover:text-ink active:scale-[0.98] transition-[background-color,color,transform] duration-150 rounded-xl">
            Cancelar
          </button>
        </div>
      </>)}
    </Overlay>
  );
}
