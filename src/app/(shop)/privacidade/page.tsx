export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-paper py-12">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-ink mb-2">Política de Privacidade</h1>
        <p className="text-sm text-faint mb-8">Última atualização: junho de 2025</p>

        <div className="prose prose-sm text-mid flex flex-col gap-6">
          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">1. Quem somos</h2>
            <p>
              Mikma Lençóis é uma loja virtual de produtos têxteis localizada em Blumenau, SC. Este documento descreve
              como coletamos, usamos e protegemos seus dados pessoais, em conformidade com a Lei Geral de Proteção de
              Dados (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Nome e e-mail — necessários para criar sua conta</li>
              <li>Endereço — coletado apenas no momento da compra, para entrega</li>
              <li>CPF — opcional, somente se você solicitar nota fiscal</li>
              <li>Histórico de pedidos — para acompanhamento e suporte</li>
              <li>Dados de navegação (anonimizados) — via Google Analytics 4</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">3. Como usamos seus dados</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Processar e entregar seus pedidos</li>
              <li>Enviar atualizações sobre seu pedido por e-mail e notificações</li>
              <li>Melhorar a experiência da loja</li>
              <li>Cumprir obrigações legais e fiscais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">4. Compartilhamento de dados</h2>
            <p>
              Seus dados são compartilhados apenas com prestadores de serviço essenciais: processadora de pagamento
              (AbacatePay — apenas para confirmar transações PIX), transportadoras (para entrega) e Firebase/Google
              (infraestrutura segura certificada). Nunca vendemos seus dados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">5. Seus direitos (LGPD)</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Acessar os dados que temos sobre você</li>
              <li>Exportar seus dados em formato JSON — disponível em sua conta</li>
              <li>Corrigir dados incorretos</li>
              <li>Excluir sua conta e todos os dados associados — disponível em sua conta</li>
              <li>Revogar consentimento a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">6. Segurança</h2>
            <p>
              Usamos criptografia em trânsito (TLS) e em repouso (AES-256) para dados sensíveis. Senhas são
              armazenadas com hash Argon2id — nunca em texto claro. Nosso sistema passa por firewall (Cloudflare WAF)
              e proteção contra DDoS.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink mb-2">7. Contato</h2>
            <p>
              Dúvidas ou solicitações relacionadas a privacidade:{' '}
              <a href="mailto:privacidade@mikmalencois.com.br" className="text-clay hover:underline">
                privacidade@mikmalencois.com.br
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
