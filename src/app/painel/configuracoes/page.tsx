'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';
import { PreviewModal, PreviewButton } from '@/components/painel/PreviewModal';
import { HeroPreview, FeaturedPreview, CtaPreview } from '@/components/painel/preview/HomePreview';
import { FooterPreview } from '@/components/painel/preview/FooterPreview';
import { SobrePreview } from '@/components/painel/preview/SobrePreview';
import { BusinessHoursEditor } from '@/components/painel/BusinessHoursEditor';
import { parseBusinessHours, serializeBusinessHours } from '@/lib/business-hours';
import { maskCnpj, isValidCnpj } from '@/lib/masks';

type Section = 'loja' | 'homepage' | 'sobre' | 'entrega';
const SECTIONS: { id: Section; label: string; icon: string; desc: string }[] = [
  { id: 'loja',     label: 'Minha loja',  icon: '🏪', desc: 'Nome, endereço e contatos' },
  { id: 'homepage', label: 'Página inicial', icon: '🖥️', desc: 'Textos e banners' },
  { id: 'sobre',    label: 'Sobre nós',   icon: '📖', desc: 'História e informações' },
  { id: 'entrega',  label: 'Entregas',    icon: '🚚', desc: 'Frete e logística' },
];

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<StoreSettings>(STORE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState<Section>('loja');
  const [preview, setPreview] = useState<null | 'hero' | 'featured' | 'cta' | 'footer' | 'sobre'>(null);

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
      {[1,2,3,4].map(i => <div key={i} className="h-12 skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Painel</p>
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Configurações</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-0.5 scrollbar-none">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`shrink-0 flex flex-col items-start px-4 py-3 text-left border transition-colors ${
              active === s.id
                ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]'
                : 'text-[#705A48] border-[#E6DFD5] bg-[#FAF8F5] hover:bg-[#F0EBE1]'
            }`}
          >
            <span className="text-base mb-0.5">{s.icon}</span>
            <span className="text-[12px] font-bold">{s.label}</span>
            <span className={`text-[10px] ${active === s.id ? 'text-[#FAF8F5]/60' : 'text-[#B09C8C]'}`}>{s.desc}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6">

        {/* ── MINHA LOJA ── */}
        {active === 'loja' && <>
          <Section title="Identidade" desc="Como sua loja aparece para os clientes">
            <Field label="Nome da loja" value={settings.storeName} onChange={v => set('storeName', v)} placeholder="Mikma Lençóis" hint="Aparece no topo do site e no rodapé" />
            <Field label="Slogan" value={settings.storeSlogan} onChange={v => set('storeSlogan', v)} placeholder="Conforto direto da fábrica" hint="Frase curta que resume sua loja" />
            <Field
              label="CNPJ"
              value={settings.storeCnpj ?? ''}
              onChange={v => set('storeCnpj', maskCnpj(v))}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              hint={
                !settings.storeCnpj
                  ? 'Opcional, mas recomendado — usado em notas fiscais e rodapé do site'
                  : isValidCnpj(settings.storeCnpj)
                    ? '✅ CNPJ válido'
                    : '⚠️ CNPJ incompleto ou inválido'
              }
            />
          </Section>

          <Section title="Endereço" desc="Onde sua loja fica fisicamente">
            <Field label="Rua e número" value={settings.storeAddress} onChange={v => set('storeAddress', v)} placeholder="Rua das Flores, 123" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bairro" value={settings.storeNeighborhood} onChange={v => set('storeNeighborhood', v)} placeholder="Centro" />
              <Field label="CEP" value={settings.storeCep} onChange={v => set('storeCep', v)} placeholder="89000-000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade" value={settings.storeCity} onChange={v => set('storeCity', v)} placeholder="Blumenau" />
              <Field label="Estado" value={settings.storeState} onChange={v => set('storeState', v)} placeholder="SC" maxLength={2} />
            </div>
          </Section>

          <Section title="Horário de funcionamento" desc="Configure os dias e horários em que sua loja atende — pode ter mais de um intervalo por dia" onPreview={() => setPreview('sobre')}>
            <BusinessHoursEditor
              value={parseBusinessHours(settings.businessHours)}
              onChange={next => set('businessHours', serializeBusinessHours(next))}
            />
            <div className="pt-1">
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Fuso horário</label>
              <select
                value={settings.businessHoursTimezone || 'America/Sao_Paulo'}
                onChange={e => set('businessHoursTimezone', e.target.value)}
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60"
              >
                <option value="America/Sao_Paulo">Brasília (GMT-3) — a maior parte do Brasil</option>
                <option value="America/Manaus">Manaus (GMT-4)</option>
                <option value="America/Rio_Branco">Rio Branco / Acre (GMT-5)</option>
                <option value="America/Noronha">Fernando de Noronha (GMT-2)</option>
              </select>
              <p className="mt-1.5 text-[11px] text-[#B09C8C] leading-relaxed">
                Usado para calcular corretamente se a loja está &quot;aberta agora&quot; no site
              </p>
            </div>
          </Section>

          <Section title="Contato" desc="Como os clientes falam com você" onPreview={() => setPreview('footer')}>
            <Field label="WhatsApp" value={settings.storePhone} onChange={v => set('storePhone', v)} placeholder="(47) 99999-0000" hint="Número que os clientes vão usar para te chamar" />
            <Field label="E-mail" value={settings.storeEmail} onChange={v => set('storeEmail', v)} placeholder="contato@minhaloja.com.br" />
            <Field
              label="Link do WhatsApp"
              value={settings.whatsappUrl ?? ''}
              onChange={v => set('whatsappUrl', v)}
              placeholder="https://wa.me/5547999990000"
              hint='Cole o link gerado em wa.me — é o botão "Falar no WhatsApp" do site'
            />
            <Field
              label="Link do Instagram"
              value={settings.instagramUrl ?? ''}
              onChange={v => set('instagramUrl', v)}
              placeholder="https://instagram.com/minhaloja"
              hint="Aparece no rodapé do site"
            />
          </Section>
        </>}

        {/* ── HOMEPAGE ── */}
        {active === 'homepage' && <>
          <Section title="Barra de aviso (topo)" desc="Faixa que aparece no topo de todas as páginas" onPreview={() => setPreview('hero')}>
            <Field
              label="Texto do aviso"
              value={settings.topbarText}
              onChange={v => set('topbarText', v)}
              placeholder="🚚 Entrega grátis acima de R$ 199 · Blumenau em 1h"
              hint="Deixe em branco para ocultar a barra"
            />
          </Section>

          <Section title="Banner principal (hero)" desc="A primeira coisa que o cliente vê ao entrar no site" onPreview={() => setPreview('hero')}>
            <Field label="Pequena tag acima do título" value={settings.heroTag} onChange={v => set('heroTag', v)} placeholder="Blumenau, SC — Coleção 2025" hint='Ex: "Novidades" ou "Coleção Verão"' />
            <Field label="Título — linha 1" value={settings.heroLine1 ?? ''} onChange={v => set('heroLine1', v)} placeholder="O conforto" />
            <Field label="Título — linha 2 (aparece em laranja)" value={settings.heroLine2 ?? ''} onChange={v => set('heroLine2', v)} placeholder="que acompanha" />
            <Field label="Título — linha 3" value={settings.heroLine3 ?? ''} onChange={v => set('heroLine3', v)} placeholder="seus sonhos." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tag flutuante 1 — nome" value={settings.heroFloatTag1Label} onChange={v => set('heroFloatTag1Label', v)} placeholder="Fios" />
              <Field label="Tag flutuante 1 — detalhe" value={settings.heroFloatTag1Value} onChange={v => set('heroFloatTag1Value', v)} placeholder="400 fios" />
              <Field label="Tag flutuante 2 — nome" value={settings.heroFloatTag2Label} onChange={v => set('heroFloatTag2Label', v)} placeholder="Entrega" />
              <Field label="Tag flutuante 2 — detalhe" value={settings.heroFloatTag2Value} onChange={v => set('heroFloatTag2Value', v)} placeholder="Em 1h" />
            </div>
          </Section>

          <Section title="Selos de confiança" desc="Aparecem logo abaixo do banner principal — mostre seus diferenciais" onPreview={() => setPreview('hero')}>
            <Field label="Selo 1" value={settings.heroTrust1 ?? ''} onChange={v => set('heroTrust1', v)} placeholder="Entrega em 1h em Blumenau" />
            <Field label="Selo 2" value={settings.heroTrust2 ?? ''} onChange={v => set('heroTrust2', v)} placeholder="Frete para todo o Brasil" />
            <Field label="Selo 3" value={settings.heroTrust3 ?? ''} onChange={v => set('heroTrust3', v)} placeholder="Pague com PIX" />
            <Field label="Selo 4" value={settings.heroTrust4 ?? ''} onChange={v => set('heroTrust4', v)} placeholder="Qualidade direto de fábrica" />
          </Section>

          <Section title="Diferenciais" desc="⚠️ Estes campos não estão sendo exibidos no site atualmente — preenchimento sem efeito até serem reativados no código">
            {([1,2,3] as const).map(n => {
              const s = settings as unknown as Record<string,string>;
              return (
                <div key={n} className="grid grid-cols-2 gap-3">
                  <Field label={`Card ${n} — título`} value={s[`feat${n}Title`] ?? ''} onChange={v => set(`feat${n}Title` as keyof StoreSettings, v)} placeholder="Entrega rápida" />
                  <Field label={`Card ${n} — descrição`} value={s[`feat${n}Sub`] ?? ''} onChange={v => set(`feat${n}Sub` as keyof StoreSettings, v)} placeholder="Em até 1 hora" />
                </div>
              );
            })}
          </Section>

          <Section title="Seção de estatísticas" desc="Números que aparecem no banner escuro da homepage" onPreview={() => setPreview('featured')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pedidos entregues" value={settings.statOrders} onChange={v => set('statOrders', v)} placeholder="1.200+" />
              <Field label="Avaliação dos clientes" value={settings.statRating} onChange={v => set('statRating', v)} placeholder="4.9 ⭐" />
              <Field label="Tempo de entrega local" value={settings.statDelivery} onChange={v => set('statDelivery', v)} placeholder="< 1h" />
              <Field label="Anos no mercado" value={settings.statYears} onChange={v => set('statYears', v)} placeholder="6 anos" />
            </div>
            <Field label="Título da grade de produtos" value={settings.featuredTitle} onChange={v => set('featuredTitle', v)} placeholder="Escolhas da semana" hint='Aparece acima dos produtos em destaque' />
          </Section>

          <Section title="Frase de chamada (seção escura)" desc="Aparece no final da homepage com dois botões" onPreview={() => setPreview('cta')}>
            <Field label="Linha 1 da frase" value={settings.ctaSloganLine1 ?? ''} onChange={v => set('ctaSloganLine1', v)} placeholder="Feito em Blumenau." />
            <Field label="Linha 2 da frase (em laranja)" value={settings.ctaSloganLine2 ?? ''} onChange={v => set('ctaSloganLine2', v)} placeholder="Dorme bem." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Botão principal" value={settings.ctaBtn1 ?? ''} onChange={v => set('ctaBtn1', v)} placeholder="Comprar agora" />
              <Field label="Botão secundário" value={settings.ctaBtn2 ?? ''} onChange={v => set('ctaBtn2', v)} placeholder="Nossa história" />
            </div>
          </Section>
        </>}

        {/* ── SOBRE NÓS ── */}
        {active === 'sobre' && <>
          <Section title="Cabeçalho da página" desc="O título grande que aparece no topo da página Sobre nós" onPreview={() => setPreview('sobre')}>
            <Field label="Linha principal (em laranja)" value={settings.aboutHeroLine1} onChange={v => set('aboutHeroLine1', v)} placeholder={settings.storeName || 'Mikma Lençóis'} />
            <Field label="Linha secundária (em cinza)" value={settings.aboutHeroLine2} onChange={v => set('aboutHeroLine2', v)} placeholder={`em ${settings.storeCity || 'Blumenau'}, SC.`} />
          </Section>

          <Section title="Texto da página" desc="Conte sua história para os clientes — até 3 parágrafos" onPreview={() => setPreview('sobre')}>
            <Textarea label="Parágrafo 1" value={settings.aboutPara1} onChange={v => set('aboutPara1', v)} rows={4} placeholder="A Mikma nasceu em Blumenau com o objetivo de..." />
            <Textarea label="Parágrafo 2 (opcional)" value={settings.aboutPara2} onChange={v => set('aboutPara2', v)} rows={3} />
            <Textarea label="Parágrafo 3 (opcional)" value={settings.aboutPara3} onChange={v => set('aboutPara3', v)} rows={3} />
          </Section>

          <Section title="Informações em destaque" desc="Os 3 cards que aparecem na lateral direita da página" onPreview={() => setPreview('sobre')}>
            <div className="flex flex-col gap-4">
              {([
                { labelF: 'aboutStat1Label', valueF: 'aboutStat1Value', placeholderL: 'Localização', placeholderV: 'Blumenau, SC' },
                { labelF: 'aboutStat2Label', valueF: 'aboutStat2Value', placeholderL: 'Entrega local', placeholderV: 'Até 1 hora' },
                { labelF: 'aboutStat3Label', valueF: 'aboutStat3Value', placeholderL: 'Cobertura', placeholderV: 'Todo o Brasil' },
              ] as const).map((row, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 items-end">
                  <Field label={`Card ${i+1} — título`} value={(settings as any)[row.labelF]} onChange={v => set(row.labelF as any, v)} placeholder={row.placeholderL} />
                  <Field label={`Card ${i+1} — valor`} value={(settings as any)[row.valueF]} onChange={v => set(row.valueF as any, v)} placeholder={row.placeholderV} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Botão de contato" desc="O botão de WhatsApp que aparece na lateral" onPreview={() => setPreview('sobre')}>
            <Field label="Texto do botão" value={settings.aboutWhatsappLabel} onChange={v => set('aboutWhatsappLabel', v)} placeholder="Falar no WhatsApp" />
          </Section>

          <Section title="Linha do tempo" desc="Mostre os marcos da história da sua empresa — adicione quantos quiser" onPreview={() => setPreview('sobre')}>
            <Field label="Título da seção" value={settings.aboutTimelineTitle} onChange={v => set('aboutTimelineTitle', v)} placeholder="Nossa trajetória" />
            <TimelineEditor value={settings.aboutTimeline} onChange={v => set('aboutTimeline', v)} />
          </Section>
        </>}

        {/* ── ENTREGAS ── */}
        {active === 'entrega' && <>
          <Section title="Endereço de origem" desc="De onde seus produtos saem para entrega — usado para calcular frete">
            <Field label="CEP de onde você envia" value={settings.originCep} onChange={v => set('originCep', v)} placeholder="89000-000" hint="Usado para calcular o frete automaticamente" />
            <NumField
              label="Raio de entrega rápida (km)"
              value={settings.localDeliveryRadiusKm}
              onChange={v => set('localDeliveryRadiusKm', v)}
              hint={`Pedidos dentro de ${settings.localDeliveryRadiusKm} km recebem opção de entrega em 1h via Uber Direct`}
              min={1} max={100}
            />
            <details className="border border-[#E6DFD5] rounded">
              <summary className="px-3 py-2.5 text-[12px] text-[#B09C8C] cursor-pointer select-none">⚙️ Configurações avançadas (coordenadas GPS)</summary>
              <div className="px-3 pb-3 pt-2 flex flex-col gap-3">
                <p className="text-[11px] text-[#B09C8C]">Só mexa aqui se souber o que está fazendo. Cole as coordenadas do seu endereço.</p>
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="Latitude" value={settings.originLat} onChange={v => set('originLat', v)} step={0.0001} />
                  <NumField label="Longitude" value={settings.originLng} onChange={v => set('originLng', v)} step={0.0001} />
                </div>
              </div>
            </details>
          </Section>

          <Section title="Frete grátis" desc="A partir de qual valor o frete é de graça">
            <NumField
              label="Valor mínimo para frete grátis (R$)"
              value={settings.freeShippingThresholdCents / 100}
              onChange={v => set('freeShippingThresholdCents', Math.round(v * 100))}
              hint={settings.freeShippingThresholdCents === 0 ? '⚠️ Frete grátis desativado — coloque 0 para manter desativado' : `✅ Frete grátis em pedidos acima de R$ ${(settings.freeShippingThresholdCents / 100).toFixed(2)}`}
              min={0}
            />
          </Section>

          <Section title="Operação" desc="Horários e peso dos produtos">
            <Field
              label="Horário limite para envio hoje"
              value={settings.dispatchCutoffTime}
              onChange={v => set('dispatchCutoffTime', v)}
              type="time"
              hint={`Pedidos feitos após ${settings.dispatchCutoffTime} são enviados no próximo dia útil`}
            />
            <NumField
              label="Peso médio de cada produto (kg)"
              value={settings.defaultItemWeightKg}
              onChange={v => set('defaultItemWeightKg', v)}
              step={0.1}
              hint="Usado para calcular o frete — coloque o peso médio de um lençol embalado"
            />
          </Section>

          <Section title="Estoque" desc="Alertas para quando o produto está acabando">
            <NumField
              label="Avisar quando restar quantas unidades?"
              value={settings.lowStockThreshold}
              onChange={v => set('lowStockThreshold', v)}
              min={0}
              hint={`O produto vai aparecer como "Últimas unidades" quando restar ${settings.lowStockThreshold} ou menos`}
            />
          </Section>

          <Section title="Pagamento por Cartão" desc="Habilite o cartão de crédito a partir de um valor mínimo de pedido">
            <NumField
              label="Valor mínimo para cartão de crédito (R$) — 0 desativa"
              value={settings.creditMinOrderCents / 100}
              onChange={v => set('creditMinOrderCents', Math.round(v * 100))}
              min={0}
              hint={settings.creditMinOrderCents === 0
                ? 'Cartão desativado — apenas PIX disponível no checkout'
                : `Cartão habilitado para pedidos acima de R$ ${(settings.creditMinOrderCents / 100).toFixed(2)}`}
            />
          </Section>
        </>}
      </div>

      {/* Save button */}
      <div className="mt-10 pb-8">
        <button
          onClick={handleSave} disabled={saving}
          className="w-full bg-[#1E1208] text-[#FAF8F5] text-sm font-semibold py-4 disabled:opacity-50 hover:bg-[#1E1208]/80 transition-colors"
        >
          {saving ? 'Salvando…' : saved ? '✅ Salvo com sucesso!' : 'Salvar configurações'}
        </button>
        {saved && <p className="text-center text-[12px] text-[#B09C8C] mt-2">As mudanças podem levar até 10 minutos para aparecer no site.</p>}
      </div>

      {/* ── Previews ── */}
      <PreviewModal open={preview === 'hero'} onClose={() => setPreview(null)} title="Banner principal" routeLabel="/">
        <HeroPreview s={settings} />
      </PreviewModal>

      <PreviewModal open={preview === 'featured'} onClose={() => setPreview(null)} title="Produtos em destaque" routeLabel="/">
        <FeaturedPreview s={settings} />
      </PreviewModal>

      <PreviewModal open={preview === 'cta'} onClose={() => setPreview(null)} title="Frase de chamada" routeLabel="/">
        <CtaPreview s={settings} />
      </PreviewModal>

      <PreviewModal open={preview === 'footer'} onClose={() => setPreview(null)} title="Rodapé do site" routeLabel="/">
        <FooterPreview s={settings} />
      </PreviewModal>

      <PreviewModal open={preview === 'sobre'} onClose={() => setPreview(null)} title="Página Sobre nós" routeLabel="/sobre">
        <SobrePreview s={settings} />
      </PreviewModal>
    </div>
  );
}

/* ── Componentes de layout ── */

function Section({ title, desc, children, onPreview }: { title: string; desc: string; children: React.ReactNode; onPreview?: () => void }) {
  return (
    <div className="border border-[#E6DFD5] bg-white">
      <div className="px-5 py-4 border-b border-[#E6DFD5] bg-[#FAF8F5] flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-[#1E1208]">{title}</p>
          <p className="text-[11px] text-[#B09C8C] mt-0.5">{desc}</p>
        </div>
        {onPreview && (
          <div className="shrink-0 pt-0.5">
            <PreviewButton onClick={onPreview} />
          </div>
        )}
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}

/* ── Campos de formulário ── */

function Field({ label, value, onChange, hint, placeholder, maxLength, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  hint?: string; placeholder?: string; maxLength?: number; type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 placeholder:text-[#C8BAB0]" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C] leading-relaxed">{hint}</p>}
    </div>
  );
}

function Textarea({ label, value, onChange, hint, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 resize-y placeholder:text-[#C8BAB0]" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C] leading-relaxed">{hint}</p>}
    </div>
  );
}

function NumField({ label, value, onChange, hint, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  hint?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">{label}</label>
      <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min} max={max} step={step} inputMode="decimal"
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C] leading-relaxed">{hint}</p>}
    </div>
  );
}

/* ── Timeline dinâmica ── */

type TimelineItem = { year: string; label: string; desc: string };

function TimelineEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parse = (v: string): TimelineItem[] => {
    try { return JSON.parse(v) || []; } catch { return []; }
  };
  const items = parse(value);
  const update = (next: TimelineItem[]) => onChange(JSON.stringify(next));
  const setItem = (i: number, field: keyof TimelineItem, val: string) =>
    update(items.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const add = () => update([...items, { year: '', label: '', desc: '' }]);
  const remove = (i: number) => update(items.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="text-[12px] text-[#B09C8C] text-center py-4 border border-dashed border-[#E6DFD5]">
          Nenhum marco adicionado ainda. Clique em &quot;Adicionar marco&quot; para começar.
        </p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-3 border border-[#E6DFD5] bg-[#FAF8F5] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-[#1E1208]">Marco {i + 1}</p>
            <button onClick={() => remove(i)} className="text-[11px] text-[#B09C8C] hover:text-red-500 transition-colors underline">
              Remover
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Ano</label>
              <input value={item.year} onChange={e => setItem(i, 'year', e.target.value)} placeholder="2018"
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 placeholder:text-[#C8BAB0]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Nome do marco</label>
              <input value={item.label} onChange={e => setItem(i, 'label', e.target.value)} placeholder="ex: Fundação"
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 placeholder:text-[#C8BAB0]" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">O que aconteceu?</label>
            <textarea value={item.desc} onChange={e => setItem(i, 'desc', e.target.value)} rows={2}
              placeholder="Descreva esse momento da história da empresa..."
              className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 resize-y placeholder:text-[#C8BAB0]" />
          </div>
        </div>
      ))}
      <button onClick={add}
        className="w-full border-2 border-dashed border-[#C4714A]/30 text-[#C4714A] text-[13px] font-semibold py-3 hover:bg-[#C4714A]/5 hover:border-[#C4714A]/60 transition-all">
        + Adicionar marco
      </button>
    </div>
  );
}
