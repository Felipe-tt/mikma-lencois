
import { shareMeta } from '@/lib/seo';
import type { ReactNode } from 'react';
import { getStoreSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { CookiePreferencesButton } from '@/components/layout/CookiePreferencesButton';
import { LegalPage, A, B, Table, clause, contactClause, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Política de Cookies',
  description: 'O que são os cookies do site, para que servem, por quanto tempo ficam e como você escolhe.',
  ...shareMeta({ title: 'Política de Cookies', description: 'O que são os cookies do site, para que servem, por quanto tempo ficam e como você escolhe.', path: '/politica-de-cookies' }),
  alternates: { canonical: '/politica-de-cookies' },
  // Página jurídica: fica no site, mas fora da busca, para não aparecer no
  // lugar da home quando procuram a loja no Google.
  robots: { index: false, follow: true },
};

export default async function PoliticaDeCookiesPage() {
  const s = await getStoreSettings();
  const id = storeIdentity(s);

  // Só lista a medição de audiência se ela estiver ligada neste site.
  const hasGA = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const hasMeta = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const hasAnalytics = hasGA || hasMeta;

  // Pelo que cada um faz, sem nome técnico: é o que importa para quem lê.
  const rows: ReactNode[][] = [
    ['Manter você conectado', 'Lembra que você entrou na sua conta, para não pedir a senha a cada página.', 'Essencial', 'Até você sair da conta'],
    ['Segurança dos formulários', 'Confere se quem está entrando ou se cadastrando é uma pessoa, e não um robô.', 'Essencial', 'Até 6 meses'],
    ['Sua escolha sobre cookies', 'Guarda o que você respondeu no aviso de cookies.', 'Essencial', '12 meses'],
    ['Tema claro ou escuro', 'Lembra o visual que você escolheu para o site.', 'Preferência', 'Até você limpar o navegador'],
    ...(hasAnalytics
      ? [['Medição de audiência', 'Mostra, de forma agregada, quais páginas são mais visitadas, para melhorarmos o site.', 'Medição (só com o seu aceite)', hasGA ? 'Até 2 anos' : 'Até 90 dias']]
      : []),
  ];

  const sections: LegalSection[] = [
    {
      id: 'o-que-sao',
      title: 'O que são cookies',
      clauses: [
        clause(
          'Cookies são pequenos arquivos que o site guarda no seu navegador. Eles servem para lembrar coisas entre uma página e outra, como a sua conta e o seu carrinho. Aqui chamamos de “cookies” também outras formas parecidas de guardar informação no navegador.',
        ),
      ],
    },
    {
      id: 'quais-usamos',
      title: 'Quais usamos',
      clauses: [
        clause(`Usamos poucos cookies, de ${hasAnalytics ? 'três' : 'dois'} tipos:`, [
          <>
            <B>Essenciais:</B> sem eles o site não funciona, por exemplo para manter você conectado
            e proteger o login. Por isso não precisam de aceite.
          </>,
          <>
            <B>De preferência:</B> lembram escolhas suas, como o tema do site.
          </>,
          ...(hasAnalytics
            ? [
                <>
                  <B>De medição:</B> ajudam a entender como o site é usado. Só funcionam se você
                  aceitar.
                </>,
              ]
            : []),
        ]),
        clause(
          hasAnalytics
            ? 'Esta é a lista completa:'
            : 'Não usamos cookies de propaganda nem de medição de audiência. Esta é a lista completa:',
        ),
      ],
      after: <Table head={['Cookie', 'Para que serve', 'Tipo', 'Quanto tempo fica']} rows={rows} />,
    },
    {
      id: 'parceiros',
      title: 'Cookies de parceiros',
      clauses: [
        clause(
          <>
            Alguns desses cookies são colocados por empresas que nos ajudam a manter o site seguro
            {hasAnalytics && ' e a medir a audiência'}. Elas seguem as próprias regras de
            privacidade. Contamos mais na <A href="/privacidade">Política de Privacidade</A>.
          </>,
        ),
      ],
    },
    {
      id: 'sua-escolha',
      title: 'Como escolher',
      clauses: [
        ...(hasAnalytics
          ? [
              clause(
                'Na primeira visita, mostramos um aviso para você aceitar ou recusar os cookies de medição. Recusar é tão fácil quanto aceitar, e o site funciona igual nos dois casos.',
              ),
              clause(
                <>
                  Mudou de ideia? É só abrir as{' '}
                  <CookiePreferencesButton className="text-clay underline underline-offset-2 hover:text-clay-d font-medium">
                    Preferências de cookies
                  </CookiePreferencesButton>
                  , que também ficam no rodapé do site. Se recusar depois de ter aceitado, apagamos
                  os cookies de medição.
                </>,
              ),
            ]
          : []),
        clause(
          'Você também pode apagar ou bloquear cookies nas configurações do seu navegador. Só lembre que, sem os essenciais, não dá para entrar na conta nem finalizar a compra.',
        ),
        ...(hasGA
          ? [
              clause(
                <>
                  Se preferir, o Google oferece um{' '}
                  <A href="https://tools.google.com/dlpage/gaoptout">complemento para desligar a medição</A>{' '}
                  em todos os sites.
                </>,
              ),
            ]
          : []),
      ],
    },
    {
      id: 'contato',
      title: 'Mudanças e contato',
      clauses: [
        clause(
          'Se passarmos a usar outros cookies, atualizamos esta página. A data da última atualização fica no topo.',
        ),
        contactClause(id, 'Dúvidas sobre cookies? Fale com a gente:'),
      ],
    },
  ];

  return (
    <LegalPage
      title="Política de Cookies"
      current="/politica-de-cookies"
      intro={
        <>
          Explicamos aqui quais cookies o site usa, para que servem e como você escolhe. Esta
          página completa a nossa <A href="/privacidade">Política de Privacidade</A>.
        </>
      }
      summary={[
        'Usamos poucos cookies, quase todos só para o site funcionar.',
        hasAnalytics ? 'Cookies de medição só com o seu aceite, e você pode mudar de ideia quando quiser.' : 'Não usamos cookies de propaganda nem de medição de audiência.',
        'Nenhum cookie é usado para vender os seus dados.',
      ]}
      sections={sections}
    />
  );
}
