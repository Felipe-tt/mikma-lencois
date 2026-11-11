
import { shareMeta } from '@/lib/seo';
import { getStoreSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, A, B, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Trocas e Devoluções',
  description: 'Troca e devolução em até 7 dias, defeito em até 90 e como receber o seu dinheiro de volta.',
  ...shareMeta({ title: 'Trocas e Devoluções', description: 'Troca e devolução em até 7 dias, defeito em até 90 e como receber o seu dinheiro de volta.', path: '/trocas-e-devolucoes' }),
  alternates: { canonical: '/trocas-e-devolucoes' },
};

export default async function TrocasEDevolucoesPage() {
  const s = await getStoreSettings();
  const id = storeIdentity(s);

  const sections: LegalSection[] = [
    {
      id: 'arrependimento',
      title: 'Quer trocar ou devolver?',
      clauses: [
        clause(
          <>
            Você tem <B>7 dias corridos</B>, a contar do dia em que recebeu o pedido, para trocar
            (outro tamanho ou cor) ou devolver. Para devolver, não precisa explicar o motivo: é o
            direito de arrependimento das compras pela internet (art. 49 do Código de Defesa do
            Consumidor).
          </>,
        ),
        clause(
          <>
            As peças precisam voltar <B>sem lavar e sem usar</B>, de preferência com a etiqueta e a
            embalagem.
          </>,
        ),
        clause(
          'Na devolução, devolvemos todo o valor pago, inclusive o frete. Nos dois casos, você não paga nada para nos mandar o produto de volta.',
        ),
        clause(
          'Passados os 7 dias, a troca e a devolução não valem mais. Se o produto tiver defeito, veja abaixo.',
        ),
      ],
    },
    {
      id: 'defeito',
      title: 'Veio com defeito?',
      clauses: [
        clause(
          <>
            Avise a gente em até <B>90 dias</B>. O prazo conta do dia em que você recebeu o pedido
            ou, se o defeito só aparecer com o uso, do dia em que você o percebeu (art. 26 do Código
            de Defesa do Consumidor).
          </>,
        ),
        clause(
          'Temos até 30 dias para resolver. Se não resolvermos, você escolhe: trocar por um produto novo, receber o dinheiro de volta ou ficar com o produto pagando menos.',
        ),
      ],
    },
    {
      id: 'avaria',
      title: 'Chegou danificado ou errado?',
      clauses: [
        clause(
          'Confira o pacote quando receber. Se a embalagem estiver danificada ou o produto for diferente do que você pediu, recuse a entrega ou avise a gente assim que puder, com fotos e o número do pedido.',
        ),
        clause(
          'Confirmado o problema, mandamos o produto certo ou devolvemos o dinheiro, como você preferir (e se tivermos o produto em estoque).',
        ),
      ],
    },
    {
      id: 'como-pedir',
      title: 'Como pedir',
      clauses: [
        clause('É rápido:', [
          'abra o pedido em Minha conta, Pedidos, e toque em "Pedir troca ou devolução" (ou fale com a gente por um dos contatos abaixo);',
          'escolha Trocar, Devolver ou Defeito, as peças e conte o que aconteceu; se for defeito, dano ou produto errado, mande fotos pelo WhatsApp;',
          'aprovado, você recebe um código dos Correios para postar em qualquer agência, sem pagar nada.',
        ]),
        contactClause(id, 'Nossos contatos:'),
      ],
    },
    {
      id: 'reembolso',
      title: 'Como você recebe o dinheiro',
      clauses: [
        clause(
          'Devolvemos pelo mesmo meio usado no pagamento, assim que o produto chegar e for conferido. No PIX, o dinheiro volta para a sua conta.',
        ),
        clause(
          'No cartão, o estorno segue o calendário do seu cartão e pode aparecer só na fatura seguinte.',
        ),
      ],
    },
    {
      id: 'importante',
      title: 'Importante',
      clauses: [
        clause(
          <>
            Esta política faz parte dos nossos <A href="/termos">Termos de Uso</A> e não diminui
            nenhum dos seus direitos de consumidor.
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
          Queremos que você fique feliz com a sua compra. Se não ficou, aqui está como resolver.
        </>
      }
      summary={[
        <>
          <B>7 dias</B> para trocar ou devolver, com as peças sem lavar e sem usar.
        </>,
        'Devolveu? Devolvemos tudo, inclusive o frete.',
      ]}
      sections={sections}
    />
  );
}
