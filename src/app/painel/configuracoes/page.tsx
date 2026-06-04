'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export type StoreSettings = {
  // Identidade
  storeName: string;
  storeSlogan: string;
  storeCity: string;      // ex: "Blumenau, SC"
  storeState: string;     // ex: "SC"
  storeAddress: string;   // ex: ""
  storeNeighborhood: string;
  storeCep: string;
  storePhone: string;
  storeEmail: string;
  // Topbar / hero
  topbarText: string;     // ex: "Entrega local em 1h · PIX com confirmação automática"
  heroTitle: string;      // ex: "Lençóis feitos pra durar."
  heroSubtitle: string;
  heroTag: string;        // ex: "Blumenau, SC — Coleção 2025"
  heroFloatTag1Label: string;   // ex: "400 fios"
  heroFloatTag1Value: string;   // ex: "100% Algodão"
  heroFloatTag2Label: string;   // ex: "Entrega"
  heroFloatTag2Value: string;   // ex: "Em 1h · Blumenau"
  // Diferenciais
  feat1Title: string; feat1Sub: string;
  feat2Title: string; feat2Sub: string;
  feat3Title: string; feat3Sub: string;
  // Sobre
  aboutPara1: string;
  aboutPara2: string;
  aboutPara3: string;
  // Logística
  originLat: number;
  originLng: number;
  originCep: string;
  localDeliveryRadiusKm: number;
  defaultItemWeightKg: number;
  dispatchCutoffTime: string;
  // Frete
  freeShippingThresholdCents: number;
  // Estoque
  lowStockThreshold: number;
};

export const STORE_DEFAULTS: StoreSettings = {
  storeName: 'Mikma Lençóis',
  storeSlogan: 'Tecido que dura, conforto que fica.',
  storeCity: 'Blumenau, SC',
  storeState: 'SC',
  storeAddress: '',
  storeNeighborhood: 'Garcia',
  storeCep: '',
  storePhone: '',
  storeEmail: '',
  topbarText: 'Entrega local Blumenau em 1h · PIX com confirmação automática',
  heroTitle: 'Lençóis\nfeitos pra\ndurar.',
  heroSubtitle: 'Qualidade direto da fábrica. Entrega em até 1h em Blumenau ou para todo o Brasil.',
  heroTag: 'Blumenau, SC — Coleção',
  heroFloatTag1Label: '400 fios',
  heroFloatTag1Value: '100% Algodão',
  heroFloatTag2Label: 'Entrega',
  heroFloatTag2Value: 'Em 1h · Blumenau',
  feat1Title: 'Entrega em 1h', feat1Sub: 'Para endereços em Blumenau via Uber Direct.',
  feat2Title: 'Frete nacional', feat2Sub: 'PAC, SEDEX e transportadoras com rastreio em tempo real.',
  feat3Title: 'Pague com PIX', feat3Sub: 'Confirmação automática e instantânea.',
  aboutPara1: 'A Mikma Lençóis nasceu em Blumenau, SC, com o objetivo de oferecer produtos de cama, mesa e banho com qualidade superior, acessíveis e entregues com agilidade.',
  aboutPara2: 'Operamos com entrega local em até 1 hora via Uber Direct para endereços em Blumenau, e também enviamos para todo o Brasil com rastreamento em tempo real.',
  aboutPara3: 'Todos os pagamentos são processados via PIX com confirmação automática, garantindo praticidade para você.',
  originLat: 0,
  originLng: 0,
  originCep: '',
  localDeliveryRadiusKm: 10,
  defaultItemWeightKg: 0.8,
  dispatchCutoffTime: '17:00',
  freeShippingThresholdCents: 0,
  lowStockThreshold: 3,
};

