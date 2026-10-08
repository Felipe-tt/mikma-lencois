export const revalidate = 86400; // 24h, conteúdo estático

import { getSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, A, B, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Política de Privacidade',
  description: 'Como a loja coleta, usa, compartilha e protege seus dados pessoais, conforme a LGPD.',
  alternates: { canonical: '/privacidade' },
};

export default async function PrivacidadePage() {
  const s = await getSettings();
  const id = storeIdentity(s);

  // Só descrevemos ferramentas que estão realmente ativas neste deploy.
  const hasGA = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const hasMeta = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const hasAnalytics = hasGA || hasMeta;

  const sections: LegalSection[] = [
    {
      id: 'controlador',
      title: 'Controlador e definições',
      clauses: [
        clause(
          <>
            <B>{id.name}</B>
            {id.cnpj && <>, inscrita no CNPJ sob o nº {id.cnpj}</>}, com sede em{' '}
            {id.address || id.cityState} (“<B>Loja</B>”), é a controladora dos dados pessoais
            tratados por meio deste Site, nos termos da Lei Geral de Proteção de Dados (LGPD, Lei
            nº 13.709/2018).
          </>,
        ),
        clause('Para os fins desta Política, consideram-se:', [
          <>
            <B>Titular:</B> a pessoa natural a quem se referem os dados pessoais;
          </>,
          <>
            <B>Dados pessoais:</B> informações relacionadas a pessoa natural identificada ou
            identificável;
          </>,
          <>
            <B>Tratamento:</B> toda operação realizada com dados pessoais, como coleta, uso,
            armazenamento, compartilhamento e eliminação.
          </>,
        ]),
      ],
    },
    {
      id: 'dados-coletados',
      title: 'Dados pessoais coletados',
      clauses: [
        clause('A Loja trata os seguintes dados fornecidos diretamente pelo Titular:', [
          <>
            <B>Conta:</B> nome, e-mail e senha. A senha é armazenada somente de forma criptografada
            e irreversível (hash), sem possibilidade de leitura pela Loja. No acesso por conta
            Google, são recebidos nome, e-mail e o identificador da conta Google, nunca a senha;
          </>,
          <>
            <B>Telefone e CPF:</B> necessários para finalizar compras (pagamento, documento fiscal
            e envio);
          </>,
          <>
            <B>Endereço de entrega:</B> CEP, rua, número, complemento, bairro, cidade e estado;
          </>,
          <>
            <B>Avaliações e mensagens:</B> o conteúdo enviado em avaliações de Produtos e em
            contatos com o atendimento.
          </>,
        ]),
        clause('São também tratados os seguintes dados gerados pelo uso do Site:', [
          <>
            <B>Pedidos:</B> itens, valores, frete, situação de pagamento e entrega, histórico e
            notificações da conta;
          </>,
          <>
            <B>Pagamento:</B> a Loja não armazena número de cartão, mantendo apenas valor,
            identificador e situação da cobrança;
          </>,
          <>
            <B>Registro de aceite:</B> data do aceite, versão destes documentos aceita e endereço IP
            de origem, coletados no cadastro;
          </>,
          <>
            <B>Dados técnicos de acesso:</B> endereço IP, data e hora, navegador e dispositivo,
            páginas acessadas e erros, utilizados para segurança, prevenção a fraudes e
            funcionamento do Site;
          </>,
          <>
            <B>Localização aproximada por IP</B> (cidade, região e provedor de internet): somente
            durante períodos de manutenção do Site, para que a equipe identifique visitantes
            aguardando e possa liberar acessos.
          </>,
        ]),
        clause(
          'A Loja não coleta dados pessoais sensíveis (como saúde, religião ou biometria) nem a localização precisa do dispositivo do Titular.',
        ),
      ],
    },
    {
      id: 'finalidades',
      title: 'Finalidades e bases legais',
      clauses: [
        clause('Os dados pessoais são tratados para as seguintes finalidades, com as respectivas bases legais do art. 7º da LGPD:', [
          'criação e manutenção da conta, autenticação e proteção do acesso (execução de contrato, inciso V);',
          'processamento de Pedidos: pagamento, separação, envio, rastreamento, trocas, devoluções e atendimento (execução de contrato, inciso V);',
          'comunicações sobre a conta e os Pedidos, como verificação de e-mail, redefinição de senha, confirmações e avisos de entrega (execução de contrato, inciso V);',
          'emissão de documento fiscal e cumprimento de obrigações fiscais, tributárias e de defesa do consumidor (obrigação legal, inciso II);',
          'segurança e prevenção a fraudes e abusos, por meio de reCAPTCHA, limitação de requisições e registros de acesso (legítimo interesse, inciso IX, e obrigação legal prevista no Marco Civil da Internet, Lei nº 12.965/2014);',
          ...(hasAnalytics
            ? [
                <>
                  medição de audiência e melhoria do Site{hasGA && <> (Google Analytics)</>}{' '}
                  (consentimento, inciso I), manifestado no aviso de cookies e revogável a qualquer
                  momento;
                </>,
              ]
            : []),
          'registro do aceite destes documentos no cadastro (consentimento, inciso I);',
          'exercício regular de direitos em processos judiciais, administrativos ou arbitrais (inciso VI).',
        ]),
        clause('A Loja não vende nem aluga dados pessoais e não os utiliza para finalidades diversas das descritas nesta Política.'),
      ],
    },
    {
      id: 'compartilhamento',
      title: 'Compartilhamento de dados',
      clauses: [
        clause(
          'A Loja compartilha apenas os dados necessários com empresas que auxiliam na operação do Site, as quais tratam os dados conforme os contratos firmados e suas próprias políticas de privacidade:',
          [
            <>
              <B>Google</B> (Firebase, Google Cloud, Google Sign-In, reCAPTCHA
              {hasGA && <> e Google Analytics</>}): hospedagem do Site e do banco de dados,
              autenticação, proteção contra robôs{hasGA && <> e medição de audiência</>}. Dados:
              conta, Pedidos e dados técnicos de acesso;
            </>,
            <>
              <B>AbacatePay:</B> cobrança por PIX e cartão. Dados: nome, e-mail, telefone, CPF e
              valor do Pedido;
            </>,
            <>
              <B>Melhor Envio e transportadoras:</B> envios para fora da região de entrega local.
              Dados: nome, telefone, e-mail, CPF, endereço e características da encomenda (peso,
              dimensões e valor);
            </>,
            <>
              <B>Uber Direct:</B> entregas locais. Dados: nome, telefone, endereço e descrição dos
              itens;
            </>,
            <>
              <B>Resend:</B> envio de e-mails. Dados: nome, e-mail e conteúdo da mensagem;
            </>,
            <>
              <B>Sentry:</B> monitoramento de erros e desempenho, configurado para não enviar dados
              pessoais identificáveis por padrão;
            </>,
            <>
              <B>Upstash:</B> limitação de requisições, como medida de segurança. Dados:
              identificadores técnicos, como o endereço IP;
            </>,
            <>
              <B>ViaCEP e OpenStreetMap (Nominatim):</B> preenchimento de endereço pelo CEP, cálculo
              de entrega e mapa de acompanhamento. Dados: CEP, endereço e, nas consultas feitas
              pelo navegador, o endereço IP;
            </>,
            <>
              <B>Serviços de geolocalização por IP:</B> utilizados apenas durante manutenções do
              Site. Dado: endereço IP{hasMeta ? ';' : '.'}
            </>,
            ...(hasMeta
              ? [
                  <>
                    <B>Meta Platforms</B> (Pixel): medição de eventos de navegação e compra no Site.
                  </>,
                ]
              : []),
          ],
        ),
        clause(
          'Os dados poderão ainda ser compartilhados com autoridades públicas, quando exigido por lei ou ordem judicial, e com prestadores de serviços contábeis e jurídicos, sob dever de sigilo, quando necessário.',
        ),
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies',
      clauses: [
        clause(
          <>
            O Site utiliza cookies e tecnologias semelhantes. As categorias, finalidades, prazos e
            as formas de gerenciar suas preferências estão descritos na{' '}
            <A href="/politica-de-cookies">Política de Cookies</A>.
          </>,
        ),
      ],
    },
    {
      id: 'transferencia-internacional',
      title: 'Transferência internacional de dados',
      clauses: [
        clause(
          'Alguns fornecedores da Loja, incluindo a infraestrutura em nuvem do Google, tratam dados fora do Brasil, inclusive nos Estados Unidos. Essas transferências ocorrem com fundamento no art. 33 da LGPD, observadas as garantias contratuais e de segurança oferecidas pelos respectivos provedores.',
        ),
      ],
    },
    {
      id: 'retencao',
      title: 'Prazo de armazenamento',
      clauses: [
        clause('Os dados pessoais são armazenados pelos seguintes períodos:', [
          <>
            <B>conta e perfil:</B> enquanto a conta estiver ativa. Com a exclusão da conta, são
            removidos o perfil, o carrinho e as notificações, e o acesso é encerrado;
          </>,
          <>
            <B>Pedidos, pagamentos e documentos fiscais:</B> mantidos mesmo após a exclusão da
            conta, pelo prazo exigido pela legislação fiscal, tributária e de defesa do consumidor
            (em regra, 5 anos) e para defesa em eventuais disputas (art. 16, I, e art. 7º, VI, da
            LGPD);
          </>,
          <>
            <B>registros de acesso:</B> pelo prazo previsto na legislação aplicável, em especial o
            Marco Civil da Internet.
          </>,
        ]),
        clause(
          'Encerrados esses prazos, os dados serão eliminados ou anonimizados, salvo se a lei autorizar ou exigir sua conservação.',
        ),
      ],
    },
    {
      id: 'direitos',
      title: 'Direitos do Titular',
      clauses: [
        clause('Nos termos do art. 18 da LGPD, o Titular pode, a qualquer momento, solicitar:', [
          'a confirmação da existência de tratamento e o acesso aos dados;',
          'a correção de dados incompletos, inexatos ou desatualizados;',
          'a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;',
          'a portabilidade dos dados;',
          'a eliminação dos dados tratados com base no consentimento;',
          'informações sobre as entidades com as quais os dados são compartilhados;',
          'informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da recusa, bem como a revogação do consentimento;',
          'a oposição a tratamentos realizados com base em legítimo interesse.',
        ]),
        clause(
          <>
            Na área <B>Perfil</B>, o Titular pode atualizar seu nome, obter uma cópia de seus dados
            em arquivo JSON (<B>Exportar meus dados</B>) e <B>Excluir conta</B>. Telefone, CPF e
            endereço podem ser revisados na finalização de um Pedido. As demais solicitações podem
            ser feitas pelos canais indicados na seção “Contato”.
          </>,
        ),
        clause(
          'As solicitações serão respondidas de imediato, em formato simplificado, ou, quando necessário, por declaração completa em até 15 dias (art. 19 da LGPD).',
        ),
        clause(
          <>
            A exclusão da conta é definitiva: Pedidos aguardando pagamento são cancelados, e o
            perfil, o carrinho, as notificações e o acesso são removidos. Os dados de Pedidos
            concluídos permanecem conforme a seção <A href="#retencao">Prazo de armazenamento</A>.
          </>,
        ),
        clause(
          <>
            Caso entenda que seus direitos não foram atendidos, o Titular pode apresentar
            reclamação à Autoridade Nacional de Proteção de Dados (ANPD), em{' '}
            <A href="https://www.gov.br/anpd">gov.br/anpd</A>.
          </>,
        ),
      ],
    },
    {
      id: 'seguranca',
      title: 'Segurança da informação',
      clauses: [
        clause('A Loja adota medidas técnicas e administrativas para proteger os dados pessoais, entre elas:', [
          'comunicação protegida por criptografia (HTTPS/TLS) em todo o Site;',
          'armazenamento de senhas somente como hash (Argon2);',
          'autenticação gerenciada pelo Firebase Authentication, com proteção contra robôs (reCAPTCHA) e limitação de tentativas nos formulários sensíveis;',
          'regras de acesso ao banco de dados, de modo que cada Cliente acesse apenas os próprios dados, e restrição das áreas administrativas a perfis autorizados;',
          'infraestrutura em nuvem do Google, com criptografia dos dados em repouso, e compartilhamento com terceiros limitado ao necessário.',
        ]),
        clause(
          'Nenhum sistema é totalmente imune a falhas. Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos Titulares, a Loja comunicará os afetados e a ANPD, conforme o art. 48 da LGPD.',
        ),
      ],
    },
    {
      id: 'menores',
      title: 'Crianças e adolescentes',
      clauses: [
        clause(
          'O Site é destinado a maiores de 18 anos, e a Loja não coleta intencionalmente dados de crianças e adolescentes. Identificado cadastro nessa condição, os dados serão excluídos. O responsável legal que entender que isso ocorreu pode entrar em contato pelos canais indicados nesta Política.',
        ),
      ],
    },
    {
      id: 'terceiros',
      title: 'Links e serviços de terceiros',
      clauses: [
        clause(
          'O Site poderá direcionar o Usuário a ambientes de terceiros, como Instagram, WhatsApp e a página de pagamento da AbacatePay, que possuem regras próprias de privacidade, pelas quais a Loja não responde. Recomenda-se a leitura dessas regras antes do fornecimento de dados.',
        ),
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações desta Política',
      clauses: [
        clause(
          'A Loja poderá atualizar esta Política para refletir mudanças no Site, em seus fornecedores ou na legislação. A versão vigente é a publicada nesta página, com o ano da última atualização indicado no topo. Alterações relevantes serão destacadas no Site ou comunicadas por e-mail.',
        ),
      ],
    },
    {
      id: 'contato',
      title: 'Contato',
      clauses: [
        contactClause(
          id,
          `Para exercer direitos, esclarecer dúvidas ou comunicar problemas de privacidade, o Titular pode contatar ${id.name} pelos seguintes canais:`,
        ),
      ],
    },
  ];

  return (
    <LegalPage
      title="Política de Privacidade"
      current="/privacidade"
      intro={
        <>
          Esta Política de Privacidade descreve como {id.name} coleta, utiliza, compartilha e
          protege os dados pessoais tratados neste Site, em conformidade com a LGPD, o Marco Civil
          da Internet e o Código de Defesa do Consumidor. Ela complementa os{' '}
          <A href="/termos">Termos e Condições de Uso</A>.
        </>
      }
      sections={sections}
    />
  );
}
