export const revalidate = 86400; // 24h, conteúdo estático

import { getSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, A, B, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Termos e Condições de Uso',
  description: 'Condições de uso do site e de compra: cadastro, pagamento, entrega e responsabilidades.',
  alternates: { canonical: '/termos' },
};

export default async function TermosPage() {
  const s = await getSettings();
  const id = storeIdentity(s);

  const sections: LegalSection[] = [
    {
      id: 'definicoes',
      title: 'Identificação e definições',
      clauses: [
        clause(
          <>
            O Site é operado por <B>{id.name}</B>
            {id.cnpj && <>, inscrita no CNPJ sob o nº {id.cnpj}</>}, com sede em{' '}
            {id.address || id.cityState} (“<B>Loja</B>”).
          </>,
        ),
        clause('Para os fins destes Termos, consideram-se:', [
          <>
            <B>Site:</B> o endereço eletrônico da Loja e seus ambientes digitais;
          </>,
          <>
            <B>Usuário:</B> toda pessoa que acessa ou navega pelo Site;
          </>,
          <>
            <B>Cliente:</B> o Usuário que cria uma conta ou realiza um Pedido;
          </>,
          <>
            <B>Produtos:</B> os itens oferecidos para venda no Site;
          </>,
          <>
            <B>Pedido:</B> a solicitação de compra de Produtos efetuada pelo Cliente no Site.
          </>,
        ]),
        contactClause(id, 'A Loja pode ser contatada pelos seguintes canais de atendimento:'),
      ],
    },
    {
      id: 'aceitacao',
      title: 'Aceitação e alteração dos Termos',
      clauses: [
        clause(
          <>
            Ao acessar o Site, criar uma conta ou finalizar um Pedido, o Usuário declara ter lido,
            compreendido e aceito estes Termos, a <A href="/privacidade">Política de Privacidade</A>,
            a <A href="/politica-de-cookies">Política de Cookies</A> e a{' '}
            <A href="/trocas-e-devolucoes">Política de Trocas e Devoluções</A>, que integram este
            documento.
          </>,
        ),
        clause(
          'A Loja poderá alterar estes Termos a qualquer tempo, para refletir mudanças em suas operações ou na legislação. A versão vigente é a publicada nesta página, com o ano da última atualização indicado no topo.',
        ),
        clause(
          'Alterações relevantes serão destacadas no Site ou comunicadas por e-mail. Pedidos já confirmados permanecem regidos pela versão vigente na data da compra.',
        ),
        clause('Caso não concorde com estes Termos, o Usuário deverá abster-se de utilizar o Site.'),
      ],
    },
    {
      id: 'cadastro',
      title: 'Cadastro e conta',
      clauses: [
        clause(
          'A realização de compras exige cadastro, com e-mail e senha ou por meio de conta Google. O cadastro é permitido a maiores de 18 anos ou emancipados. Menores de idade somente poderão utilizar o Site por meio de, ou assistidos por, seus responsáveis legais.',
        ),
        clause(
          'O Cliente declara que os dados informados (nome, e-mail, telefone, CPF e endereço) são verdadeiros, completos e atualizados, responsabilizando-se por eventuais inconsistências, que podem impedir o pagamento, a emissão do documento fiscal ou a entrega.',
        ),
        clause(
          'O Cliente é responsável pelo sigilo de sua senha e por toda atividade realizada em sua conta, devendo comunicar imediatamente à Loja qualquer suspeita de uso não autorizado.',
        ),
        clause(
          'A Loja poderá exigir a verificação do e-mail e suspender ou encerrar contas com indícios de fraude, uso indevido ou violação destes Termos. Pedidos já pagos serão entregues ou reembolsados.',
        ),
        clause(
          <>
            O Cliente poderá excluir sua conta a qualquer momento na área <B>Perfil</B>, observados
            os efeitos descritos na <A href="/privacidade">Política de Privacidade</A>.
          </>,
        ),
      ],
    },
    {
      id: 'produtos',
      title: 'Produtos e informações do Site',
      clauses: [
        clause(
          'A Loja empenha-se para que fotos, cores, medidas e descrições correspondam aos Produtos. Pequenas variações de tonalidade podem decorrer da tela e da iluminação, e os tecidos admitem tolerância de fabricação nas medidas. Recomenda-se consultar o guia de tamanhos antes da compra.',
        ),
        clause(
          'A disponibilidade dos Produtos depende do estoque. Ao finalizar o Pedido, as unidades ficam reservadas ao Cliente até a confirmação do pagamento ou o cancelamento do Pedido.',
        ),
        clause(
          'Em caso de erro manifesto de preço, descrição ou estoque (por exemplo, valor claramente incompatível com o Produto), a Loja entrará em contato antes de processar o Pedido, para que o Cliente opte entre mantê-lo com as informações corretas ou cancelá-lo, com reembolso integral.',
        ),
      ],
    },
    {
      id: 'pagamento',
      title: 'Preços e pagamento',
      clauses: [
        clause(
          'Todos os valores são expressos em reais (BRL) e incluem os tributos aplicáveis. O frete é calculado a partir do CEP de entrega, do peso e das dimensões dos Produtos, e é informado separadamente antes da confirmação do Pedido.',
        ),
        clause(
          'O preço válido é o exibido no momento da finalização do Pedido. A Loja poderá alterar preços a qualquer tempo, sem que isso afete Pedidos já confirmados. Descontos, frete grátis e demais condições promocionais seguem as regras divulgadas no Site no momento da compra.',
        ),
        clause(
          <>
            São aceitos <B>PIX</B> e, quando disponível, <B>cartão de crédito</B>, processados pela
            AbacatePay. Os dados do cartão são inseridos no ambiente seguro da AbacatePay e não
            transitam pelos servidores da Loja.
          </>,
        ),
        clause(
          <>
            No PIX, o QR Code e o código copia e cola têm validade de 15 minutos. Expirado o prazo,
            um novo código pode ser gerado em <B>Meus pedidos</B> enquanto o Pedido aguardar
            pagamento.
          </>,
        ),
        clause(
          'O Pedido é confirmado somente após a compensação do pagamento, que no PIX ocorre de forma automática e, em regra, instantânea. Pedidos não pagos em até 48 horas são cancelados automaticamente, e o estoque reservado é liberado. A Loja poderá avisar o Cliente por e-mail antes do cancelamento.',
        ),
        clause(
          'A Loja poderá cancelar Pedidos com indícios de fraude ou inconsistência nos dados de pagamento, com reembolso integral dos valores já pagos.',
        ),
        clause(
          'O documento fiscal é emitido conforme a legislação aplicável, com os dados informados no Pedido.',
        ),
      ],
    },
    {
      id: 'entrega',
      title: 'Entrega',
      clauses: [
        clause(
          'O prazo de entrega começa a contar após a confirmação do pagamento. Pedidos confirmados após o horário limite de despacho divulgado no Site seguem no próximo dia útil.',
        ),
        clause(
          <>
            <B>Entrega local</B> ({id.cityState} e região dentro do raio de atendimento informado no
            Site): realizada por entregador parceiro, com estimativa de até 1 hora a partir do
            despacho, sujeita à disponibilidade de entregadores, ao trânsito e às condições
            climáticas. Quando disponível, o trajeto pode ser acompanhado em tempo real na página
            do Pedido.
          </>,
        ),
        clause(
          <>
            <B>Demais regiões:</B> o envio é feito por transportadoras contratadas por meio do
            Melhor Envio. O prazo, em dias úteis a partir da postagem, é informado no cálculo do
            frete, e o código de rastreamento fica disponível na página do Pedido.
          </>,
        ),
        clause(
          'É responsabilidade do Cliente informar endereço correto e completo e garantir que haja alguém para receber o Pedido. Em caso de endereço incorreto, destinatário ausente após as tentativas de entrega ou recusa sem justificativa, a mercadoria poderá retornar ao estoque da Loja, e um novo envio poderá ensejar nova cobrança de frete.',
        ),
        clause(
          <>
            O Cliente deve conferir a embalagem e o Produto no recebimento. Havendo avaria, deverá
            recusar a entrega ou comunicar a Loja o quanto antes, com fotos, conforme a{' '}
            <A href="/trocas-e-devolucoes">Política de Trocas e Devoluções</A>.
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
            O direito de arrependimento, as condições de troca e devolução e a garantia legal dos
            Produtos estão descritos na{' '}
            <A href="/trocas-e-devolucoes">Política de Trocas e Devoluções</A>, que integra estes
            Termos.
          </>,
        ),
      ],
    },
    {
      id: 'avaliacoes',
      title: 'Avaliações e conteúdo do Usuário',
      clauses: [
        clause(
          'Somente Clientes com Pedido já entregue podem avaliar os Produtos daquele Pedido. A avaliação (nota e comentário de até 1.000 caracteres) poderá ser exibida publicamente no Site, junto ao nome do Cliente.',
        ),
        clause(
          'O Cliente é responsável pelo conteúdo que publica, que deve ser verdadeiro, baseado em sua experiência e livre de ofensas, discriminação, dados pessoais de terceiros, spam ou qualquer conteúdo ilícito.',
        ),
        clause(
          'O Cliente mantém a autoria da avaliação, mas concede à Loja licença gratuita e não exclusiva para exibi-la no Site e em materiais da Loja enquanto estiver publicada. A Loja poderá remover avaliações que violem estes Termos.',
        ),
      ],
    },
    {
      id: 'uso-adequado',
      title: 'Uso adequado do Site',
      clauses: [
        clause('É vedado ao Usuário:', [
          'utilizar o Site para fraude ou utilizar dados de terceiros sem autorização;',
          'empregar robôs, scrapers ou qualquer automação para coletar dados, realizar Pedidos ou sobrecarregar o Site;',
          'tentar acessar áreas restritas, testar ou explorar vulnerabilidades ou contornar medidas de segurança;',
          'interferir no funcionamento do Site ou dos serviços de terceiros por ele utilizados;',
          'publicar conteúdo ilícito ou ofensivo.',
        ]),
        clause(
          'Para proteger a Loja e os Clientes, o Site utiliza mecanismos como reCAPTCHA e limitação de requisições. A Loja poderá bloquear acessos que violem estas regras, sem prejuízo das medidas legais cabíveis.',
        ),
      ],
    },
    {
      id: 'propriedade-intelectual',
      title: 'Propriedade intelectual',
      clauses: [
        clause(
          `A marca, o logotipo, o nome, os textos, as fotografias, o layout e os demais conteúdos do Site pertencem a ${id.name} ou a seus licenciantes e são protegidos pela legislação de propriedade intelectual. É vedada a cópia, reprodução, modificação ou distribuição desse conteúdo sem autorização prévia e por escrito, exceto para uso pessoal e não comercial.`,
        ),
      ],
    },
    {
      id: 'disponibilidade',
      title: 'Disponibilidade do Site',
      clauses: [
        clause(
          'A Loja trabalha para manter o Site disponível, mas ele poderá ficar temporariamente indisponível por manutenção, atualização ou falhas fora de seu controle, como instabilidades de provedores de internet, de nuvem ou de meios de pagamento. Durante manutenções, o Site poderá exibir uma página de aviso, com o acesso liberado assim que a atividade for concluída.',
        ),
      ],
    },
    {
      id: 'responsabilidade',
      title: 'Responsabilidade',
      clauses: [
        clause(
          'A Loja responde pelos vícios e defeitos dos Produtos e pela falha na prestação do serviço, nos termos do Código de Defesa do Consumidor (Lei nº 8.078/1990).',
        ),
        clause('A Loja não se responsabiliza por:', [
          'atrasos ou falhas decorrentes de caso fortuito ou força maior, como greves, bloqueios de vias e desastres naturais, que afetem transportadoras e entregadores;',
          'endereço ou dados incorretos informados pelo Cliente;',
          'indisponibilidade de serviços de terceiros, como internet, bancos, meios de pagamento e plataformas;',
          'uso indevido do Site ou da conta por culpa do Usuário.',
        ]),
        clause('Nenhuma disposição destes Termos limita os direitos assegurados ao consumidor por lei.'),
      ],
    },
    {
      id: 'comunicacoes',
      title: 'Comunicações, privacidade e cookies',
      clauses: [
        clause(
          'A Loja enviará as mensagens necessárias à prestação do serviço, como verificação de e-mail, redefinição de senha, confirmação de Pedido e avisos de pagamento e entrega. Comunicações promocionais somente serão enviadas mediante autorização do Cliente.',
        ),
        clause(
          <>
            O tratamento de dados pessoais é descrito na{' '}
            <A href="/privacidade">Política de Privacidade</A>, e o uso de cookies, na{' '}
            <A href="/politica-de-cookies">Política de Cookies</A>.
          </>,
        ),
      ],
    },
    {
      id: 'atendimento',
      title: 'Atendimento e solução de conflitos',
      clauses: [
        clause(
          'A Loja buscará responder o quanto antes e resolver qualquer questão de forma amigável pelos canais de atendimento indicados nestes Termos.',
        ),
        clause(
          <>
            Não havendo solução, o Cliente poderá recorrer ao Procon de seu estado ou à plataforma{' '}
            <A href="https://www.consumidor.gov.br">consumidor.gov.br</A>.
          </>,
        ),
      ],
    },
    {
      id: 'disposicoes-gerais',
      title: 'Disposições gerais e foro',
      clauses: [
        clause(
          'Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do consumidor para dirimir eventuais controvérsias (art. 101, I, do Código de Defesa do Consumidor).',
        ),
        clause(
          'Se qualquer disposição destes Termos for considerada inválida, as demais permanecerão em vigor. A tolerância quanto ao descumprimento de qualquer regra não implica renúncia a direitos.',
        ),
      ],
    },
  ];

  return (
    <LegalPage
      title="Termos e Condições de Uso"
      current="/termos"
      intro={
        <>
          Estes Termos e Condições de Uso (“Termos”) regulam o acesso ao Site de {id.name} e a
          compra de Produtos em sua loja online. Leia-os com atenção antes de utilizar o Site ou
          realizar um Pedido.
        </>
      }
      sections={sections}
    />
  );
}
