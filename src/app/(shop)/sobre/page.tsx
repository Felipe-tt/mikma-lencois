export default function SobrePage() {
  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Nossa história</span>
          <h1 className="font-display font-normal text-ink" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>
            Sobre a<br/><em className="text-clay">Mikma Lençóis</em>
          </h1>
        </div>
      </div>

      <div className="container-shop py-16 max-w-3xl">
        <div className="flex flex-col gap-8 mb-16">
          <p className="text-lg text-mid leading-relaxed">
            A Mikma Lençóis nasceu em Blumenau, SC, com o objetivo de oferecer produtos de cama, mesa e banho com qualidade superior, acessíveis e entregues com agilidade.
          </p>
          <p className="text-base text-mid leading-relaxed">
            Localizada na , no bairro Garcia, operamos com entrega local em até 1 hora via Uber Direct para endereços em Blumenau, e também enviamos para todo o Brasil com rastreamento em tempo real.
          </p>
          <p className="text-base text-mid leading-relaxed">
            Todos os pagamentos são processados via PIX com confirmação automática, garantindo praticidade para você.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-mist mb-12">
          {[
            { label:'Localização', value:'Blumenau, SC' },
            { label:'Entrega local', value:'Até 1 hora' },
            { label:'Cobertura', value:'Todo o Brasil' },
          ].map(({label,value}) => (
            <div key={label} className="bg-paper px-6 py-8">
              <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-3">{label}</p>
              <p className="font-display text-2xl text-ink font-normal">{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-warm border border-mist p-8">
          <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-4">Endereço</p>
          <p className="text-base text-mid leading-relaxed">
            <br/>
            Garcia · Blumenau, SC<br/>
            CEP 
          </p>
        </div>
      </div>
    </div>
  );
}
