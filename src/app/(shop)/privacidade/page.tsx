export const revalidate = 86400; // 24h, conteúdo estático

import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { CookiePreferencesButton } from '@/components/layout/CookiePreferencesButton';
import { LegalPage, ContactList, P, H3, UL, B, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Política de Privacidade',
  description: 'Como coletamos, usamos, compartilhamos e protegemos seus dados pessoais (LGPD).',
};

export default async function PrivacidadePage() {
  const s = await getSettings();
  const id = storeIdentity(s);
  const link = 'text-clay underline underline-offset-2';

  // Só descrevemos ferramentas que estão realmente ativas neste deploy.
  const hasGA = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const hasMeta = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);

  const sections: LegalSection[] = [
    {
      id: 'responsavel',
      title: 'Quem é o responsável pelos seus dados',
      body: (
        <>
          <P>
            A <B>{id.name}</B>
            {id.cnpj && <>, inscrita no CNPJ sob o nº {id.cnpj}</>}, com sede em{' '}
            {id.address || id.cityState}, é a controladora dos dados pessoais tratados neste site,
            nos termos da Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
          </P>
          <P>
            Para exercer seus direitos de titular ou tirar dúvidas sobre proteção de dados, use os
            canais da seção <B>Contato</B>, no final desta página.
          </P>
        </>
      ),
    },
    {
      id: 'dados-coletados',
      title: 'Quais dados coletamos',
      body: (
        <>
          <H3>Dados que você nos fornece</H3>
          <UL>
            <li>
              <B>Conta:</B> nome, e-mail e senha. A senha é guardada apenas de forma criptografada e
              irreversível (hash), e nem a nossa equipe consegue ver. Se você entrar com o Google,
              recebemos seu nome, e-mail e o identificador da conta Google, nunca a sua senha.
            </li>
            <li>
              <B>Telefone e CPF:</B> necessários para finalizar uma compra (pagamento, nota fiscal e
              envio).
            </li>
            <li>
              <B>Endereço de entrega:</B> CEP, rua, número, complemento, bairro, cidade e estado.
            </li>
            <li>
              <B>Avaliações e mensagens:</B> o que você escrever nas avaliações de produtos e nos
              contatos com o atendimento.
            </li>
          </UL>

          <H3>Dados gerados pelo uso do site</H3>
          <UL>
            <li>
              <B>Pedidos:</B> itens, valores, frete, situação do pagamento e da entrega, histórico e
              notificações da conta.
            </li>
            <li>
              <B>Pagamento:</B> não armazenamos número de cartão. Ficam conosco apenas o valor, o
              identificador e a situação da cobrança.
            </li>
            <li>
              <B>Registro de aceite:</B> no cadastro, guardamos a data, a versão destes documentos e
              o IP de onde o aceite foi dado.
            </li>
            <li>
              <B>Dados técnicos de acesso:</B> endereço IP, data e hora, navegador e dispositivo,
              páginas acessadas e erros, usados para segurança, prevenção a fraudes e funcionamento
              do site.
            </li>
            <li>
              <B>Localização aproximada por IP</B> (cidade, região e provedor de internet): apenas
              quando o site está em manutenção, para que nossa equipe identifique visitantes
              aguardando e possa liberar acessos.
            </li>
          </UL>

          <P>
            Não coletamos dados pessoais sensíveis (como saúde, religião ou biometria) nem a
            localização precisa do seu dispositivo.
          </P>
        </>
      ),
    },
    {
      id: 'finalidades',
      title: 'Para que usamos seus dados',
      body: (
        <>
          <P>Cada uso tem uma finalidade específica e uma base legal prevista no art. 7º da LGPD:</P>
          <UL>
            <li>
              <B>Criar e manter sua conta</B>, autenticar você e proteger o acesso. Base: execução de
              contrato (art. 7º, V).
            </li>
            <li>
              <B>Processar pedidos:</B> pagamento, separação, envio, rastreamento, trocas,
              devoluções e atendimento. Base: execução de contrato (art. 7º, V).
            </li>
            <li>
              <B>Comunicar sobre sua conta e seus pedidos:</B> verificação de e-mail, redefinição de
              senha, confirmações e avisos de entrega. Base: execução de contrato (art. 7º, V).
            </li>
            <li>
              <B>Emitir nota fiscal e cumprir obrigações</B> fiscais, tributárias e de defesa do
              consumidor. Base: obrigação legal (art. 7º, II).
            </li>
            <li>
              <B>Segurança e prevenção a fraudes e abusos:</B> reCAPTCHA, limitação de requisições e
              registros de acesso. Base: legítimo interesse (art. 7º, IX) e obrigação legal (Marco
              Civil da Internet, Lei nº 12.965/2014).
            </li>
            {(hasGA || hasMeta) && (
              <li>
                <B>Medir a audiência e melhorar o site</B>
                {hasGA && <> (Google Analytics)</>}. Base: consentimento (art. 7º, I), dado no aviso
                de cookies e revogável a qualquer momento (veja a seção Cookies).
              </li>
            )}
            <li>
              <B>Registrar o seu aceite</B> destes documentos no cadastro. Base: consentimento (art.
              7º, I).
            </li>
            <li>
              <B>Defender direitos</B> em processos judiciais, administrativos ou arbitrais. Base:
              exercício regular de direitos (art. 7º, VI).
            </li>
          </UL>
          <P>
            Não vendemos nem alugamos seus dados pessoais, e não os usamos para finalidades
            diferentes das descritas aqui.
          </P>
        </>
      ),
    },
    {
      id: 'compartilhamento',
      title: 'Com quem compartilhamos',
      body: (
        <>
          <P>
            Compartilhamos apenas o necessário com empresas que nos ajudam a operar a loja. Cada uma
            trata os dados conforme os contratos firmados conosco e suas próprias políticas de
            privacidade:
          </P>
          <UL>
            <li>
              <B>Google</B> (Firebase, Google Cloud, Google Sign-In, reCAPTCHA
              {hasGA && <> e Google Analytics</>}): hospedagem do site e do banco de dados,
              autenticação, proteção contra robôs{hasGA && <> e medição de audiência</>}. Dados:
              conta, pedidos e dados técnicos de acesso.
            </li>
            <li>
              <B>AbacatePay:</B> cobrança por PIX e cartão. Dados: nome, e-mail, telefone, CPF e
              valor do pedido.
            </li>
            <li>
              <B>Melhor Envio e transportadoras:</B> envios para fora da região de entrega local.
              Dados: nome, telefone, e-mail, CPF, endereço e características da encomenda (peso,
              dimensões e valor).
            </li>
            <li>
              <B>Uber Direct:</B> entregas locais. Dados: nome, telefone, endereço e descrição dos
              itens.
            </li>
            <li>
              <B>Resend:</B> envio dos nossos e-mails. Dados: nome, e-mail e conteúdo da mensagem.
            </li>
            <li>
              <B>Sentry:</B> monitoramento de erros e desempenho, configurado para não enviar dados
              pessoais identificáveis por padrão.
            </li>
            <li>
              <B>Upstash:</B> limitação de requisições, como medida de segurança. Dados:
              identificadores técnicos, como o IP.
            </li>
            <li>
              <B>ViaCEP e OpenStreetMap (Nominatim):</B> preenchimento do endereço pelo CEP, cálculo
              de entrega e mapa de acompanhamento. Dados: CEP, endereço e, nas consultas feitas pelo
              seu navegador, o IP.
            </li>
            <li>
              <B>Serviços de geolocalização por IP:</B> usados apenas durante manutenções do site.
              Dado: endereço IP.
            </li>
            {hasMeta && (
              <li>
                <B>Meta Platforms</B> (Pixel): medição de eventos de navegação e compra no site.
              </li>
            )}
          </UL>
          <P>
            Também podemos compartilhar dados com autoridades públicas, quando exigido por lei ou
            ordem judicial, e com prestadores de serviços contábeis e jurídicos, sob dever de sigilo,
            quando necessário.
          </P>
        </>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies e tecnologias semelhantes',
      body: (
        <>
          <P>
            Cookies são pequenos arquivos gravados no seu navegador. Também usamos o armazenamento
            local do navegador para funções semelhantes.
          </P>
          <UL>
            <li>
              <B>Necessários:</B> mantêm você conectado (sessão do Firebase Authentication),
              lembram sua preferência de tema claro ou escuro e viabilizam a segurança dos
              formulários de login, cadastro e recuperação de senha (reCAPTCHA). Sem eles, o site
              não funciona corretamente, por isso não dependem de escolha.
            </li>
            {hasGA && (
              <li>
                <B>Medição de audiência (Google Analytics 4):</B> cookies como _ga e _ga_ seguido do
                identificador da propriedade, que podem durar até 2 anos. Enviam ao Google eventos de
                navegação e compra, como páginas visitadas, produtos visualizados e itens
                adicionados ao carrinho. <B>Só são ativados se você aceitar.</B>
              </li>
            )}
            {hasMeta && (
              <li>
                <B>Meta Pixel:</B> cookie próprio da Meta para medir eventos de navegação e compra.{' '}
                <B>Só é ativado se você aceitar.</B>
              </li>
            )}
          </UL>
          {(hasGA || hasMeta) && (
            <>
              <P>
                Na sua primeira visita, mostramos um aviso para você aceitar ou recusar os cookies
                de medição. A recusa tem o mesmo peso da aceitação, e o site funciona normalmente
                nos dois casos. Sua escolha fica salva neste navegador por 12 meses.
              </P>
              <P>
                Para rever ou mudar sua escolha a qualquer momento, use{' '}
                <CookiePreferencesButton className={link + ' font-medium'}>
                  Preferências de cookies
                </CookiePreferencesButton>{' '}
                (também disponível no rodapé do site). Ao recusar depois de ter aceitado, apagamos
                os cookies de medição já gravados.
              </P>
            </>
          )}
          <P>
            Você também pode apagar ou bloquear cookies nas configurações do navegador. Bloquear os
            cookies necessários pode impedir o login e a finalização de compras.
          </P>
        </>
      ),
    },
    {
      id: 'transferencia-internacional',
      title: 'Transferência internacional de dados',
      body: (
        <P>
          Alguns dos nossos fornecedores, incluindo a infraestrutura em nuvem do Google, processam
          dados fora do Brasil, inclusive nos Estados Unidos. Essas transferências ocorrem com base
          no art. 33 da LGPD, observadas as garantias contratuais e de segurança oferecidas por esses
          provedores.
        </P>
      ),
    },
    {
      id: 'retencao',
      title: 'Por quanto tempo guardamos',
      body: (
        <>
          <UL>
            <li>
              <B>Conta e perfil:</B> enquanto a conta estiver ativa. Ao excluí-la, removemos seu
              perfil, carrinho e notificações e encerramos o acesso.
            </li>
            <li>
              <B>Pedidos, pagamentos e documentos fiscais:</B> permanecem mesmo após a exclusão da
              conta, pelo prazo exigido pela legislação fiscal, tributária e do consumidor (em regra,
              5 anos) e para a defesa em eventuais disputas (art. 16, I, e art. 7º, VI, da LGPD).
            </li>
            <li>
              <B>Registros de acesso:</B> pelo prazo previsto na legislação aplicável, em especial o
              Marco Civil da Internet.
            </li>
          </UL>
          <P>
            Encerrados esses prazos, os dados são eliminados ou anonimizados, salvo se a lei
            autorizar ou exigir a conservação.
          </P>
        </>
      ),
    },
    {
      id: 'direitos',
      title: 'Seus direitos',
      body: (
        <>
          <P>Conforme o art. 18 da LGPD, você pode, a qualquer momento:</P>
          <UL>
            <li>confirmar se tratamos seus dados e acessá-los;</li>
            <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
            <li>
              pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos
              ou tratados em desconformidade com a lei;
            </li>
            <li>solicitar a portabilidade dos seus dados;</li>
            <li>pedir a eliminação dos dados tratados com base no seu consentimento;</li>
            <li>saber com quais entidades compartilhamos seus dados;</li>
            <li>
              ser informado sobre a possibilidade de não consentir e sobre as consequências da
              recusa, e revogar o consentimento;
            </li>
            <li>opor-se a tratamentos feitos com base em legítimo interesse.</li>
          </UL>

          <H3>Como exercer</H3>
          <UL>
            <li>
              Na área <B>Perfil</B>, você atualiza seu nome, baixa uma cópia dos seus dados em
              arquivo JSON (<B>Exportar meus dados</B>) e pode <B>Excluir conta</B>. Telefone, CPF e
              endereço podem ser revisados na finalização de um pedido.
            </li>
            <li>
              Para qualquer outro pedido, fale com a gente pelos canais da seção Contato. Respondemos
              em formato simplificado de imediato ou, se necessário, por declaração completa em até
              15 dias (art. 19 da LGPD).
            </li>
          </UL>
          <P>
            A exclusão da conta é definitiva: pedidos aguardando pagamento são cancelados, e seu
            perfil, carrinho, notificações e login são removidos. Os dados de pedidos concluídos
            permanecem conforme a seção{' '}
            <a href="#retencao" className={link}>
              Por quanto tempo guardamos
            </a>
            .
          </P>
          <P>
            Se entender que seus direitos não foram atendidos, você pode apresentar reclamação à
            Autoridade Nacional de Proteção de Dados (ANPD), em{' '}
            <a
              href="https://www.gov.br/anpd"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              gov.br/anpd
            </a>
            .
          </P>
        </>
      ),
    },
    {
      id: 'seguranca',
      title: 'Como protegemos seus dados',
      body: (
        <>
          <UL>
            <li>Comunicação protegida por criptografia (HTTPS/TLS) em todo o site.</li>
            <li>
              Senhas armazenadas somente como hash (Argon2), o que impede que sejam lidas, até
              mesmo por nós.
            </li>
            <li>
              Autenticação gerenciada pelo Firebase Authentication, com proteção contra robôs
              (reCAPTCHA) e limitação de tentativas nos formulários sensíveis.
            </li>
            <li>
              Regras de acesso ao banco de dados para que cada cliente acesse apenas os próprios
              dados, e áreas administrativas restritas a perfis autorizados.
            </li>
            <li>
              Infraestrutura em nuvem do Google, com criptografia dos dados em repouso, e
              compartilhamento com terceiros limitado ao necessário.
            </li>
          </UL>
          <P>
            Nenhum sistema é totalmente imune a falhas. Em caso de incidente de segurança que possa
            acarretar risco ou dano relevante, comunicaremos você e a ANPD, conforme o art. 48 da
            LGPD.
          </P>
        </>
      ),
    },
    {
      id: 'menores',
      title: 'Crianças e adolescentes',
      body: (
        <P>
          O site é destinado a maiores de 18 anos e não coletamos intencionalmente dados de crianças
          e adolescentes. Se identificarmos um cadastro nessa condição, excluiremos os dados. Se você
          é responsável legal e acredita que isso ocorreu, entre em contato.
        </P>
      ),
    },
    {
      id: 'terceiros',
      title: 'Links e serviços de terceiros',
      body: (
        <P>
          O site pode levar você a ambientes de terceiros, como Instagram, WhatsApp e a página de
          pagamento da AbacatePay. Esses ambientes têm suas próprias regras de privacidade, pelas
          quais não somos responsáveis. Recomendamos a leitura antes de fornecer dados a eles.
        </P>
      ),
    },
    {
      id: 'alteracoes',
      title: 'Alterações desta Política',
      body: (
        <P>
          Podemos atualizar esta Política para refletir mudanças no site, nos nossos fornecedores ou
          na lei. A versão vigente é sempre a publicada nesta página, com número e data. Mudanças
          relevantes serão destacadas no site ou comunicadas por e-mail.
        </P>
      ),
    },
    {
      id: 'contato',
      title: 'Contato',
      body: (
        <>
          <P>
            Para exercer seus direitos, tirar dúvidas ou relatar um problema de privacidade, fale
            com {id.name}:
          </P>
          <ContactList id={id} />
        </>
      ),
    },
  ];

  return (
    <LegalPage
      title="Política de Privacidade"
      intro={
        <>
          Esta Política explica de forma transparente como a {id.name} coleta, usa, compartilha e
          protege os seus dados pessoais, em conformidade com a LGPD, o Marco Civil da Internet e o
          Código de Defesa do Consumidor. Ela complementa os{' '}
          <Link href="/termos" className={link}>
            Termos de Uso
          </Link>
          .
        </>
      }
      summary={[
        'Coletamos só o necessário para vender, cobrar e entregar os seus pedidos.',
        'Não vendemos nem alugamos seus dados pessoais.',
        'Em Perfil, você baixa uma cópia dos seus dados ou exclui a conta quando quiser.',
        ...(hasGA || hasMeta
          ? ['Cookies de medição de audiência só são ativados se você aceitar, e você pode mudar de ideia a qualquer momento.']
          : []),
      ]}
      sections={sections}
    />
  );
}
