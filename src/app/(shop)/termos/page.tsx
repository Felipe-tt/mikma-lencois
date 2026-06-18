export const revalidate = 86400; // 24h — conteúdo estático

import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Termos de Uso' };

export default async function TermosPage() {
  const s = await getSettings();
  const name = s.storeName || 'Mikma Lençóis';
  const city = s.storeCity || 'Blumenau, SC';

  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-12 sm:py-16">
          <span className="eyebrow mb-3 block">Legal</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
            Termos de Uso
          </h1>
        </div>
      </div>

      <div className="container-shop py-12 pb-20">
        <div className="max-w-2xl flex flex-col gap-8">

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">1. Aceitação</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Ao utilizar este site ou realizar uma compra, você concorda com estes Termos de Uso. O site é operado por {name}, com sede em {city}.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">2. Produtos e preços</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Todos os preços são em Reais (BRL) e incluem impostos. Nos reservamos o direito de alterar preços a qualquer momento, sem aviso prévio. O preço válido é o exibido no momento da finalização do pedido.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">3. Pagamento</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Aceitamos pagamento via PIX. O pedido é confirmado somente após a confirmação do pagamento pelo sistema bancário, de forma automática e instantânea. PIX não pagos dentro do prazo são automaticamente cancelados.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">4. Entrega</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              O prazo de entrega começa a contar após a confirmação do pagamento. Para entregas locais em {city}, o prazo é de até 1 hora. Para outras regiões, o prazo varia conforme a transportadora selecionada e o CEP de destino.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">5. Trocas e devoluções</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Conforme o Código de Defesa do Consumidor (Lei nº 8.078/1990), você tem direito de desistir da compra em até 7 dias após o recebimento do produto, desde que o produto esteja sem uso e na embalagem original. Para iniciar uma troca ou devolução, entre em contato conosco.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">6. Limitação de responsabilidade</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Não nos responsabilizamos por atrasos causados por transportadoras, eventos de força maior, greves, ou endereços incorretos fornecidos pelo comprador. Em caso de produto com defeito de fabricação, providenciaremos a troca sem custo adicional.
            </p>
          </section>

          <p className="text-[12px] text-faint border-t border-mist pt-6">
            Última atualização: {new Date().getFullYear()}. {city}.
          </p>
        </div>
      </div>
    </div>
  );
}
