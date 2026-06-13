import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Política de Privacidade' };

export default async function PrivacidadePage() {
  const s = await getSettings();
  const name = s.storeName || 'Mikma Lençóis';
  const email = s.storeEmail || '';

  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop py-12 sm:py-16">
          <span className="eyebrow mb-3 block">Legal</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
            Política de Privacidade
          </h1>
        </div>
      </div>

      <div className="container-shop py-12 pb-20">
        <div className="max-w-2xl flex flex-col gap-8">

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">1. Quem somos</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              {name} é responsável pelo tratamento dos seus dados pessoais coletados neste site, nos termos da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
              {email && ` Dúvidas: ${email}.`}
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">2. Dados coletados</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Coletamos apenas os dados necessários para processar seus pedidos: nome, e-mail, endereço de entrega e CPF (para emissão de nota fiscal). Não coletamos dados de cartão de crédito — pagamentos são realizados via PIX.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">3. Uso dos dados</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Seus dados são usados exclusivamente para: (a) processar e entregar pedidos; (b) comunicar sobre o status do pedido; (c) cumprir obrigações fiscais e legais. Não vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">4. Seus direitos (LGPD)</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Você tem direito a: acessar seus dados, corrigir informações incorretas, solicitar a exclusão da sua conta e dados, e receber uma cópia dos seus dados em formato portável. Para exercer esses direitos, acesse sua conta ou entre em contato conosco.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">5. Segurança</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Utilizamos criptografia SSL/TLS para transmissão de dados e autenticação segura via Firebase Authentication. Seus dados são armazenados em servidores do Google Cloud com padrões de segurança internacionais.
            </p>
          </section>

          <section>
            <h2 className="font-display font-normal text-ink text-2xl mb-4">6. Cookies</h2>
            <p className="text-[15px] text-mid leading-relaxed">
              Usamos apenas cookies estritamente necessários para manter sua sessão autenticada e carrinho de compras. Não utilizamos cookies de rastreamento ou publicidade de terceiros.
            </p>
          </section>

          <p className="text-[12px] text-faint border-t border-mist pt-6">
            Última atualização: {new Date().getFullYear()}. {email && `Contato: ${email}`}
          </p>
        </div>
      </div>
    </div>
  );
}