type Section = 'identidade' | 'textos' | 'sobre' | 'logistica';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'identidade', label: 'Identidade & Contato' },
  { id: 'textos', label: 'Textos do Site' },
  { id: 'sobre', label: 'Página Sobre' },
  { id: 'logistica', label: 'Logística & Frete' },
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
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando…</div>;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Configurações da loja</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 font-medium">✓ Salvo!</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gray-900 text-white px-5 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando…' : 'Salvar tudo'}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-8 border-b border-gray-200">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === s.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {/* ── Identidade ── */}
        {active === 'identidade' && <>
          <Field label="Nome da loja" value={settings.storeName} onChange={v => set('storeName', v)} />
          <Field label="Slogan" value={settings.storeSlogan} onChange={v => set('storeSlogan', v)} />
          <Field label="Cidade (exibida no site)" value={settings.storeCity} onChange={v => set('storeCity', v)} placeholder="Blumenau, SC" />
          <Field label="Estado (sigla)" value={settings.storeState} onChange={v => set('storeState', v)} placeholder="SC" maxLength={2} />
          <Field label="Endereço (rua + número)" value={settings.storeAddress} onChange={v => set('storeAddress', v)} />
          <Field label="Bairro" value={settings.storeNeighborhood} onChange={v => set('storeNeighborhood', v)} />
          <Field label="CEP da loja" value={settings.storeCep} onChange={v => set('storeCep', v)} placeholder="" />
          <Field label="Telefone / WhatsApp" value={settings.storePhone} onChange={v => set('storePhone', v)} placeholder="+55 47 99999-0000" />
          <Field label="E-mail de contato" value={settings.storeEmail} onChange={v => set('storeEmail', v)} placeholder="contato@sualoja.com.br" />
        </>}

        {/* ── Textos do site ── */}
        {active === 'textos' && <>
          <Field label="Texto da barra superior (topbar)" value={settings.topbarText} onChange={v => set('topbarText', v)} hint="Aparece no topo de todas as páginas" />
          <Field label="Tag do hero (acima do título)" value={settings.heroTag} onChange={v => set('heroTag', v)} hint="Ex: Blumenau, SC — Coleção (o ano é adicionado automaticamente)" />
          <Textarea label="Título do hero" value={settings.heroTitle} onChange={v => set('heroTitle', v)} hint="Use quebras de linha para controlar o layout" rows={3} />
          <Field label="Subtítulo do hero" value={settings.heroSubtitle} onChange={v => set('heroSubtitle', v)} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tag flutuante 1 — label" value={settings.heroFloatTag1Label} onChange={v => set('heroFloatTag1Label', v)} placeholder="400 fios" />
            <Field label="Tag flutuante 1 — valor" value={settings.heroFloatTag1Value} onChange={v => set('heroFloatTag1Value', v)} placeholder="100% Algodão" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tag flutuante 2 — label" value={settings.heroFloatTag2Label} onChange={v => set('heroFloatTag2Label', v)} placeholder="Entrega" />
            <Field label="Tag flutuante 2 — valor" value={settings.heroFloatTag2Value} onChange={v => set('heroFloatTag2Value', v)} placeholder="Em 1h · Blumenau" />
          </div>
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-gray-400 pt-2">Diferenciais (seção abaixo do hero)</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Diferencial 1 — título" value={settings.feat1Title} onChange={v => set('feat1Title', v)} />
            <Field label="Diferencial 1 — descrição" value={settings.feat1Sub} onChange={v => set('feat1Sub', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Diferencial 2 — título" value={settings.feat2Title} onChange={v => set('feat2Title', v)} />
            <Field label="Diferencial 2 — descrição" value={settings.feat2Sub} onChange={v => set('feat2Sub', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Diferencial 3 — título" value={settings.feat3Title} onChange={v => set('feat3Title', v)} />
            <Field label="Diferencial 3 — descrição" value={settings.feat3Sub} onChange={v => set('feat3Sub', v)} />
          </div>
        </>}

        {/* ── Sobre ── */}
        {active === 'sobre' && <>
          <Textarea label="Parágrafo 1" value={settings.aboutPara1} onChange={v => set('aboutPara1', v)} rows={4} />
          <Textarea label="Parágrafo 2" value={settings.aboutPara2} onChange={v => set('aboutPara2', v)} rows={4} />
          <Textarea label="Parágrafo 3" value={settings.aboutPara3} onChange={v => set('aboutPara3', v)} rows={4} />
        </>}

        {/* ── Logística ── */}
        {active === 'logistica' && <>
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-gray-400">Origem das entregas</p>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="Latitude de origem" value={settings.originLat} onChange={v => set('originLat', v)} step={0.0001} />
            <NumField label="Longitude de origem" value={settings.originLng} onChange={v => set('originLng', v)} step={0.0001} />
          </div>
          <Field label="CEP de origem (para cálculo de frete)" value={settings.originCep} onChange={v => set('originCep', v)} placeholder="" />
          <NumField label="Raio de entrega local — Uber Direct (km)" value={settings.localDeliveryRadiusKm} onChange={v => set('localDeliveryRadiusKm', v)} hint={`Pedidos dentro de ${settings.localDeliveryRadiusKm} km usarão Uber Direct.`} min={1} max={100} />
          <NumField label="Peso padrão por unidade (kg)" value={settings.defaultItemWeightKg} onChange={v => set('defaultItemWeightKg', v)} step={0.1} hint="Usado para cotação no Melhor Envio quando o produto não tem peso cadastrado." />
          <Field label="Horário de corte para despacho (HH:MM)" value={settings.dispatchCutoffTime} onChange={v => set('dispatchCutoffTime', v)} type="time" hint={`Pedidos pagos após ${settings.dispatchCutoffTime} são despachados no próximo dia útil.`} />
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-gray-400 pt-2">Frete grátis</p>
          <NumField
            label="Frete grátis a partir de (R$) — 0 para desativar"
            value={settings.freeShippingThresholdCents / 100}
            onChange={v => set('freeShippingThresholdCents', Math.round(v * 100))}
            hint={settings.freeShippingThresholdCents === 0 ? 'Frete grátis desativado.' : `Frete grátis acima de R$ ${(settings.freeShippingThresholdCents / 100).toFixed(2)}.`}
            min={0}
          />
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-gray-400 pt-2">Estoque</p>
          <NumField label="Alerta de estoque baixo (unidades)" value={settings.lowStockThreshold} onChange={v => set('lowStockThreshold', v)} min={0} hint={`Alerta quando disponível ≤ ${settings.lowStockThreshold} unidades.`} />
        </>}
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Textarea({ label, value, onChange, hint, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900 resize-y"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function NumField({ label, value, onChange, hint, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  hint?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
