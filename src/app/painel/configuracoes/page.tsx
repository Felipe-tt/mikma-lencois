'use client';
import { formatMeasure, parseMeasure } from '@/lib/measures';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import React from 'react';
import {
  IconStore, IconImage, IconBox, IconTruck, IconEdit, IconPin, IconPhone,
  IconClock, IconAlert, IconCheck, IconTrend, IconBolt, IconShield,
  IconRuler, IconGift, IconBell, IconCard, IconReceipt, IconSettings,
  IconInfo, IconX, IconInventory, IconMail,
} from '@/components/ui/Icon';

import { useEffect, useId, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';
import { PreviewModal, PreviewButton } from '@/components/painel/PreviewModal';
import { Select } from '@/components/ui/Select';
import { HeroPreview, FeaturedPreview, CtaPreview } from '@/components/painel/preview/HomePreview';
import { FooterPreview } from '@/components/painel/preview/FooterPreview';
import { SobrePreview } from '@/components/painel/preview/SobrePreview';
import { ProductTrustPreview, SizeGuidePreview, BedSizeGuidePreview } from '@/components/painel/preview/ProductPreview';
import { BusinessHoursEditor } from '@/components/painel/BusinessHoursEditor';
import { parseBusinessHours, serializeBusinessHours } from '@/lib/business-hours';
import { maskCnpj, isValidCnpj, maskPhone, isValidPhone, maskCep, isValidCep } from '@/lib/masks';
import { useAuth } from '@/lib/auth/AuthContext';

type Tab = 'loja' | 'vitrine' | 'produto' | 'entrega' | 'equipe';

const TABS: { id: Tab; icon: string; label: string; sub: string }[] = [
  { id: 'loja',    icon: 'loja',    label: 'Minha loja',   sub: 'Nome, endereço, contato' },
  { id: 'vitrine', icon: 'vitrine', label: 'Vitrine',       sub: 'Como o site aparece' },
  { id: 'produto', icon: 'produto', label: 'Produtos',      sub: 'Guias e informações' },
  { id: 'entrega', icon: 'entrega', label: 'Entrega',       sub: 'Frete e pagamento' },
];

// Só admin vê essa aba, sellers não gerenciam quem tem acesso ao painel.
const EQUIPE_TAB: { id: Tab; icon: string; label: string; sub: string } =
  { id: 'equipe', icon: 'shield', label: 'Equipe', sub: 'Quem acessa o painel' };

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleTabs = isAdmin ? [...TABS, EQUIPE_TAB] : TABS;
  const [settings, setSettings] = useState<StoreSettings>(STORE_DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [tab, setTab]           = useState<Tab>('loja');
  const [preview, setPreview]   = useState<null|'hero'|'featured'|'cta'|'footer'|'sobre'|'trust'|'sizeguide'|'bedguide'>(null);
  const [shippingLedger, setShippingLedger] = useState<{ collectedCents: number; spentCents: number; balanceCents: number } | null>(null);

  // Último estado salvo: o salvamento grava só o que mudou. Mandar o
  // formulário inteiro incluía valores padrão de campos que nunca foram
  // gravados (ex.: desconto PIX), e as regras recusavam o vendedor.
  const savedRef = useRef<StoreSettings>(STORE_DEFAULTS);
  // Cópia em estado do último salvo, pra saber na tela se há mudança pendente.
  const [savedSnapshot, setSavedSnapshot] = useState<StoreSettings>(STORE_DEFAULTS);
  const [loadError, setLoadError] = useState(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSnapshot);

  // Avisa antes de sair com mudanças não salvas: fechar a aba e também
  // navegar pela barra de baixo ou pelo menu (só beforeunload não pegava).
  useUnsavedGuard(dirty && !saving);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then(snap => {
      const merged = snap.exists() ? { ...STORE_DEFAULTS, ...snap.data() } as StoreSettings : STORE_DEFAULTS;
      savedRef.current = merged;
      setSavedSnapshot(merged);
      setSettings(merged);
    }).catch(err => {
      console.error('[configuracoes] falha ao carregar', err);
      setLoadError(true);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then(token =>
      fetch('/api/painel/shipping-ledger', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null)
        .then(data => data && setShippingLedger(data))
        .catch(() => {})
    );
  }, [user]);

  const set = (field: keyof StoreSettings, value: string | number | boolean) =>
    setSettings(s => ({ ...s, [field]: value }));

  const handleSave = async () => {
    // CEP da loja alimenta a cotação de frete (origem do envio) -
    // um CEP incompleto aqui só quebra na hora de despachar um pedido,
    // bem mais tarde e mais difícil de diagnosticar. Bloqueia antes.
    if (settings.storeCep && !isValidCep(settings.storeCep)) {
      setSaveError('CEP da loja incompleto, confira antes de salvar.');
      return;
    }
    if (settings.storePhone && !isValidPhone(settings.storePhone)) {
      setSaveError('Telefone/WhatsApp incompleto, confira antes de salvar.');
      return;
    }
    if (settings.storeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.storeEmail)) {
      setSaveError('E-mail da loja inválido, confira antes de salvar.');
      return;
    }
    if (settings.storeCnpj && !isValidCnpj(settings.storeCnpj)) {
      setSaveError('CNPJ incompleto, confira antes de salvar.');
      return;
    }
    setSaveError('');
    const changed = Object.fromEntries(
      Object.entries(settings).filter(([k, v]) =>
        JSON.stringify(v) !== JSON.stringify(savedRef.current[k as keyof StoreSettings]))
    );
    if (Object.keys(changed).length === 0) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'store'), changed, { merge: true });
      savedRef.current = settings;
      setSavedSnapshot(settings);
    } catch (err) {
      console.error('[configuracoes] falha ao salvar', err);
      setSaving(false);
      const denied = (err as { code?: string })?.code === 'permission-denied';
      setSaveError(denied
        ? 'Só o administrador pode mudar desconto PIX, frete grátis, valores mínimos e modos de teste. Desfaça essas mudanças ou peça a um admin.'
        : 'Não foi possível salvar. Verifique sua conexão e tente de novo.');
      return;
    }
    // Best-effort: revalida as páginas públicas da loja (ISR) pra mudança
    // aparecer na hora, sem depender do intervalo de revalidate de cada
    // página (até 24h em /sobre, /termos, /privacidade). Falha aqui nunca
    // deve impedir o salvamento, a config já está no Firestore de
    // qualquer jeito, só o cache demoraria mais pra atualizar sozinho.
    try {
      const token = await user?.getIdToken();
      if (token) {
        await fetch('/api/painel/revalidate-store', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      /* ignora, cache expira sozinho de qualquer forma */
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loadError) return (
    <div className="max-w-5xl mx-auto">
      <PanelErrorState onRetry={() => window.location.reload()} />
    </div>
  );

  if (loading) return (
    <div className="flex flex-col gap-3 max-w-5xl mx-auto">
      {[1,2,3].map(i => <div key={i} className="h-24 skeleton border border-mist rounded-xl" />)}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-20">

      {/* Título */}
      <div className="mb-6">
        <h1 className="sr-only lg:not-sr-only font-display font-normal text-ink text-2xl">Configurações</h1>
        <p className="text-[13px] text-faint mt-1">Personalize sua loja. As mudanças aparecem no site logo depois de salvar.</p>
      </div>

      {/* Tabs */}
      {/* No celular vira uma fila de chips que rola; no desktop, grade. */}
      <div className="flex sm:grid gap-1.5 mb-8 p-1 bg-warm rounded-2xl overflow-x-auto scrollbar-none sm:[grid-template-columns:var(--tab-cols)]"
        style={{ '--tab-cols': `repeat(${visibleTabs.length}, minmax(0, 1fr))` } as React.CSSProperties}>
        {visibleTabs.map(t => {
          const TabIcon = CARD_ICON_MAP[t.icon];
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 flex sm:flex-col items-center gap-2 sm:gap-1 py-2.5 sm:py-3 px-4 sm:px-1 text-center rounded-xl transition-colors ${
                tab === t.id
                  ? 'bg-ink text-paper shadow-sm'
                  : 'text-mid hover:bg-mist'
              }`}
            >
              {TabIcon && (
                <TabIcon size={18} className={tab === t.id ? 'text-paper' : 'text-faint'} />
              )}
              <span className="text-[12px] font-bold leading-tight">{t.label}</span>
              <span className={`hidden sm:block text-[10px] leading-tight ${tab === t.id ? 'text-paper/50' : 'text-faint'}`}>{t.sub}</span>
            </button>
          );
        })}
      </div>

      {/* ── MINHA LOJA ── */}
      {tab === 'loja' && (
        <div className="flex flex-col gap-5">

          <Card
            icon="edit"
            title="Nome e slogan"
            desc="Como sua loja aparece para os clientes"
            onPreview={() => setPreview('footer')}
          >
            <F label="Nome da loja" placeholder="Mikma Lençóis"
              value={settings.storeName} onChange={v => set('storeName', v)} />
            <F label="Slogan" hint="Uma frase curta que resume o que você faz"
              value={settings.storeSlogan} onChange={v => set('storeSlogan', v)}
              placeholder="Conforto direto da fábrica" />
            <F label="CNPJ (opcional)"
              hint={!settings.storeCnpj ? 'Aparece no rodapé do site' : isValidCnpj(settings.storeCnpj) ? 'CNPJ válido' : 'CNPJ incompleto'}
              value={settings.storeCnpj ?? ''} onChange={v => set('storeCnpj', maskCnpj(v))}
              placeholder="00.000.000/0000-00" maxLength={18} />
          </Card>

          <Card icon="pin" title="Onde você fica" desc="Endereço físico da sua loja, usado também para gerar etiquetas de envio" onPreview={() => setPreview('sobre')}>
            <Row>
              <F label="Rua" value={settings.storeAddress} onChange={v => set('storeAddress', v)} placeholder="Rua das Flores" />
              <F label="Número" inputMode="numeric" value={settings.storeNumber} onChange={v => set('storeNumber', v)} placeholder="123" />
            </Row>
            <F label="Complemento (opcional)" value={settings.storeComplement} onChange={v => set('storeComplement', v)} placeholder="Sala 2, fundos, etc." />
            <Row>
              <F label="Bairro" value={settings.storeNeighborhood} onChange={v => set('storeNeighborhood', v)} placeholder="Centro" />
              <F label="CEP" inputMode="numeric" value={settings.storeCep} onChange={v => set('storeCep', maskCep(v))}
                placeholder="89000-000" maxLength={9}
                hint={!settings.storeCep ? undefined : isValidCep(settings.storeCep) ? 'CEP válido' : 'CEP incompleto'} />
            </Row>
            <Row>
              <F label="Cidade" value={settings.storeCity} onChange={v => set('storeCity', v)} placeholder="Blumenau" />
              <F label="Estado" value={settings.storeState} onChange={v => set('storeState', v.toUpperCase().slice(0, 2))} placeholder="SC" maxLength={2} />
            </Row>
          </Card>

          <Card icon="phone" title="Como te chamam?" desc="Formas de contato que aparecem no site" onPreview={() => setPreview('footer')}>
            <F label="WhatsApp" type="tel" value={settings.storePhone} onChange={v => set('storePhone', maskPhone(v))}
              placeholder="(47) 99999-0000" maxLength={15}
              hint={!settings.storePhone ? 'Número principal de atendimento' : isValidPhone(settings.storePhone) ? 'Número principal de atendimento' : 'Telefone incompleto'} />
            <F label="Link do WhatsApp" type="url" value={settings.whatsappUrl ?? ''} onChange={v => set('whatsappUrl', v)}
              placeholder="https://wa.me/5547999990000"
              hint='Cole o link gerado em wa.me, é o botão "Falar no WhatsApp"' />
            <F label="E-mail" type="email" value={settings.storeEmail} onChange={v => set('storeEmail', v)} placeholder="contato@minhaloja.com.br"
              hint={!settings.storeEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.storeEmail) ? undefined : 'E-mail incompleto'} />
            <F label="Instagram (opcional)" type="url" value={settings.instagramUrl ?? ''} onChange={v => set('instagramUrl', v)}
              placeholder="https://instagram.com/mikmalencois" hint="Aparece no rodapé" />
          </Card>

          <Card icon="clock" title="Horário de funcionamento" desc="Quando sua loja está aberta, aparece no site com indicador 'aberto agora'" onPreview={() => setPreview('sobre')}>
            <BusinessHoursEditor
              value={parseBusinessHours(settings.businessHours)}
              onChange={next => set('businessHours', serializeBusinessHours(next))}
            />
            <div>
              <label htmlFor="config-fuso" className="block text-[13px] font-semibold text-mid mb-1.5">Fuso horário</label>
              <Select
                value={settings.businessHoursTimezone || 'America/Sao_Paulo'}
                onChange={v => set('businessHoursTimezone', v)}
                triggerId="config-fuso"
                options={[
                  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3), maioria do Brasil' },
                  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
                  { value: 'America/Rio_Branco', label: 'Acre (GMT-5)' },
                  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
                ]}
                triggerClassName="w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 rounded-xl flex items-center justify-between gap-2 cursor-pointer hover:border-ink/20 transition-all"
              />
            </div>
          </Card>

        </div>
      )}

      {/* ── VITRINE ── */}
      {tab === 'vitrine' && (
        <div className="flex flex-col gap-5">

          <Card icon="megaphone" title="Faixa de aviso" desc='Barra no topo do site, ótima para promoções ("Frete grátis acima de R$ 199")' onPreview={() => setPreview('hero')}>
            <F label="Texto do aviso"
              value={settings.topbarText} onChange={v => set('topbarText', v)}
              placeholder="Entrega grátis acima de R$ 199 · Blumenau em 1h"
              hint="Deixe em branco para ocultar" />
          </Card>

          <Card icon="frame" title="Banner principal" desc="A primeira coisa que o cliente vê, título grande e destaque da sua loja" onPreview={() => setPreview('hero')}>
            <Info>O título aparece em 3 linhas. A linha do meio fica em laranja, use para a parte mais impactante.</Info>
            <F label="Linha 1" value={settings.heroLine1 ?? ''} onChange={v => set('heroLine1', v)} placeholder="O conforto" />
            <F label="Linha 2 (laranja)" value={settings.heroLine2 ?? ''} onChange={v => set('heroLine2', v)} placeholder="que acompanha" />
            <F label="Linha 3" value={settings.heroLine3 ?? ''} onChange={v => set('heroLine3', v)} placeholder="seus sonhos." />
          </Card>

          <Card icon="check" title="Selos de confiança" desc="4 frases curtas que aparecem abaixo do banner, transmite segurança ao cliente" onPreview={() => setPreview('hero')}>
            <Info>Frases objetivas que respondem: por que comprar aqui? Ex: entrega rápida, PIX, frete grátis.</Info>
            {[1,2,3,4].map(n => (
              <F key={n} label={`Selo ${n}`}
                value={(settings as unknown as Record<string,string>)[`heroTrust${n}`] ?? ''}
                onChange={v => set(`heroTrust${n}` as keyof StoreSettings, v)}
                placeholder={['Entrega em 1h em Blumenau','Frete para todo o Brasil','Pague com PIX','Qualidade direto de fábrica'][n-1]} />
            ))}
          </Card>

          <Card icon="trend" title="Grade de produtos" desc="Título da seção de produtos em destaque na página inicial" onPreview={() => setPreview('featured')}>
            <F label="Título da seção" value={settings.featuredTitle} onChange={v => set('featuredTitle', v)}
              placeholder="Escolhas da semana" hint="Aparece acima dos produtos em destaque na página inicial. Em branco usa 'Destaques'." />
          </Card>

          <Card icon="bolt" title="Chamada final" desc="Seção escura no final da página inicial com uma frase marcante e botões de ação" onPreview={() => setPreview('cta')}>
            <F label="Linha 1 da frase" value={settings.ctaSloganLine1 ?? ''} onChange={v => set('ctaSloganLine1', v)} placeholder="Feito em Blumenau." />
            <F label="Linha 2 (em laranja)" value={settings.ctaSloganLine2 ?? ''} onChange={v => set('ctaSloganLine2', v)} placeholder="Dorme bem." />
            <Row>
              <F label="Botão principal" value={settings.ctaBtn1 ?? ''} onChange={v => set('ctaBtn1', v)} placeholder="Comprar agora" />
              <F label="Botão secundário" value={settings.ctaBtn2 ?? ''} onChange={v => set('ctaBtn2', v)} placeholder="Nossa história" />
            </Row>
          </Card>

          <Card icon="book" title="Página Sobre nós" desc="Conte a história da sua empresa para os clientes" onPreview={() => setPreview('sobre')}>
            <Row>
              <F label="Título (linha laranja)" value={settings.aboutHeroLine1} onChange={v => set('aboutHeroLine1', v)} placeholder={settings.storeName || 'Mikma Lençóis'} />
              <F label="Título (linha cinza)" value={settings.aboutHeroLine2} onChange={v => set('aboutHeroLine2', v)} placeholder={`em ${settings.storeCity || 'Blumenau'}, SC.`} />
            </Row>
            <TA label="Parágrafo 1, apresentação" rows={4}
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
                <F label={`Card ${i+1}, título`} value={(settings as unknown as Record<string,string>)[r.lf]} onChange={v => set(r.lf as keyof StoreSettings, v)} placeholder={r.pl} />
                <F label={`Card ${i+1}, valor`} value={(settings as unknown as Record<string,string>)[r.vf]} onChange={v => set(r.vf as keyof StoreSettings, v)} placeholder={r.pv} />
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

          <Card icon="shield" title="Garantias do produto" desc="3 frases que aparecem na página de cada produto abaixo do botão de comprar, reforça confiança" onPreview={() => setPreview('trust')}>
            <Info>Use frases curtas e diretas. Ex: entrega, pagamento, suporte.</Info>
            <F label="Garantia 1" value={settings.productTrust1 ?? ''} onChange={v => set('productTrust1', v)} placeholder="Entrega local em Blumenau em até 1h" />
            <F label="Garantia 2" value={settings.productTrust2 ?? ''} onChange={v => set('productTrust2', v)} placeholder="Frete para todo o Brasil com rastreio" />
            <F label="Garantia 3" value={settings.productTrust3 ?? ''} onChange={v => set('productTrust3', v)} placeholder="Pagamento PIX com confirmação imediata" />
          </Card>

          <Card icon="ruler" title="Guia de medidas" desc="Tabela que abre quando o cliente clica em 'Guia de medidas' na página do produto, dimensões por PEÇA (lençol, fronha, capa de duvet...)" onPreview={() => setPreview('sizeguide')}>
            <Info>
              Diferente da tabela &quot;Guia de tamanhos de cama&quot; logo abaixo: esta aqui é por tipo de peça (uma
              coluna pra Lençol, outra pra Fronha, outra pra Capa duvet...). Configure as colunas (separadas por
              vírgula) e depois preencha as linhas. A primeira coluna é sempre o nome do tamanho; nas outras,
              preencha largura, comprimento e altura em centímetros.
            </Info>
            <F label="Colunas da tabela"
              value={(() => { try { return JSON.parse(settings.sizeGuideColumns || '[]').join(', '); } catch { return ''; } })()}
              onChange={v => set('sizeGuideColumns', JSON.stringify(v.split(',').map((s: string) => s.trim()).filter(Boolean)))}
              placeholder="Tamanho, Lençol, Fronha, Capa duvet" />
            <TableEditor
              measures
              colsJson={settings.sizeGuideColumns}
              rowsJson={settings.sizeGuideRows}
              onRowsChange={v => set('sizeGuideRows', v)}
            />
            <p className="text-[11px] text-faint -mt-1">Medidas em centímetros: largura × comprimento × altura. A altura é opcional (fronha não tem).</p>
            <F label="Observação (rodapé da tabela)"
              value={settings.sizeGuideNote ?? ''} onChange={v => set('sizeGuideNote', v)}
              placeholder="Medidas podem variar ±2 cm após lavagem. Recomendamos lavar antes do primeiro uso." />
          </Card>

          <Card icon="ruler" title="Guia de tamanhos de cama" desc="Tabela na página do produto + fonte da largura usada na calculadora do /guia-de-tamanhos" onPreview={() => setPreview('bedguide')}>
            <Info>
              Uma tabela, dois usos: <strong>1)</strong> aparece na página do produto pra mostrar o tamanho do
              lençol acabado (ele é maior que o colchão de propósito, pra sobrar pano e prender o elástico -
              por isso &quot;Comprimento&quot;/&quot;Largura&quot; aqui são maiores que a medida real do colchão). <strong>2)</strong> a
              coluna <strong>&quot;Cama&quot;</strong> é lida pela calculadora do{' '}
              <code className="text-[11px] bg-warm px-1 rounded">/guia-de-tamanhos</code> pra descobrir o tamanho a
              partir da largura que o cliente mede em casa, não existe uma tabela separada pra isso, é sempre
              este mesmo valor. Se editar a coluna &quot;Cama&quot;, os dois lugares atualizam juntos.
            </Info>
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

          <Card icon="produto" title="De onde você envia?" desc="Endereço de onde seus produtos saem, usado para calcular o frete automaticamente">
            <F label="CEP de envio" inputMode="numeric" value={settings.originCep} onChange={v => set('originCep', v)}
              placeholder="89000-000" hint="CEP do seu estoque ou loja física" />
            <Num label="Raio de entrega rápida (km)"
              value={settings.localDeliveryRadiusKm} onChange={v => set('localDeliveryRadiusKm', v)}
              hint={`Pedidos dentro de ${settings.localDeliveryRadiusKm} km recebem opção de entrega em 1h`}
              min={1} max={100} />
            <details className="border border-mist rounded-xl">
              <summary className="px-3 py-2.5 text-[12px] text-faint cursor-pointer select-none">
                Coordenadas GPS (avançado, só mexa se souber)
              </summary>
              <div className="px-3 pb-3 pt-2 flex flex-col gap-3">
                <Row>
                  <Num label="Latitude" value={settings.originLat} onChange={v => set('originLat', v)} step={0.0001} />
                  <Num label="Longitude" value={settings.originLng} onChange={v => set('originLng', v)} step={0.0001} />
                </Row>
              </div>
            </details>
          </Card>

          <Card icon="produto" title="Uber Direct, ambiente" desc="Alterna instantaneamente entre teste e produção, sem precisar de novo deploy">
            <Toggle
              label="Usar ambiente de teste (sandbox)"
              checked={!!settings.uberDirectSandboxMode}
              onChange={v => set('uberDirectSandboxMode', v)}
              hint="Ligado: usa as credenciais de teste do Uber Direct, cotações funcionam normalmente, mas nenhuma entrega real é criada nem cobrada. Desligado: usa as credenciais de produção (entregas reais, motoboy de verdade)."
              warn="TESTE ATIVO: nenhuma entrega será despachada de verdade (o cliente não vê aviso de teste). Desligue antes de vender de verdade."
            />
          </Card>

          <Card icon="produto" title="AbacatePay, ambiente" desc="Alterna entre a chave de Dev Mode e a de produção da AbacatePay, sem novo deploy">
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-2.5">
              O secret ABACATEPAY_SANDBOX_API_KEY ainda não foi configurado no Secret Manager do Firebase (só existe como secret do GitHub Actions, que não é lido em produção). Ligar este toggle agora vai gerar erro &ldquo;provedor de pagamento não configurado&rdquo; no checkout.
            </p>
            <Toggle
              label="Usar ambiente de teste (Dev Mode)"
              checked={!!settings.abacatePaySandboxMode}
              onChange={v => set('abacatePaySandboxMode', v)}
              hint="Ligado: usa a chave de Dev Mode da AbacatePay, o PIX/cartão gerado é de teste, nenhum valor real é cobrado. No pedido, aparece um botão para simular o pagamento (aprova na hora, sem PIX de verdade). Desligado: usa a chave de produção, pagamentos reais."
              warn="TESTE ATIVO, os PIX/checkouts gerados são de Dev Mode e não cobram nada de verdade. Desligue antes de vender de verdade."
            />
          </Card>

          <Card icon="shield" title="Margem de erro, Uber Direct" desc="O preço da Uber é recotado no momento do despacho, se a diferença passar dessa margem, o despacho é bloqueado até você confirmar">
            <Row>
              <Num label="Margem fixa (R$)"
                value={settings.uberOverspendMarginCents / 100}
                onChange={v => set('uberOverspendMarginCents', Math.round(v * 100))}
                hint="Diferença em reais tolerada sem confirmação"
                min={0} step={0.5} />
              <Num label="Margem percentual (%)"
                value={settings.uberOverspendMarginPct}
                onChange={v => set('uberOverspendMarginPct', v)}
                hint="Diferença em % do frete cobrado, tolerada sem confirmação"
                min={0} max={100} step={1} />
            </Row>
            <p className="text-[11px] text-faint mt-2">
              Usa-se o que for MAIOR entre os dois. Ex: frete cobrado R$13, margem fixa R$5 e margem 20% (R$2,60) → tolera até R$18 sem pedir confirmação, porque R$5 é maior que R$2,60.
            </p>
          </Card>

          <Card icon="gift" title="Frete grátis" desc="A partir de qual valor o frete passa a ser gratuito">
            <Num label="Valor mínimo para frete grátis (R$)"
              value={settings.freeShippingThresholdCents / 100}
              onChange={v => set('freeShippingThresholdCents', Math.round(v * 100))}
              hint={settings.freeShippingThresholdCents === 0
                ? 'Digite 0 para manter desativado'
                : `Frete grátis em pedidos acima de R$ ${(settings.freeShippingThresholdCents/100).toFixed(2)}`}
              min={0} />
          </Card>

          <Card icon="shield" title="Blindagem do frete grátis" desc="Trava automática pra o frete grátis nunca sangrar a sua margem">
            <Num label="Prejuízo máximo tolerado (R$)"
              value={settings.freeShippingMaxLossCents / 100}
              onChange={v => set('freeShippingMaxLossCents', Math.round(v * 100))}
              hint={settings.freeShippingMaxLossCents === 0
                ? 'Digite 0 pra desativar o teto (frete grátis sempre vale, sem limite)'
                : `Se o "caixa de frete" acumular mais de R$ ${(settings.freeShippingMaxLossCents/100).toFixed(2)} de prejuízo, o frete grátis é desligado sozinho até o saldo se recuperar, o cliente nunca vê isso, só deixa de ver a oferta de frete grátis.`}
              min={0} />
            {shippingLedger && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F0EBE1] px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B09C8C]">Saldo atual do caixa de frete</p>
                  <p className="text-[10px] text-[#B09C8C] mt-0.5">
                    Cobrado dos clientes: R$ {(shippingLedger.collectedCents/100).toFixed(2)} · Gasto real: R$ {(shippingLedger.spentCents/100).toFixed(2)}
                  </p>
                </div>
                <p className={`text-[18px] font-bold ${shippingLedger.balanceCents < 0 ? 'text-red-600' : 'text-[#1E1208]'}`}>
                  R$ {(shippingLedger.balanceCents/100).toFixed(2)}
                </p>
              </div>
            )}
          </Card>

          <Card icon="timer" title="Quando você envia?" desc="Horário limite para o pedido sair hoje, depois desse horário vai no próximo dia útil">
            <F label="Horário de corte" value={settings.dispatchCutoffTime}
              onChange={v => set('dispatchCutoffTime', v)} type="time"
              hint={`Pedidos feitos após ${settings.dispatchCutoffTime} são enviados no próximo dia útil`} />
            <Num label="Peso médio de cada produto embalado (kg)"
              value={settings.defaultItemWeightKg} onChange={v => set('defaultItemWeightKg', v)}
              step={0.1} hint="Usado para calcular o frete, peso do lençol já dentro da embalagem" />
          </Card>

          <Card icon="bell" title="Alerta de estoque baixo" desc="Quando o sistema avisa que um produto está quase acabando">
            <Num label="Avisar quando restar quantas unidades?"
              value={settings.lowStockThreshold} onChange={v => set('lowStockThreshold', v)}
              min={0}
              hint={`O produto aparecerá como "Últimas unidades" quando restar ${settings.lowStockThreshold} ou menos`} />
          </Card>

          <Card icon="card" title="Pagamento por cartão" desc="Habilite cartão de crédito a partir de um valor mínimo, 0 desativa">
            <Num label="Valor mínimo para cartão (R$)"
              value={settings.creditMinOrderCents / 100}
              onChange={v => set('creditMinOrderCents', Math.round(v * 100))}
              min={0}
              hint={settings.creditMinOrderCents === 0
                ? 'Cartão desativado, apenas PIX disponível'
                : `Cartão habilitado para pedidos acima de R$ ${(settings.creditMinOrderCents/100).toFixed(2)}`} />
          </Card>

          <Card icon="tag" title="Desconto PIX" desc="Ofereça desconto percentual para pagamentos via PIX acima de um valor mínimo, 0 desativa">
            <Row>
              <Num label="Valor mínimo para desconto (R$)"
                value={(settings.pixDiscountThresholdCents ?? 0) / 100}
                onChange={v => set('pixDiscountThresholdCents', Math.round(v * 100))}
                min={0}
                hint={(settings.pixDiscountThresholdCents ?? 0) === 0
                  ? 'Desconto PIX desativado'
                  : `Ativa o desconto para pedidos acima de R$ ${((settings.pixDiscountThresholdCents ?? 0)/100).toFixed(2)}`}
              />
              <Num label="Percentual de desconto (%)"
                value={settings.pixDiscountPct ?? 10}
                onChange={v => set('pixDiscountPct', Math.min(100, Math.max(0, v)))}
                min={0}
                max={100}
                hint={(settings.pixDiscountThresholdCents ?? 0) === 0
                  ? '-'
                  : `Cliente economiza ${settings.pixDiscountPct ?? 10}% pagando com PIX`}
              />
            </Row>
          </Card>

        </div>
      )}

      {/* ── EQUIPE (admin only) ── */}
      {tab === 'equipe' && isAdmin && (
        <div className="flex flex-col gap-5">
          <TeamPanel />
        </div>
      )}

      {/* Botão salvar fixo */}
      {/* No celular e no tablet a barra fixa só aparece com algo a salvar
          (antes "Nenhuma alteração" ocupava ~76px o tempo todo); no tablet
          ficava no fim de uma página de 2600px, agora fica fixa até o lg. */}
      {tab !== 'equipe' && (
      <div className={`${dirty || saved || saving || saveError ? 'fixed' : 'hidden'} above-panel-tabbar left-0 right-0 z-30 lg:block lg:relative lg:bottom-auto lg:mt-8 animate-fade-up lg:animate-none`}>
        <div className="bg-paper/95 backdrop-blur-md border-t border-mist lg:border-0 lg:bg-transparent lg:backdrop-blur-none px-4 py-3 lg:px-0 lg:py-0">
          {saveError && <p className="text-center text-[12px] text-red-600 mb-2">{saveError}</p>}
          <button onClick={handleSave} disabled={saving || (!dirty && !saved)}
            className="w-full bg-ink text-paper text-sm font-semibold h-12 lg:h-14 disabled:opacity-50 hover:bg-ink/85 transition-colors flex items-center justify-center gap-2 rounded-full"
          >
            {saving
              ? <><span className="spinner" />Salvando…</>
              : saved
              ? 'Salvo com sucesso!'
              : dirty
              ? 'Salvar alterações'
              : 'Nenhuma alteração'}
          </button>
          {dirty && !saving && <p className="text-center text-[11px] text-clay mt-2">Você tem mudanças não salvas.</p>}
        </div>
      </div>
      )}

      {/* Previews */}
      <PreviewModal open={preview==='hero'}      onClose={() => setPreview(null)} title="Banner principal"      routeLabel="/"><HeroPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='featured'}  onClose={() => setPreview(null)} title="Destaques"             routeLabel="/"><FeaturedPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='cta'}       onClose={() => setPreview(null)} title="Chamada final"         routeLabel="/"><CtaPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='footer'}    onClose={() => setPreview(null)} title="Rodapé"                routeLabel="/"><FooterPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='sobre'}     onClose={() => setPreview(null)} title="Sobre nós"             routeLabel="/sobre"><SobrePreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='trust'}     onClose={() => setPreview(null)} title="Garantias do produto"  routeLabel="/produtos/[produto]"><ProductTrustPreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='sizeguide'} onClose={() => setPreview(null)} title="Guia de medidas"       routeLabel="/produtos/[produto]"><SizeGuidePreview s={settings}/></PreviewModal>
      <PreviewModal open={preview==='bedguide'}  onClose={() => setPreview(null)} title="Guia de tamanhos"      routeLabel="/produtos/[produto]"><BedSizeGuidePreview s={settings}/></PreviewModal>
    </div>
  );
}

/* ── Card container ────────────────────────────────────────────────────── */
const CARD_ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  loja: IconStore, vitrine: IconImage, produto: IconBox, entrega: IconTruck,
  edit: IconEdit, pin: IconPin, phone: IconPhone, clock: IconClock,
  alert: IconAlert, check: IconCheck, trend: IconTrend, bolt: IconBolt,
  shield: IconShield, ruler: IconRuler, gift: IconGift, bell: IconBell,
  card: IconCard, receipt: IconReceipt, settings: IconSettings,
  info: IconInfo, inventory: IconInventory, mail: IconMail, book: IconShield,
  megaphone: IconBell, frame: IconImage, timer: IconClock, tag: IconReceipt,
};

function Card({ icon, title, desc, children, onPreview }: {
  icon: string; title: string; desc: string;
  children: React.ReactNode; onPreview?: () => void;
}) {
  const IconComp = CARD_ICON_MAP[icon];
  return (
    <div className="border border-mist bg-white dark:bg-warm overflow-hidden rounded-xl">
      <div className="flex items-start justify-between gap-3 px-5 py-4 bg-paper border-b border-mist">
        <div className="flex items-start gap-3">
          {IconComp ? <IconComp size={16} className="text-mid mt-0.5 shrink-0" /> : null}
          <div>
            <p className="text-[13px] font-bold text-ink">{title}</p>
            <p className="text-[11px] text-faint mt-0.5 leading-relaxed">{desc}</p>
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
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 -mx-5 px-5 pt-2 pb-1 border-t border-warm">
      <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint whitespace-nowrap">{label}</span>
    </div>
  );
}
function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-100 px-3 py-2.5 rounded-sm -mt-1">
      <IconInfo size={13} className="text-blue-400 mt-0.5 shrink-0" />
      <p className="text-[11px] text-blue-700 leading-relaxed">{children}</p>
    </div>
  );
}
// Exemplos nos campos com "Ex.:" e mais claros: sem isso "Rua das Flores",
// "Centro" etc. pareciam valores já salvos. Formatos (CNPJ, CEP, URL) ficam
// como estão.
function examplePlaceholder(p?: string) {
  if (!p || /^https?:/.test(p) || /0{3,}/.test(p)) return p;
  return `Ex.: ${p}`;
}

// inputMode/type certos trazem o teclado certo no celular (números pro
// CEP, telefone pro WhatsApp, @ pro e-mail); antes todo campo abria o
// teclado de letras.
function F({ label, value, onChange, hint, placeholder, maxLength, type='text', inputMode }: {
  label:string; value:string; onChange:(v:string)=>void;
  hint?:string; placeholder?:string; maxLength?:number; type?:string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-mid mb-1.5">{label}</label>
      <input id={id} type={type} inputMode={inputMode} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={examplePlaceholder(placeholder)} maxLength={maxLength}
        {...(type === 'url' || type === 'email' ? { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } : {})}
        className="panel-input placeholder:text-faint/60 placeholder:italic" />
      {hint && <p className="mt-1.5 text-[11px] text-faint leading-relaxed">{hint}</p>}
    </div>
  );
}
function TA({ label, value, onChange, rows=3, placeholder, hint }: {
  label:string; value:string; onChange:(v:string)=>void; rows?:number; placeholder?:string; hint?:string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-mid mb-1.5">{label}</label>
      <textarea id={id} value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={examplePlaceholder(placeholder)}
        className="panel-input resize-y placeholder:text-faint/60 placeholder:italic" />
      {hint && <p className="mt-1.5 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}
function Toggle({ label, checked, onChange, hint, warn }: {
  label:string; checked:boolean; onChange:(v:boolean)=>void; hint?:string; warn?:string;
}) {
  return (
    <div>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative w-10 h-6 rounded-full shrink-0 transition-colors duration-150 ${checked ? 'bg-clay-l' : 'bg-mist'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white dark:bg-warm shadow transition-transform duration-150 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <span className="text-[13px] font-semibold text-mid">{label}</span>
      </label>
      {hint && <p className="mt-1.5 text-[11px] text-faint leading-relaxed">{hint}</p>}
      {checked && warn && <p className="mt-1.5 text-[11px] text-clay font-semibold leading-relaxed">{warn}</p>}
    </div>
  );
}
function Num({ label, value, onChange, hint, min, max }: {
  label:string; value:number; onChange:(v:number)=>void;
  hint?:string; min?:number; max?:number; step?:number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-mid mb-1.5">{label}</label>
      {/* Texto livre enquanto edita: antes apagar o campo pra digitar outro
          número fazia ele voltar pra 0 na hora. Campo vazio ao sair volta
          pro último valor válido. */}
      <input id={id} type="text" inputMode={min !== undefined && min >= 0 ? 'decimal' : undefined} value={draft ?? String(value).replace('.', ',')}
        onFocus={() => setDraft(String(value).replace('.', ','))}
        onChange={e => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value.replace(',', '.'));
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onBlur={() => setDraft(null)}
        className="panel-input" />
      {hint && <p className="mt-1.5 text-[11px] text-faint leading-relaxed">{hint}</p>}
    </div>
  );
}

/* ── Table editor (reusável para guias) ────────────────────────────────── */
/**
 * Medida da peça em três campos (cm): largura × comprimento × altura. Salva
 * já no padrão ("88 × 188 × 40 cm"); valor antigo em texto livre é lido e
 * convertido (metro vira centímetro).
 */
function MeasureInput({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  const initial = parseMeasure(value);
  const [parts, setParts] = useState({
    l: initial.l != null ? String(initial.l).replace('.', ',') : '',
    c: initial.c != null ? String(initial.c).replace('.', ',') : '',
    a: initial.a != null ? String(initial.a).replace('.', ',') : '',
  });
  // Valor trocado de fora (configurações carregando, linha removida acima):
  // ressincroniza os campos. Enquanto digita, o valor formatado bate e nada muda.
  useEffect(() => {
    const n = (x: string) => (x ? Number(x.replace(',', '.')) || undefined : undefined);
    if (formatMeasure({ l: n(parts.l), c: n(parts.c), a: n(parts.a) }) === value) return;
    const m = parseMeasure(value);
    const str = (x?: number) => (x != null ? String(x).replace('.', ',') : '');
    setParts({ l: str(m.l), c: str(m.c), a: str(m.a) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const update = (k: 'l' | 'c' | 'a', v: string) => {
    const clean = v.replace(/[^\d,.]/g, '').slice(0, 6);
    const next = { ...parts, [k]: clean };
    setParts(next);
    const n = (x: string) => (x ? Number(x.replace(',', '.')) || undefined : undefined);
    onChange(formatMeasure({ l: n(next.l), c: n(next.c), a: n(next.a) }));
  };
  const box = 'w-full min-w-0 border border-mist bg-white dark:bg-warm px-1.5 py-2 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-clay-l/30 rounded-lg placeholder:text-[10px]';
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`${label} (cm)`}>
      <input inputMode="decimal" value={parts.l} onChange={e => update('l', e.target.value)} placeholder="Larg." aria-label="Largura (cm)" className={box} />
      <span className="text-faint text-[11px]">×</span>
      <input inputMode="decimal" value={parts.c} onChange={e => update('c', e.target.value)} placeholder="Compr." aria-label="Comprimento (cm)" className={box} />
      <span className="text-faint text-[11px]">×</span>
      <input inputMode="decimal" value={parts.a} onChange={e => update('a', e.target.value)} placeholder="Alt." aria-label="Altura (cm), opcional" className={box} />
    </div>
  );
}

function TableEditor({ colsJson, rowsJson, onRowsChange, measures = false }: {
  colsJson: string; rowsJson: string; onRowsChange: (v: string) => void;
  /** Colunas depois da primeira são medidas L × C × A (guia de medidas por peça). */
  measures?: boolean;
}) {
  let cols: string[] = []; let rows: Record<string,string>[] = [];
  try { cols = JSON.parse(colsJson || '[]'); } catch {}
  try { rows = JSON.parse(rowsJson || '[]'); } catch {}

  if (!cols.length) return <p className="text-[12px] text-faint">Defina as colunas acima primeiro.</p>;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="grid gap-2 pr-8 [grid-template-columns:repeat(var(--cols),1fr)]" style={{ '--cols': cols.length } as React.CSSProperties}>
        {cols.map(c => (
          <p key={c} className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint">{c}</p>
        ))}
      </div>
      {/* Rows */}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <div className="grid gap-2 flex-1 [grid-template-columns:repeat(var(--cols),1fr)]" style={{ '--cols': cols.length } as React.CSSProperties}>
            {cols.map((col, j) => {
              const setCell = (v: string) => {
                const next = [...rows]; next[i] = { ...next[i], [col]: v };
                onRowsChange(JSON.stringify(next));
              };
              // Primeira coluna: nome do tamanho. As outras: medida da peça.
              return j === 0 || !measures ? (
                <input key={col} type="text" value={row[col]??''} placeholder={col} aria-label={`${col}, linha ${i + 1}`}
                  onChange={e => setCell(e.target.value)}
                  className="w-full border border-mist bg-white dark:bg-warm px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-clay-l/30 rounded-xl" />
              ) : (
                <MeasureInput key={col} value={row[col] ?? ''} label={`${col}, linha ${i + 1}`} onChange={setCell} />
              );
            })}
          </div>
          <button onClick={() => onRowsChange(JSON.stringify(rows.filter((_,idx)=>idx!==i)))}
            className="w-7 h-7 flex items-center justify-center text-faint hover:text-red-400 transition-colors shrink-0 text-sm">
            <IconX size={14} />
          </button>
        </div>
      ))}
      <button onClick={() => onRowsChange(JSON.stringify([...rows, Object.fromEntries(cols.map(c=>[c,'']))]))}
        className="mt-1 border-2 border-dashed border-clay-l/25 text-clay text-[12px] font-semibold py-2.5 hover:bg-clay-l/5 hover:border-clay-l/50 transition-all">
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
        <p className="text-[12px] text-faint text-center py-4 border border-dashed border-mist rounded-xl">
          Nenhum marco ainda, clique abaixo para adicionar
        </p>
      )}
      {items.map((item,i) => (
        <div key={i} className="border border-mist p-4 flex flex-col gap-3 rounded-xl">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-ink">Marco {i+1}</p>
            <button onClick={()=>upd(items.filter((_,idx)=>idx!==i))}
              className="text-[11px] text-faint hover:text-red-500 transition-colors">Remover</button>
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
        className="border-2 border-dashed border-clay-l/30 text-clay text-[13px] font-semibold py-3 hover:bg-clay-l/5 transition-all">
        + Adicionar marco
      </button>
    </div>
  );
}

/* ── Equipe (admin only) ──────────────────────────────────────────────────
 * Promove/revoga acesso ao painel pra contas que já existem (já fizeram
 * login/cadastro no site pelo menos uma vez). A autorização de verdade é
 * sempre checada no servidor via custom claim, esta tela é só a interface.
 */
type TeamMember = { uid: string; email: string; displayName: string | null; role: 'seller' | 'admin' };
type SearchUser = { uid: string; email: string | null; displayName: string | null; photoURL: string | null; role: string };

function TeamPanel() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [role, setRole] = useState<'seller' | 'admin'>('seller');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function authFetch(path: string, init?: RequestInit) {
    const token = await user!.getIdToken();
    return fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch('/api/painel/team');
      const data = await res.json();
      if (res.ok) setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca com debounce, só dispara 300ms depois que a pessoa para de digitar
  useEffect(() => {
    setSelected(null);
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(`/api/painel/team/users?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (res.ok) setResults(data.users ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selected?.email) { setError('Escolha alguém da lista de busca.'); return; }
    setError('');
    setBusy(true);
    try {
      const res = await authFetch('/api/painel/team', { method: 'POST', body: JSON.stringify({ email: selected.email, role }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao adicionar'); return; }
      setQuery('');
      setSelected(null);
      setResults([]);
      setRole('seller');
      await load();
    } catch {
      setError('Erro de conexão. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(uid: string) {
    const { confirmed } = await confirmDialog({
      message: 'Remover o acesso dessa pessoa ao painel?',
      detail: 'Ela deixa de conseguir entrar no painel. Dá pra convidar de novo depois.',
      confirmLabel: 'Remover acesso',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/painel/team', { method: 'DELETE', body: JSON.stringify({ uid }) });
      // Antes ignorava a resposta: "não pode remover o próprio acesso" ou
      // pessoa não encontrada não mostravam nada.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Não foi possível remover. Tente de novo.');
        return;
      }
      await load();
    } catch {
      setError('Erro de conexão. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const memberUids = new Set(members.map(m => m.uid));

  return (
    <>
      <Card icon="shield" title="Adicionar à equipe" desc="Busque por nome ou e-mail entre as contas que já existem no site, não precisa digitar o e-mail inteiro certinho.">
        <Info>Só admins conseguem gerenciar a equipe. Sellers têm acesso ao painel, mas não podem adicionar ou remover outras pessoas, assim uma conta de seller comprometida não vira uma porta pra criar acessos ilimitados.</Info>
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="relative flex flex-col gap-1.5">
            <label htmlFor="config-buscar-pessoa" className="text-[13px] font-bold text-mid uppercase tracking-wide">Buscar pessoa</label>
            <input
              id="config-buscar-pessoa"
              value={selected ? (selected.displayName || selected.email || '') : query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Nome ou e-mail…"
              className="border border-mist px-3 py-2.5 text-[13px] outline-none focus:border-clay-l bg-white dark:bg-warm rounded-xl"
            />
            {!selected && query.trim().length >= 2 && (
              <div className="border border-mist bg-white dark:bg-warm max-h-64 overflow-y-auto shadow-sm rounded-xl">
                {searching ? (
                  <p className="px-3 py-2.5 text-[12px] text-faint">Buscando…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2.5 text-[12px] text-faint">Ninguém encontrado com esse nome/e-mail.</p>
                ) : results.map(u => (
                  <button type="button" key={u.uid} onClick={() => setSelected(u)}
                    className="w-full text-left px-3 py-2.5 hover:bg-warm transition-colors border-b border-warm last:border-0 flex items-center justify-between gap-2">
                    <span>
                      <span className="block text-[13px] font-semibold text-ink">{u.displayName || u.email}</span>
                      <span className="block text-[11px] text-faint">{u.email}</span>
                    </span>
                    {memberUids.has(u.uid) ? (
                      <span className="text-[10px] font-bold text-clay uppercase shrink-0">já é {u.role === 'admin' ? 'admin' : 'seller'}</span>
                    ) : (
                      <span className="text-[10px] text-faint uppercase shrink-0">{u.role === 'buyer' ? 'cliente' : u.role}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label id="config-nivel-label" className="text-[13px] font-bold text-mid uppercase tracking-wide">Nível de acesso</label>
            <div role="group" aria-labelledby="config-nivel-label" className="flex gap-2">
              {(['seller', 'admin'] as const).map(r => (
                <button type="button" key={r} aria-pressed={role === r} onClick={() => setRole(r)}
                  className={`flex-1 py-2.5 text-[12px] font-semibold border transition-colors ${ role === r ? 'bg-ink text-paper border-ink' : 'border-mist text-mid hover:bg-warm' } rounded-xl`}>
                  {r === 'seller' ? 'Seller (gerencia loja)' : 'Admin (gerencia loja + equipe)'}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <button type="submit" disabled={busy || !selected}
            className="bg-clay-l text-paper text-[13px] font-semibold py-3 disabled:opacity-50 hover:bg-clay transition-colors">
            {busy ? 'Adicionando…' : selected ? `Adicionar ${selected.displayName || selected.email}` : 'Escolha alguém acima'}
          </button>
        </form>
      </Card>

      <Card icon="shield" title="Quem tem acesso hoje" desc="Sellers e admins ativos no painel">
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 !rounded-lg" />)}</div>
        ) : members.length === 0 ? (
          <p className="text-[13px] text-faint">Ninguém além de você ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.uid} className="flex items-center justify-between border border-mist px-3 py-2.5 rounded-xl">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{m.displayName || m.email}</p>
                  <p className="text-[11px] text-faint">{m.email} · {m.role === 'admin' ? 'Admin' : 'Seller'}</p>
                </div>
                {m.uid !== user?.uid && (
                  <button onClick={() => handleRemove(m.uid)} disabled={busy}
                    className="text-[11px] text-faint hover:text-red-500 transition-colors disabled:opacity-50">
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
