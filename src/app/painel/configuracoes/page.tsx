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

type Tab = 'loja' | 'vitrine' | 'produto' | 'entrega';

const TABS: { id: Tab; icon: string; label: string; sub: string }[] = [
  { id: 'loja',    icon: '🏪', label: 'Minha loja',   sub: 'Nome, endereço, contato' },
  { id: 'vitrine', icon: '🖼️', label: 'Vitrine',       sub: 'Como o site aparece' },
  { id: 'produto', icon: '📦', label: 'Produtos',      sub: 'Guias e informações' },
  { id: 'entrega', icon: '🚚', label: 'Entrega',       sub: 'Frete e pagamento' },
];

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<StoreSettings>(STORE_DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [tab, setTab]           = useState<Tab>('loja');
  const [preview, setPreview]   = useState<null|'hero'|'featured'|'cta'|'footer'|'sobre'>(null);

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
    <div className="flex flex-col gap-3 max-w-2xl">
      {[1,2,3].map(i => <div key={i} className="h-24 skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-2xl pb-20">

      {/* Título */}
      <div className="mb-6">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Painel</p>
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Configurações</h1>
        <p className="text-[13px] text-[#B09C8C] mt-1">Personalize sua loja. As mudanças aparecem no site em até 10 minutos.</p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1.5 mb-8 p-1 bg-[#F0EBE1] rounded-sm">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-0.5 py-3 px-1 text-center rounded-sm transition-all ${
              tab === t.id
                ? 'bg-[#1E1208] text-[#FAF8F5] shadow-sm'
                : 'text-[#705A48] hover:bg-[#E8DFD3]'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="text-[11px] font-bold leading-tight">{t.label}</span>
            <span className={`text-[9px] leading-tight ${tab === t.id ? 'text-[#FAF8F5]/50' : 'text-[#B09C8C]'}`}>{t.sub}</span>
          </button>
        ))}
      </div>

      {/* ── MINHA LOJA ── */}
      {tab === 'loja' && (
        <div className="flex flex-col gap-5">

          <Card
            icon="✏️"
            title="Nome e slogan"
            desc="Como sua loja aparece para os clientes"
          >
            <F label="Nome da loja" hint="Ex: Mikma Lençóis"
              value={settings.storeName} onChange={v => set('storeName', v)} />
            <F label="Slogan" hint="Uma frase curta que resume o que você faz"
              value={settings.storeSlogan} onChange={v => set('storeSlogan', v)}
              placeholder="Conforto direto da fábrica" />
            <F label="CNPJ (opcional)"
              hint={!settings.storeCnpj ? 'Aparece no rodapé do site' : isValidCnpj(settings.storeCnpj) ? '✅ CNPJ válido' : '⚠️ CNPJ incompleto'}
              value={settings.storeCnpj ?? ''} onChange={v => set('storeCnpj', maskCnpj(v))}
              placeholder="00.000.000/0000-00" maxLength={18} />
          </Card>

          <Card icon="📍" title="Onde você fica" desc="Endereço físico da sua loja — usado também para gerar etiquetas de envio">
            <Row>
              <F label="Rua" value={settings.storeAddress} onChange={v => set('storeAddress', v)} placeholder="Rua das Flores" />
              <F label="Número" value={settings.storeNumber} onChange={v => set('storeNumber', v)} placeholder="123" />
            </Row>
            <F label="Complemento (opcional)" value={settings.storeComplement} onChange={v => set('storeComplement', v)} placeholder="Sala 2, fundos, etc." />
            <Row>
              <F label="Bairro" value={settings.storeNeighborhood} onChange={v => set('storeNeighborhood', v)} placeholder="Centro" />
              <F label="CEP" value={settings.storeCep} onChange={v => set('storeCep', v)} placeholder="89000-000" />
            </Row>
            <Row>
              <F label="Cidade" value={settings.storeCity} onChange={v => set('storeCity', v)} placeholder="Blumenau" />
              <F label="Estado" value={settings.storeState} onChange={v => set('storeState', v)} placeholder="SC" maxLength={2} />
            </Row>
          </Card>

          <Card icon="📞" title="Como te chamam?" desc="Formas de contato que aparecem no site" onPreview={() => setPreview('footer')}>
            <F label="WhatsApp" value={settings.storePhone} onChange={v => set('storePhone', v)}
              placeholder="(47) 99999-0000" hint="Número principal de atendimento" />
            <F label="Link do WhatsApp" value={settings.whatsappUrl ?? ''} onChange={v => set('whatsappUrl', v)}
              placeholder="https://wa.me/5547999990000"
              hint='Cole o link gerado em wa.me — é o botão "Falar no WhatsApp"' />
            <F label="E-mail" value={settings.storeEmail} onChange={v => set('storeEmail', v)} placeholder="contato@minhaloja.com.br" />
            <F label="Instagram (opcional)" value={settings.instagramUrl ?? ''} onChange={v => set('instagramUrl', v)}
              placeholder="https://instagram.com/mikmalencois" hint="Aparece no rodapé" />
          </Card>

          <Card icon="🕐" title="Horário de funcionamento" desc="Quando sua loja está aberta — aparece no site com indicador 'aberto agora'" onPreview={() => setPreview('sobre')}>
            <BusinessHoursEditor
              value={parseBusinessHours(settings.businessHours)}
              onChange={next => set('businessHours', serializeBusinessHours(next))}
            />
            <div>
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">Fuso horário</label>
              <select value={settings.businessHoursTimezone || 'America/Sao_Paulo'}
                onChange={e => set('businessHoursTimezone', e.target.value)}
                className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20"
              >
                <option value="America/Sao_Paulo">Brasília (GMT-3) — maioria do Brasil</option>
                <option value="America/Manaus">Manaus (GMT-4)</option>
                <option value="America/Rio_Branco">Acre (GMT-5)</option>
                <option value="America/Noronha">Fernando de Noronha (GMT-2)</option>
              </select>
            </div>
          </Card>

        </div>
      )}

      {/* ── VITRINE ── */}
      {tab === 'vitrine' && (
        <div className="flex flex-col gap-5">

          <Card icon="📢" title="Faixa de aviso" desc='Barra no topo do site — ótima para promoções ("Frete grátis acima de R$ 199")' onPreview={() => setPreview('hero')}>
            <F label="Texto do aviso"
              value={settings.topbarText} onChange={v => set('topbarText', v)}
              placeholder="🚚 Entrega grátis acima de R$ 199 · Blumenau em 1h"
              hint="Deixe em branco para ocultar" />
          </Card>

          <Card icon="🖼️" title="Banner principal" desc="A primeira coisa que o cliente vê — título grande e destaque da sua loja" onPreview={() => setPreview('hero')}>
            <Info>O título aparece em 3 linhas. A linha do meio fica em laranja — use para a parte mais impactante.</Info>
            <F label="Linha 1" value={settings.heroLine1 ?? ''} onChange={v => set('heroLine1', v)} placeholder="O conforto" />
            <F label="Linha 2 (laranja)" value={settings.heroLine2 ?? ''} onChange={v => set('heroLine2', v)} placeholder="que acompanha" />
            <F label="Linha 3" value={settings.heroLine3 ?? ''} onChange={v => set('heroLine3', v)} placeholder="seus sonhos." />
            <F label="Tag pequena acima do título" value={settings.heroTag} onChange={v => set('heroTag', v)}
              placeholder="Blumenau, SC — Coleção 2025" hint='Ex: "Novidades" ou "Coleção Verão 2025"' />
            <Divider label="Destaques flutuantes (opcional)" />
            <Info>Dois pequenos cards que aparecem sobre o banner com curiosidades do seu produto.</Info>
            <Row>
              <F label="Destaque 1 — nome" value={settings.heroFloatTag1Label} onChange={v => set('heroFloatTag1Label', v)} placeholder="Fios" />
              <F label="Destaque 1 — valor" value={settings.heroFloatTag1Value} onChange={v => set('heroFloatTag1Value', v)} placeholder="400 fios" />
            </Row>
            <Row>
              <F label="Destaque 2 — nome" value={settings.heroFloatTag2Label} onChange={v => set('heroFloatTag2Label', v)} placeholder="Entrega" />
              <F label="Destaque 2 — valor" value={settings.heroFloatTag2Value} onChange={v => set('heroFloatTag2Value', v)} placeholder="Em 1h" />
            </Row>
          </Card>

          <Card icon="✅" title="Selos de confiança" desc="4 frases curtas que aparecem abaixo do banner — transmite segurança ao cliente" onPreview={() => setPreview('hero')}>
            <Info>Frases objetivas que respondem: por que comprar aqui? Ex: entrega rápida, PIX, frete grátis.</Info>
            {[1,2,3,4].map(n => (
              <F key={n} label={`Selo ${n}`}
                value={(settings as unknown as Record<string,string>)[`heroTrust${n}`] ?? ''}
                onChange={v => set(`heroTrust${n}` as keyof StoreSettings, v)}
                placeholder={['Entrega em 1h em Blumenau','Frete para todo o Brasil','Pague com PIX','Qualidade direto de fábrica'][n-1]} />
            ))}
          </Card>

          <Card icon="📊" title="Números da sua loja" desc="Estatísticas que aparecem num banner escuro na página inicial — prova social" onPreview={() => setPreview('featured')}>
            <Info>Mostre resultados reais da sua loja. Isso gera confiança no cliente.</Info>
            <Row>
              <F label="Pedidos entregues" value={settings.statOrders} onChange={v => set('statOrders', v)} placeholder="1.200+" />
              <F label="Avaliação" value={settings.statRating} onChange={v => set('statRating', v)} placeholder="4.9 ⭐" />
            </Row>
            <Row>
              <F label="Tempo de entrega" value={settings.statDelivery} onChange={v => set('statDelivery', v)} placeholder="< 1h" />
              <F label="Anos no mercado" value={settings.statYears} onChange={v => set('statYears', v)} placeholder="6 anos" />
            </Row>
            <F label="Título da grade de produtos" value={settings.featuredTitle} onChange={v => set('featuredTitle', v)}
              placeholder="Escolhas da semana" hint="Aparece acima dos produtos em destaque na página inicial" />
          </Card>

          <Card icon="🔚" title="Chamada final" desc="Seção escura no final da página inicial com uma frase marcante e botões de ação" onPreview={() => setPreview('cta')}>
            <F label="Linha 1 da frase" value={settings.ctaSloganLine1 ?? ''} onChange={v => set('ctaSloganLine1', v)} placeholder="Feito em Blumenau." />
            <F label="Linha 2 (em laranja)" value={settings.ctaSloganLine2 ?? ''} onChange={v => set('ctaSloganLine2', v)} placeholder="Dorme bem." />
            <Row>
              <F label="Botão principal" value={settings.ctaBtn1 ?? ''} onChange={v => set('ctaBtn1', v)} placeholder="Comprar agora" />
              <F label="Botão secundário" value={settings.ctaBtn2 ?? ''} onChange={v => set('ctaBtn2', v)} placeholder="Nossa história" />
            </Row>
          </Card>

          <Card icon="📖" title="Página Sobre nós" desc="Conte a história da sua empresa para os clientes" onPreview={() => setPreview('sobre')}>
            <Row>
              <F label="Título (linha laranja)" value={settings.aboutHeroLine1} onChange={v => set('aboutHeroLine1', v)} placeholder={settings.storeName || 'Mikma Lençóis'} />
              <F label="Título (linha cinza)" value={settings.aboutHeroLine2} onChange={v => set('aboutHeroLine2', v)} placeholder={`em ${settings.storeCity || 'Blumenau'}, SC.`} />
            </Row>
            <TA label="Parágrafo 1 — apresentação" rows={4}
              value={settings.aboutPara1} onChange={v => set('aboutPara1', v)}
              placeholder="Conte como a loja nasceu e o que você vende..." />
            <TA label="Parágrafo 2 (opcional)" rows={3} value={settings.aboutPara2} onChange={v => set('aboutPara2', v)} />
            <TA label="Parágrafo 3 (opcional)" rows={3} value={settings.aboutPara3} onChange={v => set('aboutPara3', v)} />
            <Divider label="Cards informativos (lado direito)" />
            {([
              { lf:'aboutStat1Label', vf:'aboutStat1Value', pl:'Localização', pv:'Blumenau, SC' },
              { lf:'aboutStat2Label', vf:'aboutStat2Value', pl:'Entrega local', pv:'Até 1 hora' },
              { lf:'aboutStat3Label', vf:'aboutStat3Value', pl:'Cobertura', pv:'Todo o Brasil' },
            ] as const).map((r, i) => (
              <Row key={i}>
                <F label={`Card ${i+1} — título`} value={(settings as unknown as Record<string,string>)[r.lf]} onChange={v => set(r.lf as keyof StoreSettings, v)} placeholder={r.pl} />
                <F label={`Card ${i+1} — valor`} value={(settings as unknown as Record<string,string>)[r.vf]} onChange={v => set(r.vf as keyof StoreSettings, v)} placeholder={r.pv} />
              </Row>
            ))}
            <F label="Texto do botão WhatsApp" value={settings.aboutWhatsappLabel} onChange={v => set('aboutWhatsappLabel', v)} placeholder="Falar no WhatsApp" />
            <Divider label="Linha do tempo (história da empresa)" />
            <F label="Título da seção" value={settings.aboutTimelineTitle} onChange={v => set('aboutTimelineTitle', v)} placeholder="Nossa trajetória" />
            <TimelineEditor value={settings.aboutTimeline} onChange={v => set('aboutTimeline', v)} />
          </Card>

        </div>
      )}

      {/* ── PRODUTOS ── */}
      {tab === 'produto' && (
        <div className="flex flex-col gap-5">

          <Card icon="🛡️" title="Garantias do produto" desc="3 frases que aparecem na página de cada produto abaixo do botão de comprar — reforça confiança">
            <Info>Use frases curtas e diretas. Ex: entrega, pagamento, suporte.</Info>
            <F label="Garantia 1" value={settings.productTrust1 ?? ''} onChange={v => set('productTrust1', v)} placeholder="Entrega local em Blumenau em até 1h" />
            <F label="Garantia 2" value={settings.productTrust2 ?? ''} onChange={v => set('productTrust2', v)} placeholder="Frete para todo o Brasil com rastreio" />
            <F label="Garantia 3" value={settings.productTrust3 ?? ''} onChange={v => set('productTrust3', v)} placeholder="Pagamento PIX com confirmação imediata" />
          </Card>

          <Card icon="📏" title="Guia de medidas" desc="Tabela que abre quando o cliente clica em 'Guia de medidas' na página do produto">
            <Info>Configure as colunas (separadas por vírgula) e depois preencha as linhas. A primeira coluna é sempre o nome do tamanho.</Info>
            <F label="Colunas da tabela"
              value={(() => { try { return JSON.parse(settings.sizeGuideColumns || '[]').join(', '); } catch { return ''; } })()}
              onChange={v => set('sizeGuideColumns', JSON.stringify(v.split(',').map((s: string) => s.trim()).filter(Boolean)))}
              placeholder="Tamanho, Lençol, Fronha, Capa duvet" />
            <TableEditor
              colsJson={settings.sizeGuideColumns}
              rowsJson={settings.sizeGuideRows}
              onRowsChange={v => set('sizeGuideRows', v)}
            />
            <F label="Observação (rodapé da tabela)"
              value={settings.sizeGuideNote ?? ''} onChange={v => set('sizeGuideNote', v)}
              placeholder="Medidas podem variar ±2 cm após lavagem. Recomendamos lavar antes do primeiro uso." />
          </Card>

          <Card icon="🛏️" title="Guia de tamanhos de cama" desc="Tabela recolhível na página do produto — mostra dimensões de cada tamanho de cama">
            <Info>Ajuda o cliente a saber qual tamanho pedir conforme o tamanho da cama dele.</Info>
            <F label="Colunas da tabela"
              value={(() => { try { return JSON.parse(settings.bedSizeColumns || '[]').join(', '); } catch { return ''; } })()}
              onChange={v => set('bedSizeColumns', JSON.stringify(v.split(',').map((s: string) => s.trim()).filter(Boolean)))}
              placeholder="Tamanho, Cama, Comprimento, Largura" />
            <TableEditor
              colsJson={settings.bedSizeColumns}
              rowsJson={settings.bedSizeRows}
              onRowsChange={v => set('bedSizeRows', v)}
            />
          </Card>

        </div>
      )}

      {/* ── ENTREGA ── */}
      {tab === 'entrega' && (
        <div className="flex flex-col gap-5">

          <Card icon="📦" title="De onde você envia?" desc="Endereço de onde seus produtos saem — usado para calcular o frete automaticamente">
            <F label="CEP de envio" value={settings.originCep} onChange={v => set('originCep', v)}
              placeholder="89000-000" hint="CEP do seu estoque ou loja física" />
            <Num label="Raio de entrega rápida (km)"
              value={settings.localDeliveryRadiusKm} onChange={v => set('localDeliveryRadiusKm', v)}
              hint={`Pedidos dentro de ${settings.localDeliveryRadiusKm} km recebem opção de entrega em 1h`}
              min={1} max={100} />
            <details className="border border-[#E6DFD5]">
              <summary className="px-3 py-2.5 text-[12px] text-[#B09C8C] cursor-pointer select-none">
                ⚙️ Coordenadas GPS (avançado — só mexa se souber)
              </summary>
              <div className="px-3 pb-3 pt-2 flex flex-col gap-3">
                <Row>
                  <Num label="Latitude" value={settings.originLat} onChange={v => set('originLat', v)} step={0.0001} />
                  <Num label="Longitude" value={settings.originLng} onChange={v => set('originLng', v)} step={0.0001} />
                </Row>
              </div>
            </details>
          </Card>

          <Card icon="🎁" title="Frete grátis" desc="A partir de qual valor o frete passa a ser gratuito">
            <Num label="Valor mínimo para frete grátis (R$)"
              value={settings.freeShippingThresholdCents / 100}
              onChange={v => set('freeShippingThresholdCents', Math.round(v * 100))}
              hint={settings.freeShippingThresholdCents === 0
                ? 'Digite 0 para manter desativado'
                : `✅ Frete grátis em pedidos acima de R$ ${(settings.freeShippingThresholdCents/100).toFixed(2)}`}
              min={0} />
          </Card>

          <Card icon="⏰" title="Quando você envia?" desc="Horário limite para o pedido sair hoje — depois desse horário vai no próximo dia útil">
            <F label="Horário de corte" value={settings.dispatchCutoffTime}
              onChange={v => set('dispatchCutoffTime', v)} type="time"
              hint={`Pedidos feitos após ${settings.dispatchCutoffTime} são enviados no próximo dia útil`} />
            <Num label="Peso médio de cada produto embalado (kg)"
              value={settings.defaultItemWeightKg} onChange={v => set('defaultItemWeightKg', v)}
              step={0.1} hint="Usado para calcular o frete — peso do lençol já dentro da embalagem" />
          </Card>

          <Card icon="🔔" title="Alerta de estoque baixo" desc="Quando o sistema avisa que um produto está quase acabando">
            <Num label="Avisar quando restar quantas unidades?"
              value={settings.lowStockThreshold} onChange={v => set('lowStockThreshold', v)}
              min={0}
              hint={`O produto aparecerá como "Últimas unidades" quando restar ${settings.lowStockThreshold} ou menos`} />
          </Card>

          <Card icon="💳" title="Pagamento por cartão" desc="Habilite cartão de crédito a partir de um valor mínimo — 0 desativa">
            <Num label="Valor mínimo para cartão (R$)"
              value={settings.creditMinOrderCents / 100}
              onChange={v => set('creditMinOrderCents', Math.round(v * 100))}
              min={0}
              hint={settings.creditMinOrderCents === 0
                ? '❌ Cartão desativado — apenas PIX disponível'
                : `✅ Cartão habilitado para pedidos acima de R$ ${(settings.creditMinOrderCents/100).toFixed(2)}`} />
          </Card>

        </div>
      )}

      {/* Botão salvar fixo */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:relative md:bottom-auto md:mt-8">
        <div className="bg-[#FAF8F5] border-t border-[#E6DFD5] md:border-0 px-4 py-3 md:px-0 md:py-0">
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-[#1E1208] text-[#FAF8F5] text-sm font-semibold py-4 disabled:opacity-50 hover:bg-[#2E2010] transition-colors flex items-center justify-center gap-2"
          >
            {saving
              ? <><span className="spinner" />Salvando…</>
              : saved
              ? '✅ Salvo com sucesso!'
              : 'Salvar alterações'}
          </button>
          {saved && <p className="text-center text-[11px] text-[#B09C8C] mt-2">Mudanças podem levar até 10 min para aparecer no site.</p>}
        </div>
      </div>

      {/* Previews */}
      <PreviewModal open={preview==='hero'}     onClose={() => setPreview(null)} title="Banner principal"      routeLabel="/"><HeroPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='featured'} onClose={() => setPreview(null)} title="Destaques"             routeLabel="/"><FeaturedPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='cta'}      onClose={() => setPreview(null)} title="Chamada final"         routeLabel="/"><CtaPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='footer'}   onClose={() => setPreview(null)} title="Rodapé"                routeLabel="/"><FooterPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='sobre'}    onClose={() => setPreview(null)} title="Sobre nós"             routeLabel="/sobre"><SobrePreview s={settings}/></PreviewModal>
    </div>
  );
}

