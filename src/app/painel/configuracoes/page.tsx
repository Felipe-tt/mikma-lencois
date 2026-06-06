'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';

type Section = 'identidade' | 'textos' | 'sobre' | 'logistica';
const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'identidade', label: 'Identidade', icon: '🏪' },
  { id: 'textos', label: 'Textos', icon: '✏️' },
  { id: 'sobre', label: 'Sobre', icon: '📖' },
  { id: 'logistica', label: 'Logística', icon: '🚚' },
];

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<StoreSettings>(STORE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState<Section>('identidade');

  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then(snap => {
      if (snap.exists()) setSettings({ ...STORE_DEFAULTS, ...snap.data() });
      setLoading(false);
    });
  }, []);

  const set = (field: keyof StoreSettings, value: string | number) =>
    setSettings(s => ({ ...s, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    await setDoc(doc(db, 'settings', 'store'), settings, { merge: true });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return (
    <div className="flex flex-col gap-4">
      {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl bg-mist/40 animate-pulse" />)}
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Configurações</h1>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600 font-semibold">✓ Salvo</span>}
          <button
            onClick={handleSave} disabled={saving}
            className="bg-ink text-paper text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 active:bg-ink/80 transition-colors"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Tabs — scroll horizontal, sem overflow no mobile */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              active === s.id ? 'bg-ink text-paper' : 'text-mid hover:bg-warm border border-mist'
            }`}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {active === 'identidade' && <>
          <Field label="Nome da loja" value={settings.storeName} onChange={v => set('storeName', v)} />
          <Field label="Slogan" value={settings.storeSlogan} onChange={v => set('storeSlogan', v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade" value={settings.storeCity} onChange={v => set('storeCity', v)} placeholder="Blumenau, SC" />
            <Field label="Estado (sigla)" value={settings.storeState} onChange={v => set('storeState', v)} placeholder="SC" maxLength={2} />
          </div>
          <Field label="Endereço (rua + número)" value={settings.storeAddress} onChange={v => set('storeAddress', v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bairro" value={settings.storeNeighborhood} onChange={v => set('storeNeighborhood', v)} />
            <Field label="CEP" value={settings.storeCep} onChange={v => set('storeCep', v)} placeholder="" />
          </div>
          <Field label="WhatsApp / Telefone" value={settings.storePhone} onChange={v => set('storePhone', v)} placeholder="+55 47 99999-0000" />
          <Field label="E-mail de contato" value={settings.storeEmail} onChange={v => set('storeEmail', v)} placeholder="contato@loja.com.br" />
        </>}

        {active === 'textos' && <>
          <Field label="Barra superior (topbar)" value={settings.topbarText} onChange={v => set('topbarText', v)} hint="Aparece no topo de todas as páginas" />
          <Field label="Tag do hero" value={settings.heroTag} onChange={v => set('heroTag', v)} hint="Ex: Blumenau, SC — Coleção" />
          <Textarea label="Título do hero" value={settings.heroTitle} onChange={v => set('heroTitle', v)} hint="Use quebra de linha para controlar o layout" rows={3} />
          <Field label="Subtítulo do hero" value={settings.heroSubtitle} onChange={v => set('heroSubtitle', v)} />
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint pt-1">Tags flutuantes (desktop)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tag 1 — label" value={settings.heroFloatTag1Label} onChange={v => set('heroFloatTag1Label', v)} placeholder="400 fios" />
            <Field label="Tag 1 — valor" value={settings.heroFloatTag1Value} onChange={v => set('heroFloatTag1Value', v)} placeholder="100% Algodão" />
            <Field label="Tag 2 — label" value={settings.heroFloatTag2Label} onChange={v => set('heroFloatTag2Label', v)} placeholder="Entrega" />
            <Field label="Tag 2 — valor" value={settings.heroFloatTag2Value} onChange={v => set('heroFloatTag2Value', v)} placeholder="Em 1h" />
          </div>
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint pt-1">Diferenciais</p>
          {[1,2,3].map(n => (
            <div key={n} className="grid grid-cols-2 gap-3">
              <Field label={`Diferencial ${n} — título`} value={(settings as Record<string,string>)[`feat${n}Title`]} onChange={v => set(`feat${n}Title` as keyof StoreSettings, v)} />
              <Field label={`Diferencial ${n} — descrição`} value={(settings as Record<string,string>)[`feat${n}Sub`]} onChange={v => set(`feat${n}Sub` as keyof StoreSettings, v)} />
            </div>
          ))}
        </>}

        {active === 'sobre' && <>
          <Textarea label="Parágrafo 1" value={settings.aboutPara1} onChange={v => set('aboutPara1', v)} rows={4} />
          <Textarea label="Parágrafo 2" value={settings.aboutPara2} onChange={v => set('aboutPara2', v)} rows={4} />
          <Textarea label="Parágrafo 3" value={settings.aboutPara3} onChange={v => set('aboutPara3', v)} rows={4} />
        </>}

        {active === 'logistica' && <>
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint">Origem das entregas</p>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Latitude" value={settings.originLat} onChange={v => set('originLat', v)} step={0.0001} />
            <NumField label="Longitude" value={settings.originLng} onChange={v => set('originLng', v)} step={0.0001} />
          </div>
          <Field label="CEP de origem (frete)" value={settings.originCep} onChange={v => set('originCep', v)} placeholder="" />
          <NumField label="Raio entrega local — Uber Direct (km)" value={settings.localDeliveryRadiusKm} onChange={v => set('localDeliveryRadiusKm', v)} hint={`Pedidos dentro de ${settings.localDeliveryRadiusKm} km → Uber Direct`} min={1} max={100} />
          <NumField label="Peso padrão por unidade (kg)" value={settings.defaultItemWeightKg} onChange={v => set('defaultItemWeightKg', v)} step={0.1} hint="Usado para cotação Melhor Envio" />
          <Field label="Horário de corte (HH:MM)" value={settings.dispatchCutoffTime} onChange={v => set('dispatchCutoffTime', v)} type="time" hint={`Após ${settings.dispatchCutoffTime} → despacho no próximo dia útil`} />
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint pt-1">Frete grátis</p>
          <NumField
            label="Frete grátis a partir de (R$) — 0 desativa"
            value={settings.freeShippingThresholdCents / 100}
            onChange={v => set('freeShippingThresholdCents', Math.round(v * 100))}
            hint={settings.freeShippingThresholdCents === 0 ? 'Desativado' : `Grátis acima de R$ ${(settings.freeShippingThresholdCents / 100).toFixed(2)}`}
            min={0}
          />
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint pt-1">Estoque</p>
          <NumField label="Alerta de estoque baixo (unidades)" value={settings.lowStockThreshold} onChange={v => set('lowStockThreshold', v)} min={0} />
        </>}
      </div>

      {/* Botão salvar no rodapé — fácil de alcançar no mobile */}
      <div className="mt-8 pb-6">
        <button
          onClick={handleSave} disabled={saving}
          className="w-full bg-ink text-paper text-sm font-semibold py-4 rounded-xl disabled:opacity-50 active:bg-ink/80 transition-colors"
        >
          {saving ? 'Salvando…' : saved ? '✓ Salvo!' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint, placeholder, maxLength, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  hint?: string; placeholder?: string; maxLength?: number; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-mid mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20" />
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

function Textarea({ label, value, onChange, hint, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-mid mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20 resize-y" />
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

function NumField({ label, value, onChange, hint, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  hint?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-mid mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min} max={max} step={step} inputMode="decimal"
        className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20" />
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}
