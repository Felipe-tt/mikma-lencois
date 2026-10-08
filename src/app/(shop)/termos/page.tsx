export const revalidate = 86400; // 24h, conteúdo estático

import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { LegalPage, ContactList, P, H3, UL, B, type LegalSection } from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Termos de Uso',
  description: 'Regras de uso do site, compra, pagamento, entrega, trocas e devoluções.',
};

export default async function TermosPage() {
  const s = await getSettings();
  const id = storeIdentity(s);
  const link = 'text-clay underline underline-offset-2';

  const sections: LegalSection[] = [
    {
      id: 'quem-somos',
      title: 'Quem somos',
      body: (
        <>
          <P>
            Este site é operado por <B>{id.name}</B>
            {id.cnpj && <>, inscrita no CNPJ sob o nº {id.cnpj}</>}, com sede em{' '}
            {id.address || id.cityState}.
          </P>
          <P>Para falar com a gente sobre pedidos, trocas, dúvidas ou reclamações:</P>
          <ContactList id={id} />
        </>
      ),
    },
    {
      id: 'aceitacao',
      title: 'Aceitação e alterações',
      body: (
        <>
          <P>
            Podemos atualizar estes Termos para refletir mudanças na loja ou na legislação. A versão
            vigente é sempre a publicada nesta página, com a data da última atualização indicada no
            topo.
          </P>
          <P>
            Mudanças relevantes serão destacadas no site ou comunicadas por e-mail. Pedidos já
            confirmados continuam regidos pela versão que estava em vigor no momento da compra. Se
            você não concordar com os Termos, não utilize o site.
          </P>
        </>
      ),
    },
    {
      id: 'conta',
      title: 'Cadastro e conta',
      body: (
        <UL>
          <li>
            Para comprar, é necessário criar uma conta com e-mail e senha ou usando sua conta Google.
            Você deve ter 18 anos completos ou ser emancipado. Menores de idade só podem utilizar o
            site por meio de seus responsáveis legais.
          </li>
          <li>
            Os dados informados (nome, e-mail, telefone, CPF e endereço) devem ser verdadeiros,
            completos e atualizados. Dados incorretos podem impedir o pagamento, a emissão da nota
            fiscal ou a entrega.
          </li>
          <li>
            Você é responsável por manter sua senha em sigilo e por toda atividade realizada na sua
            conta. Avise-nos imediatamente se suspeitar de uso não autorizado.
          </li>
          <li>
            Podemos exigir a verificação do seu e-mail e suspender ou encerrar contas com indícios
            de fraude, uso indevido ou violação destes Termos. Pedidos já pagos serão entregues ou
            reembolsados.
          </li>
          <li>
            Você pode excluir sua conta a qualquer momento na área <B>Perfil</B>. Os efeitos da
            exclusão estão descritos na{' '}
            <Link href="/privacidade" className={link}>
              Política de Privacidade
            </Link>
            .
          </li>
        </UL>
      ),
    },
    {
      id: 'produtos',
      title: 'Produtos e informações do site',
      body: (
        <UL>
          <li>
            Nos esforçamos para que fotos, cores, medidas e descrições sejam fiéis aos produtos.
            Pequenas variações de tom podem ocorrer por causa de tela e iluminação, e tecidos têm
            tolerância de fabricação nas medidas. Consulte o guia de tamanhos antes de comprar.
          </li>
          <li>
            A disponibilidade depende do estoque. Ao finalizar o pedido, reservamos as unidades para
            você até a confirmação do pagamento ou o cancelamento do pedido.
          </li>
          <li>
            Em caso de erro manifesto de preço, descrição ou estoque (por exemplo, um valor
            claramente incompatível com o produto), entraremos em contato antes de processar o
            pedido para que você escolha entre manter a compra com as informações corretas ou
            cancelá-la com reembolso integral.
          </li>
        </UL>
      ),
    },
    {
      id: 'pagamento',
      title: 'Preços e pagamento',
      body: (
        <>
          <UL>
            <li>
              Todos os valores estão em reais (BRL) e incluem os tributos aplicáveis. O frete é
              calculado a partir do CEP de entrega, do peso e das dimensões dos produtos, e é
              informado separadamente antes da confirmação do pedido.
            </li>
            <li>
              O preço válido é o exibido no momento da finalização do pedido. Podemos alterar preços
              a qualquer momento, mas a alteração não afeta pedidos já confirmados. Descontos, frete
              grátis e demais condições promocionais seguem as regras divulgadas no site no momento
              da compra.
            </li>
            <li>
              Aceitamos <B>PIX</B> e, quando disponível, <B>cartão de crédito</B>. Os pagamentos são
              processados pela AbacatePay. Os dados do cartão são digitados no ambiente seguro da
              AbacatePay e não passam pelos nossos servidores.
            </li>
            <li>
              No PIX, o QR Code e o código copia e cola têm validade de 15 minutos. Se expirarem,
              você pode gerar um novo código em <B>Meus pedidos</B> enquanto o pedido aguardar
              pagamento.
            </li>
            <li>
              O pedido é confirmado somente após a compensação do pagamento, que no PIX ocorre de
              forma automática e, em regra, instantânea. Pedidos não pagos em até 48 horas são
              cancelados automaticamente e o estoque reservado é liberado. Podemos avisar por e-mail
              antes do cancelamento.
            </li>
            <li>
              Podemos cancelar pedidos com indícios de fraude ou inconsistência nos dados de
              pagamento, com reembolso integral dos valores já pagos.
            </li>
            <li>
              Emitimos o documento fiscal conforme a legislação aplicável, com os dados informados
              no pedido.
            </li>
          </UL>
        </>
      ),
    },
    {
      id: 'entrega',
      title: 'Entrega',
      body: (
        <UL>
          <li>
            O prazo de entrega começa a contar após a confirmação do pagamento. Pedidos confirmados
            depois do horário limite de despacho divulgado no site seguem no próximo dia útil.
          </li>
          <li>
            <B>Entrega local</B> ({id.cityState} e região dentro do raio de atendimento informado no
            site): feita por entregador parceiro, com estimativa de até 1 hora a partir do despacho.
            O prazo depende da disponibilidade de entregadores, do trânsito e das condições
            climáticas. Quando disponível, você pode acompanhar o trajeto em tempo real na página do
            pedido.
          </li>
          <li>
            <B>Demais regiões:</B> o envio é feito por transportadoras contratadas por meio do Melhor
            Envio. O prazo, em dias úteis a partir da postagem, é informado no cálculo do frete, e o
            código de rastreamento fica disponível na página do pedido.
          </li>
          <li>
            Você é responsável por informar um endereço correto e completo e por garantir que haja
            alguém para receber. Em caso de endereço incorreto, destinatário ausente após as
            tentativas de entrega ou recusa sem justificativa, a mercadoria poderá retornar ao nosso
            estoque, e um novo envio poderá ter nova cobrança de frete.
          </li>
          <li>
            Confira a embalagem e o produto no recebimento. Se houver avaria, recuse a entrega ou nos
            avise o quanto antes, com fotos, pelos canais de atendimento.
          </li>
        </UL>
      ),
    },
    {
      id: 'arrependimento',
      title: 'Arrependimento, trocas e defeitos',
      body: (
        <>
          <H3>Direito de arrependimento</H3>
          <P>
            Por ser uma compra a distância, você pode desistir do pedido em até <B>7 dias corridos</B>{' '}
            a contar do recebimento, sem precisar justificar (art. 49 do Código de Defesa do
            Consumidor, Lei nº 8.078/1990). Nesse caso, devolvemos integralmente os valores pagos,
            inclusive o frete, e orientamos a devolução sem custo para você. O produto deve ser
            devolvido sem sinais de uso, em condições de ser reaproveitado e, sempre que possível,
            com etiquetas e embalagem original.
          </P>

          <H3>Produto com defeito</H3>
          <P>
            Se o produto apresentar vício de qualidade, avise-nos dentro dos prazos do art. 26 do
            CDC: 30 dias para produtos não duráveis e 90 dias para duráveis, contados da entrega
            (vício aparente) ou da constatação (vício oculto). Temos até 30 dias para sanar o vício.
            Se não for resolvido, você pode escolher entre a substituição do produto, a restituição
            do valor pago ou o abatimento proporcional do preço (art. 18 do CDC).
          </P>

          <H3>Como solicitar</H3>
          <P>
            Entre em contato pelos canais de atendimento informando o número do pedido e, se
            possível, enviando fotos. Assim que o produto for recebido e conferido, o reembolso é
            feito pelo mesmo meio usado no pagamento (PIX ou cartão), no prazo compatível com a
            operação financeira.
          </P>
        </>
      ),
    },
    {
      id: 'avaliacoes',
      title: 'Avaliações e conteúdo enviado por você',
      body: (
        <UL>
          <li>
            Somente clientes com pedido já entregue podem avaliar os produtos daquele pedido. A
            avaliação (nota e comentário de até 1.000 caracteres) pode ser exibida publicamente no
            site, junto ao seu nome.
          </li>
          <li>
            Você é responsável pelo que escreve. O conteúdo deve ser verdadeiro, baseado na sua
            experiência, e não pode conter ofensas, discriminação, dados pessoais de terceiros, spam
            ou qualquer conteúdo ilícito.
          </li>
          <li>
            Você mantém a autoria da avaliação, mas nos concede uma licença gratuita e não exclusiva
            para exibi-la no site e nos materiais da loja enquanto estiver publicada. Podemos remover
            avaliações que violem estes Termos.
          </li>
        </UL>
      ),
    },
    {
      id: 'uso-adequado',
      title: 'Uso adequado do site',
      body: (
        <>
          <P>É proibido:</P>
          <UL>
            <li>usar o site para fraude ou usar dados de terceiros sem autorização;</li>
            <li>
              usar robôs, scrapers ou qualquer automação para coletar dados, fazer pedidos ou
              sobrecarregar o site;
            </li>
            <li>
              tentar acessar áreas restritas, testar ou explorar vulnerabilidades ou contornar
              medidas de segurança;
            </li>
            <li>interferir no funcionamento do site ou dos serviços de terceiros que ele utiliza;</li>
            <li>publicar conteúdo ilícito ou ofensivo.</li>
          </UL>
          <P>
            Para proteger a loja e os clientes, usamos mecanismos como reCAPTCHA e limitação de
            requisições. Podemos bloquear acessos que violem estas regras, sem prejuízo de medidas
            legais cabíveis.
          </P>
        </>
      ),
    },
    {
      id: 'propriedade-intelectual',
      title: 'Propriedade intelectual',
      body: (
        <P>
          A marca, o logotipo, o nome, os textos, as fotografias, o layout e os demais conteúdos do
          site pertencem a {id.name} ou a seus licenciantes e são protegidos pela legislação de
          propriedade intelectual. É proibido copiar, reproduzir, modificar ou distribuir esse
          conteúdo sem autorização prévia por escrito, exceto para uso pessoal e não comercial.
        </P>
      ),
    },
    {
      id: 'disponibilidade',
      title: 'Disponibilidade do site',
      body: (
        <P>
          Trabalhamos para manter o site disponível, mas ele pode ficar temporariamente indisponível
          por manutenção, atualização ou falhas fora do nosso controle, como instabilidades de
          provedores de internet, de nuvem ou de meios de pagamento. Durante manutenções, o site pode
          exibir uma página de aviso, com o acesso liberado assim que a atividade terminar.
        </P>
      ),
    },
    {
      id: 'responsabilidade',
      title: 'Limitação de responsabilidade',
      body: (
        <>
          <P>
            Respondemos pelos vícios e defeitos dos produtos e pela falha na prestação do serviço nos
            termos do Código de Defesa do Consumidor. Não nos responsabilizamos por:
          </P>
          <UL>
            <li>
              atrasos ou falhas decorrentes de caso fortuito ou força maior, como greves, bloqueios
              de vias e desastres naturais, que afetem transportadoras e entregadores;
            </li>
            <li>endereço ou dados incorretos informados por você;</li>
            <li>
              indisponibilidade de serviços de terceiros, como internet, bancos, meios de pagamento e
              plataformas;
            </li>
            <li>uso indevido do site ou da sua conta por culpa sua.</li>
          </UL>
          <P>Nada nestes Termos limita os direitos que a lei assegura ao consumidor.</P>
        </>
      ),
    },
    {
      id: 'comunicacoes',
      title: 'Comunicações e privacidade',
      body: (
        <>
          <P>
            Enviamos as mensagens necessárias ao serviço: verificação de e-mail, redefinição de
            senha, confirmação de pedido, status de pagamento e de entrega. Comunicações
            promocionais só são enviadas com a sua autorização.
          </P>
          <P>
            O tratamento dos seus dados pessoais está descrito na{' '}
            <Link href="/privacidade" className={link}>
              Política de Privacidade
            </Link>
            , que faz parte destes Termos.
          </P>
        </>
      ),
    },
    {
      id: 'atendimento',
      title: 'Atendimento e solução de conflitos',
      body: (
        <>
          <P>
            Buscamos responder o quanto antes e resolver qualquer problema de forma amigável pelos
            canais acima. Se não chegarmos a uma solução, você também pode recorrer ao Procon do seu
            estado ou à plataforma{' '}
            <a
              href="https://www.consumidor.gov.br"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              consumidor.gov.br
            </a>
            .
          </P>
          <ContactList id={id} />
        </>
      ),
    },
    {
      id: 'disposicoes-gerais',
      title: 'Disposições gerais',
      body: (
        <P>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do
          consumidor para resolver eventuais controvérsias (art. 101, I, do CDC). Se alguma
          disposição for considerada inválida, as demais continuam em vigor. A tolerância quanto ao
          descumprimento de qualquer regra não significa renúncia a direitos.
        </P>
      ),
    },
  ];

  return (
    <LegalPage
      title="Termos de Uso"
      intro={
        <>
          Estes Termos regulam o acesso ao site da {id.name} e a compra de produtos na nossa loja
          online. Ao criar uma conta, navegar pelo site ou finalizar um pedido, você declara que leu
          e concorda com eles e com a{' '}
          <Link href="/privacidade" className={link}>
            Política de Privacidade
          </Link>
          .
        </>
      }
      summary={[
        'Aceitamos PIX e, quando disponível, cartão de crédito. O pedido é confirmado após o pagamento.',
        'Pedidos aguardando pagamento são cancelados automaticamente após 48 horas.',
        'Você pode desistir da compra em até 7 dias corridos após o recebimento.',
        'Produtos com defeito são cobertos nos prazos do Código de Defesa do Consumidor.',
      ]}
      sections={sections}
    />
  );
}
