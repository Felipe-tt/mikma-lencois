import { escapeHtml } from '@/lib/html';
import {
  BASE_URL, CONTACT_EMAIL, emailCallout, emailCta, emailLayout, emailParagraph,
  emailSection, emailSignature, shortOrderId, STORE_NAME,
} from './layout';

/** O que mudou na troca e vale um e-mail para o cliente. */
export type AvisoTroca = 'aprovada' | 'codigo' | 'coleta' | 'chegou' | 'recusada' | 'concluida';

export interface TrocaEmailInput {
  kind: AvisoTroca;
  type: 'troca' | 'devolucao';
  orderId: string;
  name: string;
  /** Código de postagem dos Correios e último dia para postar (ISO). */
  reversa?: { codigoObjeto: string; validade: string };
  /** Por onde as peças voltam (sem o campo: Correios). */
  devolverPor?: 'correios' | 'uber' | 'loja';
  /** Endereço da loja numa linha, para quem entrega no balcão. */
  enderecoLoja?: string;
  /** Link da Uber para acompanhar o entregador que vai buscar. */
  coletaUrl?: string;
  /** Recusa: o motivo que a loja escreveu. */
  motivoRecusa?: string;
}

const diaMes = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function buildTrocaEmail({ kind, type, orderId, name, reversa, devolverPor = 'correios', enderecoLoja, coletaUrl, motivoRecusa }: TrocaEmailInput) {
  const id = shortOrderId(orderId);
  const url = `${BASE_URL}/pedidos/${orderId}/troca`;
  const what = type === 'troca' ? 'troca' : 'devolução';
  const What = type === 'troca' ? 'Troca' : 'Devolução';
  const ola = `Olá, <strong>${escapeHtml(name)}</strong>!`;
  const codigo = reversa
    ? emailCallout(`<p style="margin:0 0 4px;font-size:12px;color:#705A48;">Código de postagem dos Correios</p>
        <p style="margin:0;font-family:monospace;font-size:20px;font-weight:bold;color:#1E1208;letter-spacing:.06em;">${escapeHtml(reversa.codigoObjeto)}</p>`)
    : '';
  const postar = reversa
    ? `Embale as peças e leve a qualquer agência dos Correios até <strong>${diaMes(reversa.validade)}</strong>. Informe o código no balcão: o envio é por nossa conta, você não paga nada.`
    : '';

  const c = {
    aprovada: devolverPor === 'uber' ? {
      subject: `${What} aprovada, pedido #${id}`,
      title: `${What} aprovada`,
      body: `${emailParagraph(`${ola} Aprovamos a sua ${what}.`)}${emailParagraph('Vamos combinar um horário com você e mandar um entregador da Uber buscar as peças no seu endereço. Deixe tudo embalado. Você não paga nada.')}`,
      text: `Olá, ${name}! Aprovamos a sua ${what} do pedido #${id}. Vamos combinar um horário e mandar um entregador da Uber buscar as peças, sem custo.`,
    } : devolverPor === 'loja' ? {
      subject: `${What} aprovada, pedido #${id}`,
      title: `${What} aprovada`,
      body: `${emailParagraph(`${ola} Aprovamos a sua ${what}.`)}${emailParagraph(`Leve as peças na loja quando puder, no horário de funcionamento${enderecoLoja ? `: <strong>${escapeHtml(enderecoLoja)}</strong>` : ''}. Não precisa agendar.`)}`,
      text: `Olá, ${name}! Aprovamos a sua ${what} do pedido #${id}. Leve as peças na loja quando puder${enderecoLoja ? `: ${enderecoLoja}` : ''}.`,
    } : {
      subject: `${What} aprovada, pedido #${id}`,
      title: `${What} aprovada`,
      body: reversa
        ? `${emailParagraph(`${ola} Aprovamos a sua ${what}.`)}${codigo}${emailParagraph(postar)}`
        : `${emailParagraph(`${ola} Aprovamos a sua ${what}.`)}${emailParagraph('Em seguida você recebe o código para enviar as peças pelos Correios, sem custo.', { muted: true })}`,
      text: reversa
        ? `Olá, ${name}! Aprovamos a sua ${what} do pedido #${id}. Código dos Correios: ${reversa.codigoObjeto}. Leve o pacote a qualquer agência até ${diaMes(reversa.validade)}; o envio é por nossa conta.`
        : `Olá, ${name}! Aprovamos a sua ${what} do pedido #${id}. Em seguida você recebe o código para enviar pelos Correios, sem custo.`,
    },
    codigo: {
      subject: `Código para enviar sua ${what}, pedido #${id}`,
      title: 'Seu código dos Correios',
      body: `${emailParagraph(`${ola} Aqui está o código para devolver as peças.`)}${codigo}${emailParagraph(postar)}`,
      text: `Olá, ${name}! Código dos Correios para a ${what} do pedido #${id}: ${reversa?.codigoObjeto ?? ''}. Leve o pacote a qualquer agência até ${reversa ? diaMes(reversa.validade) : ''}; o envio é por nossa conta.`,
    },
    coleta: {
      subject: `Entregador a caminho para buscar sua ${what}, pedido #${id}`,
      title: 'O entregador está indo buscar',
      body: `${emailParagraph(`${ola} Chamamos um entregador da Uber para buscar as peças da sua ${what}.`)}${emailParagraph('Deixe o pacote pronto e entregue a ele quando chegar. O envio é por nossa conta.')}`,
      text: `Olá, ${name}! Um entregador da Uber está indo buscar as peças da ${what} do pedido #${id}. Deixe o pacote pronto; o envio é por nossa conta.`,
    },
    chegou: {
      subject: `Recebemos as peças da sua ${what}, pedido #${id}`,
      title: 'As peças chegaram',
      body: `${emailParagraph(`${ola} O pacote da sua ${what} chegou na loja.`)}${emailParagraph(`Vamos conferir as peças e te avisamos quando a ${what} estiver concluída.`, { muted: true })}`,
      text: `Olá, ${name}! O pacote da ${what} do pedido #${id} chegou na loja. Vamos conferir e te avisamos quando estiver concluída.`,
    },
    recusada: {
      subject: `Sobre a sua ${what}, pedido #${id}`,
      title: `${What} não aprovada`,
      body: `${emailParagraph(`${ola} Analisamos o seu pedido de ${what} e, desta vez, não conseguimos aprovar.`)}${motivoRecusa ? emailCallout(`<p style="margin:0 0 4px;font-size:12px;color:#705A48;">Motivo</p><p style="margin:0;font-size:14px;color:#2C1F14;line-height:1.6;">${escapeHtml(motivoRecusa)}</p>`) : ''}${emailParagraph(`Se não concordar ou tiver alguma dúvida, é só responder este e-mail ou escrever para ${escapeHtml(CONTACT_EMAIL)}.`, { muted: true })}`,
      text: `Olá, ${name}! Não conseguimos aprovar a ${what} do pedido #${id}.${motivoRecusa ? ` Motivo: ${motivoRecusa}` : ''} Responda este e-mail se tiver dúvida.`,
    },
    concluida: {
      subject: `${What} concluída, pedido #${id}`,
      title: `${What} concluída`,
      body: `${emailParagraph(`${ola} As peças chegaram e a sua ${what} foi concluída.`)}${emailParagraph(type === 'troca' ? 'Se a troca gerou um envio novo, você recebe o rastreio por e-mail.' : 'Se houver valor a devolver, ele segue pelo mesmo meio de pagamento da compra.', { muted: true })}`,
      text: `Olá, ${name}! A ${what} do pedido #${id} foi concluída. Obrigado pela paciência.`,
    },
  }[kind];

  const html = emailLayout(`
    ${emailSection({ eyebrow: `Pedido #${id}`, title: c.title, html: `${c.body}${kind === 'coleta' && coletaUrl ? emailCta('Acompanhar o entregador', coletaUrl) : emailCta(kind === 'codigo' || (kind === 'aprovada' && devolverPor === 'correios') ? 'Ver código e como enviar' : 'Acompanhar troca', url)}` })}
    ${emailSignature()}`, { preheader: c.text.slice(0, 110) });
  return { subject: `${c.subject} | ${STORE_NAME}`, html, text: `${c.text} Acompanhe em: ${url}` };
}
