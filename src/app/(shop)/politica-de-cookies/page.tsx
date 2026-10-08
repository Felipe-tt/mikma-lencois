export const revalidate = 86400; // 24h, conteúdo estático

import type { ReactNode } from 'react';
import { getSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { CookiePreferencesButton } from '@/components/layout/CookiePreferencesButton';
import { LegalPage, A, B, Table, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Política de Cookies',
  description: 'Quais cookies o site utiliza, para que servem, por quanto tempo e como gerenciá-los.',
  alternates: { canonical: '/politica-de-cookies' },
};

export default async function PoliticaDeCookiesPage() {
  const s = await getSettings();
  const id = storeIdentity(s);

  // Só listamos ferramentas que estão realmente ativas neste deploy.
  const hasGA = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const hasMeta = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const hasAnalytics = hasGA || hasMeta;

  const rows: ReactNode[][] = [
    ['Sessão do Firebase Authentication (armazenamento local do navegador)', 'Manter o Cliente conectado à conta.', 'Necessário', 'Até o encerramento da sessão ou a limpeza dos dados do navegador'],
    ['mikma-cookie-consent (armazenamento local)', 'Registrar a escolha do Usuário sobre cookies.', 'Necessário', '12 meses'],
    ['reCAPTCHA (Google)', 'Proteger os formulários de login, cadastro e recuperação de senha contra robôs e abusos.', 'Necessário', 'Definido pelo Google'],
    ['mikma-theme (armazenamento local)', 'Lembrar a preferência de tema claro ou escuro.', 'Funcional', 'Até a limpeza dos dados do navegador'],
    ...(hasGA
      ? [['_ga e _ga_ seguido do identificador da propriedade (Google Analytics 4)', 'Distinguir visitantes e sessões e medir a audiência do Site.', 'Medição de audiência', 'Até 2 anos']]
      : []),
    ...(hasMeta
      ? [['_fbp (Meta Pixel)', 'Medir eventos de navegação e compra no Site.', 'Medição de audiência', 'Até 90 dias']]
      : []),
  ];

  const sections: LegalSection[] = [
    {
      id: 'o-que-sao',
      title: 'O que são cookies',
      clauses: [
        clause(
          'Cookies são pequenos arquivos de texto gravados no navegador do Usuário quando ele acessa um site. O Site também utiliza o armazenamento local do navegador (como localStorage e IndexedDB), que cumpre funções semelhantes, e ambos são tratados nesta Política como “cookies”.',
        ),
        clause(
          'Cookies podem ser próprios (definidos pelo Site) ou de terceiros (definidos por outras empresas, como o Google), e podem ser de sessão (apagados ao fechar o navegador) ou persistentes (mantidos por um período).',
        ),
      ],
    },
    {
      id: 'categorias',
      title: 'Categorias e finalidades',
      clauses: [
        clause('O Site utiliza as seguintes categorias:', [
          <>
            <B>Necessários:</B> indispensáveis ao funcionamento e à segurança do Site, como manter o
            login e proteger os formulários. Não dependem de consentimento e não podem ser
            desativados pelo Site;
          </>,
          <>
            <B>Funcionais:</B> lembram escolhas do Usuário, como o tema do Site;
          </>,
          ...(hasAnalytics
            ? [
                <>
                  <B>Medição de audiência:</B> permitem entender como o Site é utilizado, para
                  melhorá-lo. Somente são ativados mediante consentimento do Usuário.
                </>,
              ]
            : []),
        ]),
        clause(
          hasAnalytics
            ? 'A tabela abaixo relaciona os cookies utilizados atualmente:'
            : 'A tabela abaixo relaciona os cookies utilizados atualmente. No momento, o Site não utiliza cookies de medição de audiência nem de publicidade.',
        ),
      ],
      after: (
        <Table head={['Cookie', 'Finalidade', 'Categoria', 'Duração']} rows={rows} />
      ),
    },
    {
      id: 'terceiros',
      title: 'Cookies de terceiros',
      clauses: [
        clause(
          <>
            Alguns cookies são definidos por terceiros que prestam serviços ao Site, como o Google
            (reCAPTCHA{hasGA && <> e Google Analytics</>}){hasMeta && <> e a Meta (Pixel)</>}. Esses
            terceiros tratam os dados conforme suas próprias políticas de privacidade. Mais
            informações sobre o compartilhamento de dados estão na{' '}
            <A href="/privacidade">Política de Privacidade</A>.
          </>,
        ),
      ],
    },
    {
      id: 'gerenciar',
      title: 'Como gerenciar suas preferências',
      clauses: [
        ...(hasAnalytics
          ? [
              clause(
                'Na primeira visita, o Site exibe um aviso para que o Usuário aceite ou recuse os cookies de medição de audiência. A recusa tem o mesmo peso da aceitação, e o Site funciona normalmente nos dois casos. A escolha fica salva no navegador por 12 meses.',
              ),
              clause(
                <>
                  O Usuário pode rever ou alterar sua escolha a qualquer momento por meio de{' '}
                  <CookiePreferencesButton className="text-clay underline underline-offset-2 hover:text-clay-d font-medium">
                    Preferências de cookies
                  </CookiePreferencesButton>
                  , também disponível no rodapé do Site. Ao recusar após ter aceitado, os cookies de
                  medição já gravados são apagados.
                </>,
              ),
            ]
          : []),
        clause(
          'O Usuário também pode apagar ou bloquear cookies nas configurações do navegador. O bloqueio dos cookies necessários pode impedir o login e a finalização de compras.',
        ),
        ...(hasGA
          ? [
              clause(
                <>
                  Para o Google Analytics, também é possível instalar o{' '}
                  <A href="https://tools.google.com/dlpage/gaoptout">
                    complemento de desativação oferecido pelo Google
                  </A>
                  .
                </>,
              ),
            ]
          : []),
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações e contato',
      clauses: [
        clause(
          'Esta Política poderá ser atualizada para refletir mudanças nos cookies utilizados ou na legislação. A versão vigente é a publicada nesta página, com o ano da última atualização indicado no topo.',
        ),
        contactClause(id, 'Dúvidas sobre cookies podem ser enviadas pelos seguintes canais:'),
      ],
    },
  ];

  return (
    <LegalPage
      title="Política de Cookies"
      current="/politica-de-cookies"
      intro={
        <>
          Esta Política de Cookies explica quais cookies e tecnologias semelhantes {id.name} utiliza
          neste Site, para que servem, por quanto tempo permanecem e como o Usuário pode gerenciá-los.
          Ela complementa a <A href="/privacidade">Política de Privacidade</A>.
        </>
      }
      sections={sections}
    />
  );
}
