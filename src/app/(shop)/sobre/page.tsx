export default function SobrePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Sobre a Mikma Lençóis</h1>
        <p className="text-lg text-gray-500 mb-12">Qualidade e conforto em cada fio, diretamente de Blumenau para sua casa.</p>

        <div className="grid gap-12">
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Nossa história</h2>
            <p className="text-gray-600 leading-relaxed">
              A Mikma Lençóis nasceu em Blumenau, Santa Catarina — cidade com forte tradição têxtil —
              com o objetivo de levar produtos de cama de alta qualidade diretamente ao consumidor,
              sem intermediários e com preço justo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Nossa proposta</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-2xl p-5">
                <p className="text-2xl mb-2">🧵</p>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Qualidade garantida</h3>
                <p className="text-sm text-gray-500">Tecidos selecionados, costuras reforçadas e acabamento premium.</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-5">
                <p className="text-2xl mb-2">🚚</p>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Entrega rápida</h3>
                <p className="text-sm text-gray-500">Entrega local no mesmo dia via Uber Direct. Todo o Brasil via Correios.</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-5">
                <p className="text-2xl mb-2">💸</p>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Preço justo</h3>
                <p className="text-sm text-gray-500">Venda direta, sem intermediários. Pagamento simples via PIX.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Localização</h2>
            <p className="text-gray-600">
               — Garcia<br />
              Blumenau, SC · CEP 
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Contato</h2>
            <p className="text-gray-600">
              E-mail:{' '}
              <a href="mailto:" className="text-indigo-600 hover:underline">
                
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
