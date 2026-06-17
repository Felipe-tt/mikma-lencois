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
    <div className="flex flex-col gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-12 bg-[#F0EBE1] animate-pulse border border-[#E6DFD5]" />)}
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Loja</p>
          <h1 className="font-display font-normal text-[#1E1208] text-2xl">Configurações</h1>
        </div>

      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-0.5 scrollbar-none">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`shrink-0 flex items-center gap-2 px-3.5 py-2 text-[11px] font-semibold tracking-wide transition-colors border ${
              active === s.id
                ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]'
                : 'text-[#705A48] border-[#E6DFD5] bg-[#FAF8F5] hover:bg-[#F0EBE1]'
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
            <Field label="CEP" value={settings.storeCep} onChange={v => set('storeCep', v)} placeholder="00000-000" />
          </div>
          <Field label="WhatsApp / Telefone" value={settings.storePhone} onChange={v => set('storePhone', v)} placeholder="+55 47 99999-0000" />
          <Field label="E-mail de contato" value={settings.storeEmail} onChange={v => set('storeEmail', v)} placeholder="contato@loja.com.br" />
          <Field label="Instagram (URL)" value={settings.instagramUrl ?? ''} onChange={v => set('instagramUrl', v)} placeholder="https://instagram.com/minhaloja" hint="Aparece no footer" />
          <Field label="WhatsApp (URL de chat)" value={settings.whatsappUrl ?? ''} onChange={v => set('whatsappUrl', v)} placeholder="https://wa.me/5547999990000" hint="Link direto para conversa" />
        </>}

        {active === 'textos' && <>
          <Field label="Barra superior (topbar)" value={settings.topbarText} onChange={v => set('topbarText', v)} hint="Aparece no topo de todas as páginas" />
          <Field label="Tag do hero" value={settings.heroTag} onChange={v => set('heroTag', v)} hint="Ex: Blumenau, SC — Coleção" />
          <Textarea label="Título do hero" value={settings.heroTitle} onChange={v => set('heroTitle', v)} hint="Use quebra de linha para controlar o layout" rows={3} />
          <Field label="Subtítulo do hero" value={settings.heroSubtitle} onChange={v => set('heroSubtitle', v)} hint="Frase abaixo do título principal" />
          <div className="border-t border-mist pt-4 mt-1">
            <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Título do hero (3 linhas)</p>
            <div className="flex flex-col gap-2">
              <Field label="Linha 1" value={settings.heroLine1 ?? ''} onChange={v => set('heroLine1', v)} placeholder="O conforto" />
              <Field label="Linha 2 (itálico colorido)" value={settings.heroLine2 ?? ''} onChange={v => set('heroLine2', v)} placeholder="que acompanha" />
              <Field label="Linha 3" value={settings.heroLine3 ?? ''} onChange={v => set('heroLine3', v)} placeholder="seus sonhos." />
            </div>
          </div>
          <div className="border-t border-mist pt-4 mt-1">
            <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Trust signals (rodapé do hero)</p>
            <div className="flex flex-col gap-2">
              <Field label="Trust 1" value={settings.heroTrust1 ?? ''} onChange={v => set('heroTrust1', v)} placeholder="Entrega em 1h em Blumenau" />
              <Field label="Trust 2" value={settings.heroTrust2 ?? ''} onChange={v => set('heroTrust2', v)} placeholder="Frete para todo o Brasil" />
              <Field label="Trust 3" value={settings.heroTrust3 ?? ''} onChange={v => set('heroTrust3', v)} placeholder="Pague com PIX" />
              <Field label="Trust 4" value={settings.heroTrust4 ?? ''} onChange={v => set('heroTrust4', v)} placeholder="Qualidade direto de fábrica" />
            </div>
          </div>
          <div className="border-t border-mist pt-4 mt-1">
            <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Seção CTA (fundo escuro) — também usado como frase grande do footer</p>
            <Field label="Linha 1 do slogan" value={settings.ctaSloganLine1 ?? ''} onChange={v => set('ctaSloganLine1', v)} placeholder="Feito em Blumenau." />
            <Field label="Linha 2 do slogan (itálico)" value={settings.ctaSloganLine2 ?? ''} onChange={v => set('ctaSloganLine2', v)} placeholder="Dorme bem." />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Field label="Botão principal" value={settings.ctaBtn1 ?? ''} onChange={v => set('ctaBtn1', v)} placeholder="Comprar agora" />
              <Field label="Botão secundário" value={settings.ctaBtn2 ?? ''} onChange={v => set('ctaBtn2', v)} placeholder="Nossa história" />
            </div>
          </div>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Tags flutuantes (desktop)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tag 1 — label" value={settings.heroFloatTag1Label} onChange={v => set('heroFloatTag1Label', v)} placeholder="400 fios" />
            <Field label="Tag 1 — valor" value={settings.heroFloatTag1Value} onChange={v => set('heroFloatTag1Value', v)} placeholder="100% Algodão" />
            <Field label="Tag 2 — label" value={settings.heroFloatTag2Label} onChange={v => set('heroFloatTag2Label', v)} placeholder="Entrega" />
            <Field label="Tag 2 — valor" value={settings.heroFloatTag2Value} onChange={v => set('heroFloatTag2Value', v)} placeholder="Em 1h" />
          </div>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Diferenciais</p>
          {([1,2,3] as const).map(n => {
            const s = settings as unknown as Record<string,string>;
            return (
              <div key={n} className="grid grid-cols-2 gap-3">
                <Field label={`Diferencial ${n} — título`} value={s[`feat${n}Title`] ?? ''} onChange={v => set(`feat${n}Title` as keyof StoreSettings, v)} />
                <Field label={`Diferencial ${n} — descrição`} value={s[`feat${n}Sub`] ?? ''} onChange={v => set(`feat${n}Sub` as keyof StoreSettings, v)} />
              </div>
            );
          })}
        </>}

        {active === 'sobre' && <>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Hero</p>
          <Field label="Linha 1 do título" value={settings.aboutHeroLine1} onChange={v => set('aboutHeroLine1', v)} placeholder={settings.storeName || 'Mikma Lençóis'} />
          <Field label="Linha 2 do título" value={settings.aboutHeroLine2} onChange={v => set('aboutHeroLine2', v)} placeholder={`em ${settings.storeCity || 'Blumenau'}, SC.`} />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Texto</p>
          <Textarea label="Parágrafo 1" value={settings.aboutPara1} onChange={v => set('aboutPara1', v)} rows={4} />
          <Textarea label="Parágrafo 2" value={settings.aboutPara2} onChange={v => set('aboutPara2', v)} rows={4} />
          <Textarea label="Parágrafo 3" value={settings.aboutPara3} onChange={v => set('aboutPara3', v)} rows={4} />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Sidebar — stats</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stat 1 — rótulo" value={settings.aboutStat1Label} onChange={v => set('aboutStat1Label', v)} placeholder="Localização" />
            <Field label="Stat 1 — valor" value={settings.aboutStat1Value} onChange={v => set('aboutStat1Value', v)} placeholder={settings.storeCity || 'Blumenau'} />
            <Field label="Stat 2 — rótulo" value={settings.aboutStat2Label} onChange={v => set('aboutStat2Label', v)} placeholder="Entrega local" />
            <Field label="Stat 2 — valor" value={settings.aboutStat2Value} onChange={v => set('aboutStat2Value', v)} placeholder="Até 1 hora" />
            <Field label="Stat 3 — rótulo" value={settings.aboutStat3Label} onChange={v => set('aboutStat3Label', v)} placeholder="Cobertura" />
            <Field label="Stat 3 — valor" value={settings.aboutStat3Value} onChange={v => set('aboutStat3Value', v)} placeholder="Todo o Brasil" />
          </div>
          <Field label="Texto do botão WhatsApp" value={settings.aboutWhatsappLabel} onChange={v => set('aboutWhatsappLabel', v)} placeholder="Falar no WhatsApp" />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Timeline</p>
          <Field label="Título" value={settings.aboutTimelineTitle} onChange={v => set('aboutTimelineTitle', v)} placeholder="Nossa trajetória" />
          <TimelineEditor value={settings.aboutTimeline} onChange={v => set('aboutTimeline', v)} />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Homepage</p>
          <Field label="Título da seção de destaques" value={settings.featuredTitle} onChange={v => set('featuredTitle', v)} placeholder="Escolhas da semana" />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Estatísticas (CTA banner)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pedidos entregues" value={settings.statOrders} onChange={v => set('statOrders', v)} placeholder="1.200+" />
            <Field label="Avaliação média" value={settings.statRating} onChange={v => set('statRating', v)} placeholder="4.9" />
            <Field label="Entrega local" value={settings.statDelivery} onChange={v => set('statDelivery', v)} placeholder="< 1h" />
            <Field label="Anos no mercado" value={settings.statYears} onChange={v => set('statYears', v)} placeholder="6 anos" />
          </div>
          <Field label="Ano de fundação" value={settings.foundedYear} onChange={v => set('foundedYear', v)} placeholder="2018" hint="Usado no rodapé" />
        </>}

        {active === 'logistica' && <>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Origem das entregas</p>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Latitude" value={settings.originLat} onChange={v => set('originLat', v)} step={0.0001} />
            <NumField label="Longitude" value={settings.originLng} onChange={v => set('originLng', v)} step={0.0001} />
          </div>
          <Field label="CEP de origem (frete)" value={settings.originCep} onChange={v => set('originCep', v)} placeholder="00000-000" />
          <NumField label="Raio entrega local — Uber Direct (km)" value={settings.localDeliveryRadiusKm} onChange={v => set('localDeliveryRadiusKm', v)} hint={`Pedidos dentro de ${settings.localDeliveryRadiusKm} km → Uber Direct`} min={1} max={100} />
          <NumField label="Peso padrão por unidade (kg)" value={settings.defaultItemWeightKg} onChange={v => set('defaultItemWeightKg', v)} step={0.1} hint="Usado para cotação Melhor Envio" />
          <Field label="Horário de corte (HH:MM)" value={settings.dispatchCutoffTime} onChange={v => set('dispatchCutoffTime', v)} type="time" hint={`Após ${settings.dispatchCutoffTime} → despacho no próximo dia útil`} />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Frete grátis</p>
          <NumField
            label="Frete grátis a partir de (R$) — 0 desativa"
            value={settings.freeShippingThresholdCents / 100}
            onChange={v => set('freeShippingThresholdCents', Math.round(v * 100))}
            hint={settings.freeShippingThresholdCents === 0 ? 'Desativado' : `Grátis acima de R$ ${(settings.freeShippingThresholdCents / 100).toFixed(2)}`}
            min={0}
          />
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] pt-2">Estoque</p>
          <NumField label="Alerta de estoque baixo (unidades)" value={settings.lowStockThreshold} onChange={v => set('lowStockThreshold', v)} min={0} />
        </>}
      </div>

      {/* Bottom save button */}
      <div className="mt-8 pb-6">
        <button
          onClick={handleSave} disabled={saving}
          className="w-full bg-[#1E1208] text-[#FAF8F5] text-sm font-semibold py-4 disabled:opacity-50 hover:bg-[#1E1208]/80 transition-colors"
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
      <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B09C8C] mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C]">{hint}</p>}
    </div>
  );
}

