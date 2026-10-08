export const revalidate = 86400; // 24h, conteúdo estático

import { getSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, A, B, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Trocas e Devoluções',
  description: 'Direito de arrependimento, troca por defeito, reembolso e como solicitar.',
  alternates: { canonical: '/trocas-e-devolucoes' },
};

export default async function TrocasEDevolucoesPage() {
  const s = await getSettings();
  const id = storeIdentity(s);

  const sections: LegalSection[] = [
    {
      id: 'arrependimento',
      title: 'Direito de arrependimento',
      clauses: [
        clause(
          <>
            Por se tratar de compra realizada a distância, o Cliente pode desistir do Pedido em até{' '}
            <B>7 (sete) dias corridos</B>, contados do recebimento do Produto, sem necessidade de
            justificativa, nos termos do art. 49 do Código de Defesa do Consumidor (Lei nº
            8.078/1990).
          </>,
        ),
        clause(
          'Exercido o direito de arrependimento, a Loja devolverá integralmente os valores pagos, inclusive o frete, e orientará a devolução do Produto sem custo para o Cliente.',
        ),
        clause(
          'O Produto deve ser devolvido sem sinais de uso, em condições de ser reaproveitado e, sempre que possível, com etiquetas e embalagem original.',
        ),
      ],
    },
    {
      id: 'defeito',
      title: 'Produto com defeito',
      clauses: [
        clause(
          'Constatado vício de qualidade no Produto, o Cliente deve comunicá-lo à Loja nos prazos do art. 26 do Código de Defesa do Consumidor: 30 (trinta) dias para produtos não duráveis e 90 (noventa) dias para produtos duráveis, contados da entrega, em caso de vício aparente, ou da constatação, em caso de vício oculto.',
        ),
        clause(
          'A Loja dispõe de até 30 (trinta) dias para sanar o vício. Não sendo ele resolvido nesse prazo, o Cliente pode optar entre a substituição do Produto, a restituição do valor pago ou o abatimento proporcional do preço (art. 18, § 1º, do Código de Defesa do Consumidor).',
        ),
      ],
    },
    {
      id: 'avaria',
      title: 'Produto avariado ou diferente do pedido',
      clauses: [
        clause(
          <>
            Ao receber o Pedido, o Cliente deve conferir a embalagem e o Produto. Havendo avaria ou
            divergência em relação ao Pedido, deverá recusar a entrega ou comunicar a Loja o quanto
            antes, com fotos da embalagem e do Produto e o número do Pedido.
          </>,
        ),
        clause(
          'Confirmada a avaria ou a divergência, a Loja providenciará a troca do Produto ou o reembolso, conforme a escolha do Cliente e a disponibilidade em estoque.',
        ),
      ],
    },
    {
      id: 'como-solicitar',
      title: 'Como solicitar',
      clauses: [
        clause('Para solicitar arrependimento, troca ou devolução, o Cliente deve:', [
          'entrar em contato com a Loja por um dos canais de atendimento indicados abaixo;',
          'informar o número do Pedido e o motivo da solicitação;',
          'em caso de defeito, avaria ou divergência, enviar fotos que mostrem o problema;',
          'aguardar as orientações da Loja e enviar o Produto conforme indicado.',
        ]),
        contactClause(id, 'Canais de atendimento da Loja:'),
      ],
    },
    {
      id: 'reembolso',
      title: 'Reembolso',
      clauses: [
        clause(
          'O reembolso é realizado pelo mesmo meio utilizado no pagamento (PIX ou cartão), assim que o Produto for recebido e conferido pela Loja, em prazo compatível com a operação financeira.',
        ),
        clause(
          'Nos pagamentos por cartão, o estorno ocorre conforme o ciclo de faturamento da administradora do cartão, podendo aparecer em fatura posterior.',
        ),
      ],
    },
    {
      id: 'disposicoes',
      title: 'Disposições gerais',
      clauses: [
        clause(
          <>
            Esta Política integra os <A href="/termos">Termos e Condições de Uso</A> e não limita os
            direitos assegurados ao consumidor por lei.
          </>,
        ),
      ],
    },
  ];

  return (
    <LegalPage
      title="Trocas e Devoluções"
      current="/trocas-e-devolucoes"
      intro={
        <>
          Esta Política de Trocas e Devoluções descreve o direito de arrependimento, as hipóteses de
          troca e reembolso e o procedimento para solicitá-los em compras realizadas em {id.name}.
        </>
      }
      sections={sections}
    />
  );
}
