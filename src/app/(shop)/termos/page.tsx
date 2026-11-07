
import { shareMeta } from '@/lib/seo';
import { getStoreSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, A, B, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Termos de Uso',
  description: 'As regras do site e da compra: conta, pagamento, entrega, trocas e os seus direitos.',
  ...shareMeta({ title: 'Termos de Uso', description: 'As regras do site e da compra: conta, pagamento, entrega, trocas e os seus direitos.', path: '/termos' }),
  alternates: { canonical: '/termos' },
};

export default async function TermosPage() {
  const s = await getStoreSettings();
  const id = storeIdentity(s);

  const sections: LegalSection[] = [
    {
      id: 'quem-somos',
      title: 'Quem somos',
      clauses: [
        clause(
          <>
            Este site é da <B>{id.name}</B>
            {id.cnpj && <> (CNPJ {id.cnpj})</>}, de {id.address || id.cityState}. Quando falamos
            “nós” ou “a loja”, somos nós. Quando falamos “você”, é quem visita o site ou compra
            nele.
          </>,
        ),
        contactClause(id, 'Para falar com a gente:'),
      ],
    },
    {
      id: 'aceite',
      title: 'Ao usar o site',
      clauses: [
        clause(
          <>
            Ao navegar, criar uma conta ou fazer um pedido, você concorda com estes Termos e com as
            nossas políticas de <A href="/privacidade">Privacidade</A>,{' '}
            <A href="/politica-de-cookies">Cookies</A> e{' '}
            <A href="/trocas-e-devolucoes">Trocas e Devoluções</A>.
          </>,
        ),
        clause(
          'Podemos atualizar estes Termos quando o site ou a lei mudarem. Se a mudança for importante, avisamos no site ou por e-mail. Um pedido já feito sempre segue as regras do dia da compra.',
        ),
      ],
    },
    {
      id: 'conta',
      title: 'Sua conta',
      clauses: [
        clause(
          'Você pode comprar com uma conta (e-mail e senha, ou pelo Google) ou sem cadastro, só com os dados da entrega. As compras são para maiores de 18 anos.',
        ),
        clause(
          'Os dados que você informa (nome, e-mail, telefone, CPF e endereço) precisam estar certos. Dados errados podem travar o pagamento, a nota fiscal ou a entrega.',
        ),
        clause(
          'Guarde bem a sua senha. Se desconfiar que alguém usou a sua conta, avise a gente na hora.',
        ),
        clause(
          'Podemos suspender contas usadas para fraude ou contra estes Termos. Se houver pedido já pago, ele é entregue ou devolvemos o dinheiro.',
        ),
        clause(
          <>
            Você pode excluir a sua conta quando quiser, na página <B>Perfil</B>.
          </>,
        ),
      ],
    },
    {
      id: 'produtos',
      title: 'Produtos',
      clauses: [
        clause(
          'Capricamos nas fotos, cores e medidas, mas a cor pode variar um pouco de uma tela para outra, e tecidos têm uma pequena tolerância nas medidas. Na dúvida, consulte o guia de tamanhos.',
        ),
        clause(
          'Os produtos dependem do estoque. Quando você finaliza o pedido, as peças ficam reservadas para você até o pagamento ser confirmado ou o pedido ser cancelado.',
        ),
        clause(
          'Se aparecer um erro evidente de preço ou de estoque, falamos com você antes de seguir: você escolhe se mantém o pedido com a informação certa ou se cancela, com o dinheiro devolvido.',
        ),
      ],
    },
    {
      id: 'precos-pagamento',
      title: 'Preços e pagamento',
      clauses: [
        clause(
          'Os preços são em reais e já incluem os impostos. O frete é calculado pelo seu CEP e aparece antes de você confirmar o pedido.',
        ),
        clause(
          'Vale o preço que aparece na hora de finalizar a compra. Promoções, cupons e frete grátis seguem as regras mostradas no site naquele momento.',
        ),
        clause('Aceitamos PIX e cartão de crédito:', [
          <>
            <B>PIX:</B> o código vale por 15 minutos. Se vencer, você gera outro em{' '}
            <B>Meus pedidos</B>. O pagamento é confirmado na hora.
          </>,
          <>
            <B>Cartão:</B> o total no cartão inclui a taxa da operadora, que aparece separada antes
            de você pagar. Os dados do cartão vão direto para a empresa de pagamento e não passam
            por nós.
          </>,
        ]),
        clause(
          'Pedido que não for pago em 48 horas é cancelado sozinho, e as peças voltam para o estoque.',
        ),
        clause(
          'Se houver sinais de fraude no pagamento, podemos cancelar o pedido e devolver todo o valor pago.',
        ),
        clause('A nota fiscal sai com os dados que você informou no pedido.'),
      ],
    },
    {
      id: 'entrega',
      title: 'Entrega',
      clauses: [
        clause(
          'O prazo começa a contar depois que o pagamento é confirmado. Pedidos pagos depois do horário de despacho mostrado no site saem no dia útil seguinte.',
        ),
        clause('Temos dois jeitos de entregar:', [
          <>
            <B>Entrega local</B> ({id.cityState} e região próxima): um entregador leva o pedido em
            cerca de 1 hora depois de sair da loja. Pode demorar mais com trânsito, chuva ou falta
            de entregadores. Quando disponível, você acompanha o trajeto na página do pedido.
          </>,
          <>
            <B>Resto do Brasil:</B> enviamos por transportadora. O prazo, em dias úteis, aparece no
            cálculo do frete, e o código de rastreio fica na página do pedido.
          </>,
        ]),
        clause(
          'Confira se o endereço está completo e se vai ter alguém para receber. Se o pedido voltar por endereço errado ou ninguém em casa, um novo envio pode ter um novo frete.',
        ),
        clause(
          <>
            Ao receber, confira a embalagem. Se vier danificada, recuse a entrega ou avise a gente
            com fotos, como explicado em <A href="/trocas-e-devolucoes">Trocas e Devoluções</A>.
          </>,
        ),
      ],
    },
    {
      id: 'trocas',
      title: 'Trocas, devoluções e garantia',
      clauses: [
        clause(
          <>
            Você pode desistir da compra em até 7 dias depois de receber, trocar produto com defeito
            e muito mais. Está tudo em <A href="/trocas-e-devolucoes">Trocas e Devoluções</A>.
          </>,
        ),
      ],
    },
    {
      id: 'avaliacoes',
      title: 'Avaliações',
      clauses: [
        clause(
          'Depois de receber o pedido, você pode avaliar os produtos. A nota e o comentário aparecem no site com o seu nome.',
        ),
        clause(
          'Conte a sua experiência de verdade. Não publique ofensas, dados de outras pessoas, propaganda ou nada ilegal: avaliações assim podem ser removidas.',
        ),
        clause(
          'A avaliação continua sendo sua, mas você nos autoriza a mostrá-la no site e nos materiais da loja enquanto ela estiver publicada.',
        ),
      ],
    },
    {
      id: 'uso',
      title: 'O que não pode',
      clauses: [
        clause('Para o site continuar seguro para todo mundo, não é permitido:', [
          'usar o site para fraude ou com dados de outra pessoa sem autorização;',
          'usar robôs ou programas para copiar dados, fazer pedidos ou sobrecarregar o site;',
          'tentar entrar em áreas restritas ou burlar a segurança;',
          'atrapalhar o funcionamento do site.',
        ]),
        clause('O site tem proteções contra esse tipo de abuso, e podemos bloquear quem desrespeitar essas regras.'),
      ],
    },
    {
      id: 'conteudo',
      title: 'Nossa marca e nossas fotos',
      clauses: [
        clause(
          `A marca, o logo, as fotos, os textos e o visual do site são da ${id.name}. Você pode compartilhar o link dos produtos à vontade, mas não pode copiar esse conteúdo para uso comercial sem a nossa autorização.`,
        ),
      ],
    },
    {
      id: 'disponibilidade',
      title: 'Quando o site sai do ar',
      clauses: [
        clause(
          'Fazemos o possível para o site estar sempre no ar, mas às vezes ele pode parar para manutenção ou por falhas de internet ou de parceiros. Também podemos pausar as compras por um tempo: nesse caso, o site avisa e o seu carrinho fica salvo.',
        ),
      ],
    },
    {
      id: 'responsabilidade',
      title: 'Responsabilidades',
      clauses: [
        clause(
          'Respondemos pelos produtos e pelo nosso serviço, como manda o Código de Defesa do Consumidor (Lei nº 8.078/1990).',
        ),
        clause('Não temos culpa, porém, por:', [
          'atrasos por motivos fora do nosso controle, como greves, bloqueios de estrada e desastres naturais;',
          'endereço ou dados informados errados;',
          'falhas de serviços de terceiros, como internet e bancos;',
          'uso indevido da conta por descuido de quem é dono dela.',
        ]),
        clause('Nada nestes Termos diminui os seus direitos de consumidor.'),
      ],
    },
    {
      id: 'mensagens',
      title: 'Mensagens que enviamos',
      clauses: [
        clause(
          'Mandamos só as mensagens necessárias, como confirmação do e-mail, do pedido, do pagamento e da entrega. Promoções, só se você pedir.',
        ),
        clause(
          <>
            Como cuidamos dos seus dados está na <A href="/privacidade">Política de Privacidade</A>,
            e os cookies, na <A href="/politica-de-cookies">Política de Cookies</A>.
          </>,
        ),
      ],
    },
    {
      id: 'problemas',
      title: 'Se algo der errado',
      clauses: [
        clause(
          'Fale com a gente primeiro: queremos resolver rápido e de forma amigável.',
        ),
        clause(
          <>
            Se não resolvermos, você pode procurar o Procon do seu estado ou o site{' '}
            <A href="https://www.consumidor.gov.br">consumidor.gov.br</A>.
          </>,
        ),
        clause(
          'Valem as leis brasileiras. Se for preciso ir à Justiça, o processo corre na cidade onde você mora, como garante o Código de Defesa do Consumidor (art. 101, I).',
        ),
        clause(
          'Se alguma regra destes Termos for considerada inválida, as outras continuam valendo.',
        ),
      ],
    },
  ];

  return (
    <LegalPage
      title="Termos de Uso"
      current="/termos"
      intro={
        <>
          Estas são as regras do site e da compra na {id.name}, escritas do jeito mais simples
          possível. Vale a pena dar uma lida antes de comprar.
        </>
      }
      summary={[
        'Você pode comprar com conta ou sem cadastro, com PIX ou cartão.',
        'O preço que vale é o da hora de finalizar a compra, e o frete aparece antes de você pagar.',
        'Pedido não pago em 48 horas é cancelado sozinho.',
        <>
          Você tem 7 dias para desistir depois de receber. Veja em{' '}
          <A href="/trocas-e-devolucoes">Trocas e Devoluções</A>.
        </>,
      ]}
      sections={sections}
    />
  );
}