/* ── Card container ────────────────────────────────────────────────────── */
function Card({ icon, title, desc, children, onPreview }: {
  icon: string; title: string; desc: string;
  children: React.ReactNode; onPreview?: () => void;
}) {
  return (
    <div className="border border-[#E6DFD5] bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 bg-[#FAF8F5] border-b border-[#E6DFD5]">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5 shrink-0">{icon}</span>
          <div>
            <p className="text-[13px] font-bold text-[#1E1208]">{title}</p>
            <p className="text-[11px] text-[#B09C8C] mt-0.5 leading-relaxed">{desc}</p>
          </div>
        </div>
        {onPreview && <div className="shrink-0 pt-0.5"><PreviewButton onClick={onPreview} /></div>}
      </div>
      <div className="px-5 py-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

/* ── Campos ────────────────────────────────────────────────────────────── */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 -mx-5 px-5 pt-2 pb-1 border-t border-[#F0EBE1]">
      <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#B09C8C] whitespace-nowrap">{label}</span>
    </div>
  );
}
function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-100 px-3 py-2.5 rounded-sm -mt-1">
      <span className="text-blue-400 text-xs mt-0.5 shrink-0">ℹ️</span>
      <p className="text-[11px] text-blue-700 leading-relaxed">{children}</p>
    </div>
  );
}
function F({ label, value, onChange, hint, placeholder, maxLength, type='text' }: {
  label:string; value:string; onChange:(v:string)=>void;
  hint?:string; placeholder?:string; maxLength?:number; type?:string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 placeholder:text-[#C8BAB0]" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C] leading-relaxed">{hint}</p>}
    </div>
  );
}
function TA({ label, value, onChange, rows=3, placeholder, hint }: {
  label:string; value:string; onChange:(v:string)=>void; rows?:number; placeholder?:string; hint?:string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">{label}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 resize-y placeholder:text-[#C8BAB0]" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C]">{hint}</p>}
    </div>
  );
}
function Num({ label, value, onChange, hint, min, max, step=1 }: {
  label:string; value:number; onChange:(v:number)=>void;
  hint?:string; min?:number; max?:number; step?:number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">{label}</label>
      <input type="number" value={value} onChange={e=>onChange(parseFloat(e.target.value)||0)}
        min={min} max={max} step={step} inputMode="decimal"
        className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60" />
      {hint && <p className="mt-1.5 text-[11px] text-[#B09C8C] leading-relaxed">{hint}</p>}
    </div>
  );
}