function Textarea({ label, value, onChange, hint, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B09C8C] mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40 resize-y" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C]">{hint}</p>}
    </div>
  );
}

function NumField({ label, value, onChange, hint, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  hint?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B09C8C] mb-1.5">{label}</label>
      <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min} max={max} step={step} inputMode="decimal"
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C]">{hint}</p>}
    </div>
  );
}

type TimelineItem = { year: string; label: string; desc: string };

function TimelineEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parse = (v: string): TimelineItem[] => {
    try { return JSON.parse(v) || []; } catch { return []; }
  };

  const items = parse(value);

  const update = (next: TimelineItem[]) => onChange(JSON.stringify(next));

  const setItem = (i: number, field: keyof TimelineItem, val: string) => {
    const next = items.map((item, idx) => idx === i ? { ...item, [field]: val } : item);
    update(next);
  };

  const add = () => update([...items, { year: '', label: '', desc: '' }]);

  const remove = (i: number) => update(items.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 border border-[#2E2217] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#B09C8C]">Marco {i + 1}</p>
            <button
              onClick={() => remove(i)}
              className="text-[11px] text-[#B09C8C] hover:text-red-500 transition-colors px-1"
            >
              Remover
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B09C8C] mb-1.5">Ano</label>
              <input value={item.year} onChange={e => setItem(i, 'year', e.target.value)} placeholder="2018"
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B09C8C] mb-1.5">Rótulo</label>
              <input value={item.label} onChange={e => setItem(i, 'label', e.target.value)} placeholder="Fundação"
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#B09C8C] mb-1.5">Descrição</label>
            <textarea value={item.desc} onChange={e => setItem(i, 'desc', e.target.value)} rows={2}
              className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40 resize-y" />
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="w-full border border-dashed border-[#C4714A]/40 text-[#C4714A] text-[12px] font-semibold py-2.5 hover:bg-[#C4714A]/5 transition-colors"
      >
        + Adicionar marco
      </button>
    </div>
  );
}
