import { getSettings } from '@/lib/settings';

export default async function TermosPage() {
  const settings = await getSettings();
  return (
    <div className="min-h-screen bg-paper py-12">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-ink mb-2">Termos de Uso</h1>
        <p className="text-sm text-faint mb-8">Última atualização: junho de 2025</p>

        <div className="prose prose-sm text-mid flex flex-col gap-6">
          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">1. Aceitação dos termos</h2>
            <p>
              Ao criar uma conta ou realizar uma compra na Mikma Lençóis, você concorda com estes Termos de Uso. Se
              não concordar, não utilize nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">2. Cadastro</h2>
            <p>
              Você é responsável pelas informações fornecidas no cadastro. É proibido criar contas com dados falsos ou
              de terceiros. Cada pessoa pode ter apenas uma conta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">3. Pedidos e pagamentos</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Pagamentos são processados exclusivamente via PIX (AbacatePay)</li>
              <li>O pedido só é confirmado após a confirmação do pagamento</li>
              <li>Preços podem ser alterados sem aviso prévio, mas o valor cobrado é o exibido no momento da compra</li>
              <li>Em caso de indisponibilidade de estoque após o pagamento, reembolso integral em até 2 dias úteis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">4. Entrega</h2>
            <p>
              Prazos de entrega são estimados e dependem da transportadora escolhida. A Mikma Lençóis não é
              responsável por atrasos causados por greves, problemas nos Correios ou eventos fora de nosso controle.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">5. Trocas e devoluções</h2>
            <p>
              Conforme o Código de Defesa do Consumidor (art. 49), você tem 7 dias corridos após o recebimento para
              desistir da compra, sem custo. Produtos com defeito podem ser trocados em até 30 dias.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">6. Uso aceitável</h2>
            <p>
              É proibido usar a plataforma para fraudes, falsificação de pagamentos ou qualquer atividade ilegal.
              Contas suspeitas podem ser suspensas sem aviso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">7. Contato</h2>
            <p>
              Dúvidas:{' '}
              <a href={`mailto:${settings.storeEmail}`} className="text-clay hover:underline">
                {settings.storeEmail}
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