/* ── Table editor (reusável para guias) ────────────────────────────────── */
function TableEditor({ colsJson, rowsJson, onRowsChange }: {
  colsJson: string; rowsJson: string; onRowsChange: (v: string) => void;
}) {
  let cols: string[] = []; let rows: Record<string,string>[] = [];
  try { cols = JSON.parse(colsJson || '[]'); } catch {}
  try { rows = JSON.parse(rowsJson || '[]'); } catch {}

  if (!cols.length) return <p className="text-[12px] text-[#B09C8C]">Defina as colunas acima primeiro.</p>;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="grid gap-2 pr-8" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {cols.map(c => (
          <p key={c} className="text-[9px] font-bold tracking-[0.14em] uppercase text-[#B09C8C]">{c}</p>
        ))}
      </div>
      {/* Rows */}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <div className="grid gap-2 flex-1" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
            {cols.map(col => (
              <input key={col} type="text" value={row[col]??''} placeholder={col}
                onChange={e => {
                  const next = [...rows]; next[i]={...next[i],[col]:e.target.value};
                  onRowsChange(JSON.stringify(next));
                }}
                className="w-full border border-[#E6DFD5] bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C4714A]/30" />
            ))}
          </div>
          <button onClick={() => onRowsChange(JSON.stringify(rows.filter((_,idx)=>idx!==i)))}
            className="w-7 h-7 flex items-center justify-center text-[#C8BAB0] hover:text-red-400 transition-colors shrink-0 text-sm">
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => onRowsChange(JSON.stringify([...rows, Object.fromEntries(cols.map(c=>[c,'']))]))}
        className="mt-1 border-2 border-dashed border-[#C4714A]/25 text-[#C4714A] text-[12px] font-semibold py-2.5 hover:bg-[#C4714A]/5 hover:border-[#C4714A]/50 transition-all">
        + Adicionar linha
      </button>
    </div>
  );
}

