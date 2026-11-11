import { escapeHtml } from '@/lib/html';
import {
  BASE_URL, CONTACT_EMAIL, emailCallout, emailCta, emailLayout, emailParagraph,
  emailSection, emailSignature, shortOrderId, STORE_NAME,
} from './layout';

/** O que mudou na troca e vale um e-mail para o cliente. */
export type AvisoTroca = 'aprovada' | 'codigo' | 'chegou' | 'recusada' | 'concluida';

export interface TrocaEmailInput {
  kind: AvisoTroca;
  type: 'troca' | 'devolucao';
  orderId: string;
  name: string;
  /** Código de postagem dos Correios e último dia para postar (ISO). */
  reversa?: { codigoObjeto: string; validade: string };
}

const diaMes = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function buildTrocaEmail({ kind, type, orderId, name, reversa }: TrocaEmailInput) {
  const id = shortOrderId(orderId);
  const url = `${BASE_URL}/pedidos/${orderId}`;
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
    aprovada: {
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
    chegou: {
      subject: `Recebemos as peças da sua ${what}, pedido #${id}`,
      title: 'As peças chegaram',
      body: `${emailParagraph(`${ola} O pacote da sua ${what} chegou na loja.`)}${emailParagraph(`Vamos conferir as peças e te avisamos quando a ${what} estiver concluída.`, { muted: true })}`,
      text: `Olá, ${name}! O pacote da ${what} do pedido #${id} chegou na loja. Vamos conferir e te avisamos quando estiver concluída.`,
    },
    recusada: {
      subject: `Sobre a sua ${what}, pedido #${id}`,
      title: `${What} não aprovada`,
      body: `${emailParagraph(`${ola} Analisamos o seu pedido de ${what} e, desta vez, não conseguimos aprovar.`)}${emailParagraph(`Se quiser entender o motivo ou tiver alguma dúvida, é só responder este e-mail ou escrever para ${escapeHtml(CONTACT_EMAIL)}.`, { muted: true })}`,
      text: `Olá, ${name}! Não conseguimos aprovar a ${what} do pedido #${id}. Responda este e-mail se tiver dúvida.`,
    },
    concluida: {
      subject: `${What} concluída, pedido #${id}`,
      title: `${What} concluída`,
      body: `${emailParagraph(`${ola} As peças chegaram e a sua ${what} foi concluída.`)}${emailParagraph(type === 'troca' ? 'Se a troca gerou um envio novo, você recebe o rastreio por e-mail.' : 'Se houver valor a devolver, ele segue pelo mesmo meio de pagamento da compra.', { muted: true })}`,
      text: `Olá, ${name}! A ${what} do pedido #${id} foi concluída. Obrigado pela paciência.`,
    },
  }[kind];

  const html = emailLayout(`
    ${emailSection({ eyebrow: `Pedido #${id}`, title: c.title, html: `${c.body}${emailCta('Ver no pedido', url)}` })}
    ${emailSignature()}`, { preheader: c.text.slice(0, 110) });
  return { subject: `${c.subject} | ${STORE_NAME}`, html, text: `${c.text} Acompanhe em: ${url}` };
}
