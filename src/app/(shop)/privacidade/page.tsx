
import { shareMeta } from '@/lib/seo';
import { getStoreSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, A, B, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Política de Privacidade',
  description: 'Quais dados pedimos, para que usamos, com quem compartilhamos e como você controla tudo, conforme a LGPD.',
  ...shareMeta({ title: 'Política de Privacidade', description: 'Quais dados pedimos, para que usamos, com quem compartilhamos e como você controla tudo, conforme a LGPD.', path: '/privacidade' }),
  alternates: { canonical: '/privacidade' },
};

/*
 * Texto em linguagem simples, com tudo o que o art. 9º da LGPD pede: quem
 * trata os dados, para quê, por quanto tempo, com quem compartilha (por tipo
 * de empresa, não por marca: a lista de empresas é dada a quem pedir, como
 * garante o art. 18, VII), os direitos e o contato. Os prazos batem com a
 * rotina de retenção (lib/retention.ts).
 */
export default async function PrivacidadePage() {
  const s = await getStoreSettings();
  const id = storeIdentity(s);

  // Só fala de medição de audiência se ela estiver ligada neste site.
  const hasAnalytics = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID);

  const sections: LegalSection[] = [
    {
      id: 'quem-somos',
      title: 'Quem cuida dos seus dados',
      clauses: [
        clause(
          <>
            Quem decide como os seus dados são usados neste site é a <B>{id.name}</B>
            {id.cnpj && <> (CNPJ {id.cnpj})</>}, de {id.address || id.cityState}. Na Lei Geral de
            Proteção de Dados (LGPD, Lei nº 13.709/2018), isso nos torna a “controladora” dos dados.
          </>,
        ),
        clause(
          <>
            Qualquer dúvida ou pedido sobre os seus dados é com a gente mesmo, pelos contatos no fim
            desta página.
          </>,
        ),
      ],
    },
    {
      id: 'dados',
      title: 'Quais dados pedimos',
      clauses: [
        clause('Pedimos só o necessário para você comprar e receber em casa:', [
          <>
            <B>Para a conta:</B> nome, e-mail e senha. A senha fica guardada de forma embaralhada
            (criptografada) e nem nós conseguimos vê-la. Se entrar com o Google, recebemos só o seu
            nome e e-mail.
          </>,
          <>
            <B>Para a compra:</B> CPF e telefone, usados no pagamento, na nota fiscal e na entrega.
            Eles ficam guardados de forma criptografada.
          </>,
          <>
            <B>Para a entrega:</B> o seu endereço.
          </>,
          <>
            <B>O que você nos manda:</B> avaliações de produtos e mensagens para o atendimento.
          </>,
        ]),
        clause('E alguns dados surgem do uso do site:', [
          <>
            <B>Seus pedidos:</B> o que você comprou, valores, frete e andamento do pagamento e da
            entrega.
          </>,
          <>
            <B>Pagamento:</B> guardamos só o valor e a situação da cobrança. O número do cartão
            nunca fica com a gente.
          </>,
          <>
            <B>Dados de acesso:</B> endereço IP, data e hora, navegador e páginas visitadas. Servem
            para manter o site seguro e evitar fraudes.
          </>,
          <>
            <B>Seu aceite:</B> quando você concorda com estas políticas, registramos a data e a
            versão do texto.
          </>,
        ]),
        clause(
          'Não pedimos dados sensíveis (como saúde, religião ou biometria) e não usamos a localização do seu celular.',
        ),
      ],
    },
    {
      id: 'para-que',
      title: 'Para que usamos',
      clauses: [
        clause('Usamos os seus dados para:', [
          'criar e proteger a sua conta;',
          'processar o seu pedido: pagamento, separação, envio, trocas e atendimento;',
          'avisar sobre a sua compra, como confirmação do pagamento e saída para entrega;',
          'emitir a nota fiscal e cumprir as leis fiscais e do consumidor;',
          'proteger o site e você contra fraudes, robôs e acessos indevidos;',
          ...(hasAnalytics ? ['entender como o site é usado, para melhorá-lo, só se você aceitar os cookies de medição;'] : []),
          'nos defender, se um dia for preciso, em processos judiciais ou administrativos.',
        ]),
        clause(
          <>
            Cada uso tem uma justificativa prevista na LGPD (art. 7º): a maioria é para cumprir a
            compra que você fez com a gente, uma parte é para cumprir a lei (como a nota fiscal), e a
            proteção contra fraudes é um interesse legítimo nosso e seu.
            {hasAnalytics && ' A medição de audiência só acontece com o seu consentimento.'}
          </>,
        ),
        clause(
          <>
            <B>Não vendemos e não alugamos os seus dados.</B> E não mandamos promoções sem você
            pedir.
          </>,
        ),
      ],
    },
    {
      id: 'compartilhamento',
      title: 'Com quem compartilhamos',
      clauses: [
        clause(
          'Para o site funcionar, contamos com empresas parceiras. Cada uma recebe só o que precisa para fazer a sua parte e é obrigada a proteger esses dados:',
          [
            <>
              <B>Pagamento:</B> a empresa que processa o PIX e o cartão recebe nome, e-mail,
              telefone, CPF e o valor da compra.
            </>,
            <>
              <B>Entrega:</B> transportadoras e entregadores recebem nome, telefone, endereço e os
              dados do pacote.
            </>,
            <>
              <B>Hospedagem e segurança:</B> as empresas que mantêm o site no ar, guardam os dados e
              barram robôs e ataques.
            </>,
            <>
              <B>E-mail:</B> o serviço que envia as mensagens sobre a sua conta e os seus pedidos.
            </>,
            <>
              <B>Endereço e frete:</B> serviços que completam o endereço pelo CEP e calculam o
              frete.
            </>,
            ...(hasAnalytics
              ? [
                  <>
                    <B>Medição de audiência:</B> se você aceitar os cookies de medição, ferramentas
                    que mostram como o site é usado.
                  </>,
                ]
              : []),
          ],
        ),
        clause(
          'Também podemos compartilhar dados com autoridades, quando a lei ou um juiz exigir, e com o nosso contador ou advogado, sob sigilo, quando necessário.',
        ),
        clause(
          'Quer saber exatamente quais são essas empresas? É só pedir pelos nossos contatos: a lei garante esse direito e mandamos a lista.',
        ),
      ],
    },
    {
      id: 'fora-do-brasil',
      title: 'Dados fora do Brasil',
      clauses: [
        clause(
          'Alguns dos nossos parceiros, como os serviços de nuvem, guardam dados em servidores fora do Brasil, por exemplo nos Estados Unidos. Isso é permitido pela LGPD (art. 33), desde que eles ofereçam proteção adequada, o que exigimos.',
        ),
      ],
    },
    {
      id: 'quanto-tempo',
      title: 'Por quanto tempo guardamos',
      clauses: [
        clause('Guardamos cada dado só pelo tempo necessário:', [
          <>
            <B>Conta:</B> enquanto ela existir. Se você excluir a conta, apagamos o seu perfil, o
            carrinho e as notificações.
          </>,
          <>
            <B>Pedidos e notas fiscais:</B> por 5 anos, porque a lei fiscal e a do consumidor
            exigem. Depois disso, os dados pessoais dos pedidos são apagados.
          </>,
          <>
            <B>Endereço IP dos pedidos:</B> por 1 ano.
          </>,
          <>
            <B>Compra sem cadastro:</B> se você não fizer nenhum pedido, os dados são apagados em
            90 dias.
          </>,
          <>
            <B>Pedidos de “Avise-me quando chegar”:</B> por até 1 ano.
          </>,
        ]),
      ],
    },
    {
      id: 'seus-direitos',
      title: 'Seus direitos',
      clauses: [
        clause('Os dados são seus. A qualquer momento você pode:', [
          'saber se temos dados seus e ver quais são;',
          'corrigir o que estiver errado ou desatualizado;',
          'pedir uma cópia dos seus dados;',
          'pedir que apaguemos dados desnecessários;',
          'saber com quais empresas compartilhamos;',
          'retirar um consentimento que tenha dado;',
          'discordar de um uso que se baseie no nosso interesse legítimo.',
        ]),
        clause(
          <>
            Muita coisa você mesmo faz na página <B>Perfil</B>: mudar os seus dados, baixar uma
            cópia de tudo (<B>Exportar meus dados</B>) e <B>Excluir conta</B>. Para o resto, fale com
            a gente: respondemos na hora ou em até 15 dias.
          </>,
        ),
        clause(
          'Ao excluir a conta, os pedidos que ainda não foram pagos são cancelados. Os pedidos já feitos ficam guardados pelo prazo da lei, como explicado acima.',
        ),
        clause(
          <>
            Se achar que não respeitamos os seus direitos, você também pode reclamar na Autoridade
            Nacional de Proteção de Dados (ANPD), em <A href="https://www.gov.br/anpd">gov.br/anpd</A>.
          </>,
        ),
      ],
    },
    {
      id: 'seguranca',
      title: 'Como protegemos',
      clauses: [
        clause('Levamos a segurança a sério:', [
          'todo o site usa conexão protegida (o cadeado do navegador);',
          'senha, CPF e telefone ficam criptografados;',
          'cada cliente só tem acesso aos próprios dados, e só a nossa equipe acessa o painel da loja, com verificação em duas etapas;',
          'o site tem proteção contra robôs, ataques e tentativas repetidas de login;',
          'os dados do cartão vão direto para a empresa de pagamento e não passam por nós.',
        ]),
        clause(
          'Nenhum sistema é 100% imune. Se acontecer algum incidente que possa trazer risco para você, avisamos você e a ANPD, como manda a lei.',
        ),
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies',
      clauses: [
        clause(
          <>
            O site usa cookies, pequenos arquivos que ajudam a manter você conectado e o carrinho
            salvo. Explicamos tudo na <A href="/politica-de-cookies">Política de Cookies</A>.
          </>,
        ),
      ],
    },
    {
      id: 'menores',
      title: 'Crianças e adolescentes',
      clauses: [
        clause(
          'As compras no site são para maiores de 18 anos, e não coletamos de propósito dados de menores. Se descobrirmos um cadastro assim, apagamos. Se você é responsável por um menor e acha que isso aconteceu, fale com a gente.',
        ),
      ],
    },
    {
      id: 'outros-sites',
      title: 'Links para outros sites',
      clauses: [
        clause(
          'Alguns botões levam para fora do site, como o WhatsApp e o Instagram. Lá valem as regras de privacidade de cada um.',
        ),
      ],
    },
    {
      id: 'mudancas',
      title: 'Mudanças nesta política',
      clauses: [
        clause(
          'Se mudarmos algo importante, avisamos no site ou por e-mail. A data da última atualização fica no topo desta página.',
        ),
      ],
    },
    {
      id: 'contato',
      title: 'Fale com a gente',
      clauses: [contactClause(id, 'Para qualquer dúvida ou pedido sobre os seus dados:')],
    },
  ];

  return (
    <LegalPage
      title="Política de Privacidade"
      current="/privacidade"
      intro={
        <>
          Aqui explicamos, sem juridiquês, quais dados pedimos, para que usamos e como você controla
          tudo. Esta política segue a LGPD e faz parte dos nossos{' '}
          <A href="/termos">Termos de Uso</A>.
        </>
      }
      summary={[
        'Pedimos só o necessário para você comprar e receber em casa.',
        'Não vendemos os seus dados e não mandamos promoções sem você pedir.',
        'O número do seu cartão nunca fica com a gente.',
        <>
          Você pode ver, baixar ou apagar os seus dados quando quiser, na página <B>Perfil</B>.
        </>,
      ]}
      sections={sections}
    />
  );
}