/* ── Timeline ──────────────────────────────────────────────────────────── */
type TLItem = { year:string; label:string; desc:string };
function TimelineEditor({ value, onChange }: { value:string; onChange:(v:string)=>void }) {
  let items: TLItem[] = [];
  try { items = JSON.parse(value)||[]; } catch {}
  const upd = (next: TLItem[]) => onChange(JSON.stringify(next));

  return (
    <div className="flex flex-col gap-3">
      {items.length===0 && (
        <p className="text-[12px] text-[#B09C8C] text-center py-4 border border-dashed border-[#E6DFD5]">
          Nenhum marco ainda — clique abaixo para adicionar
        </p>
      )}
      {items.map((item,i) => (
        <div key={i} className="border border-[#E6DFD5] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-[#1E1208]">Marco {i+1}</p>
            <button onClick={()=>upd(items.filter((_,idx)=>idx!==i))}
              className="text-[11px] text-[#B09C8C] hover:text-red-500 transition-colors">Remover</button>
          </div>
          <Row>
            <F label="Ano" value={item.year} onChange={v=>upd(items.map((it,idx)=>idx===i?{...it,year:v}:it))} placeholder="2018" />
            <F label="Nome do marco" value={item.label} onChange={v=>upd(items.map((it,idx)=>idx===i?{...it,label:v}:it))} placeholder="Fundação" />
          </Row>
          <TA label="O que aconteceu?" rows={2} value={item.desc}
            onChange={v=>upd(items.map((it,idx)=>idx===i?{...it,desc:v}:it))}
            placeholder="Descreva esse momento da história da empresa..." />
        </div>
      ))}
      <button onClick={()=>upd([...items,{year:'',label:'',desc:''}])}
        className="border-2 border-dashed border-[#C4714A]/30 text-[#C4714A] text-[13px] font-semibold py-3 hover:bg-[#C4714A]/5 transition-all">
        + Adicionar marco
      </button>
    </div>
  );
}
