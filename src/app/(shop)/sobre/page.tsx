export default function SobrePage() {
  return (
    <div style={{ background: 'var(--white)' }}>
      <div style={{ borderBottom: '1px solid var(--cream-d)', background: 'var(--cream)', padding: '64px 0' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="section-label" style={{ marginBottom: 12 }}>Nossa história</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 300, color: 'var(--ink)', lineHeight: 1.15 }}>
            Sobre a Mikma Lençóis
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 64, paddingBottom: 96 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <p style={{ fontSize: 16, color: 'var(--ink-m)', lineHeight: 1.85 }}>
            A Mikma Lençóis nasceu em Blumenau, SC, com o objetivo de oferecer produtos de cama, mesa e banho com qualidade superior, acessíveis e entregues com agilidade.
          </p>
          <p style={{ fontSize: 15, color: 'var(--ink-l)', lineHeight: 1.85 }}>
            Localizada na , no bairro Garcia, operamos com entrega local em até 1 hora via Uber Direct para endereços em Blumenau, e também enviamos para todo o Brasil pelo PAC, SEDEX e transportadoras parceiras com rastreamento em tempo real.
          </p>
          <p style={{ fontSize: 15, color: 'var(--ink-l)', lineHeight: 1.85 }}>
            Todos os pagamentos são processados via PIX com confirmação automática do pedido, garantindo praticidade para você e para nós.
          </p>
        </div>

        <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--cream-d)' }}>
          {[
            { label: 'Localização', value: 'Blumenau, SC' },
            { label: 'Entrega local', value: 'Até 1 hora' },
            { label: 'Cobertura', value: 'Todo o Brasil' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--white)', padding: '28px 24px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warm-d)', marginBottom: 8 }}>{label}</p>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: 'var(--ink)', fontWeight: 400 }}>{value}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, padding: '32px', background: 'var(--cream)', border: '1px solid var(--cream-d)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warm-d)', marginBottom: 10 }}>Endereço</p>
          <p style={{ fontSize: 15, color: 'var(--ink-m)', lineHeight: 1.7 }}>
            <br />
            Garcia · Blumenau, SC · CEP 
          </p>
        </div>
      </div>
    </div>
  );
}
