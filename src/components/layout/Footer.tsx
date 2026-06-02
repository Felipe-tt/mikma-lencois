import Link from 'next/link';

export function Footer() {
  return (
    <footer style={{ background: 'var(--ink)', color: 'var(--cream)', marginTop: 'auto' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div style={{ padding: '56px 0 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 40 }}>
          {/* Brand */}
          <div>
            <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20, fontWeight: 400, letterSpacing: '0.04em', marginBottom: 8 }}>
              Mikma <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--warm)', verticalAlign: 'middle' }}>Lençóis</span>
            </p>
            <p style={{ fontSize: 12, color: 'rgba(245,240,232,0.55)', lineHeight: 1.7 }}>
              <br />
              Garcia · Blumenau, SC
            </p>
          </div>

          {/* Loja */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warm)', marginBottom: 14 }}>Loja</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><Link href="/produtos" style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', textDecoration: 'none' }} className="hover:text-cream transition-colors">Produtos</Link></li>
              <li><Link href="/sobre" style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', textDecoration: 'none' }} className="hover:text-cream transition-colors">Sobre nós</Link></li>
            </ul>
          </div>

          {/* Conta */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warm)', marginBottom: 14 }}>Conta</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><Link href="/conta/pedidos" style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', textDecoration: 'none' }} className="hover:text-cream transition-colors">Meus pedidos</Link></li>
              <li><Link href="/conta" style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', textDecoration: 'none' }} className="hover:text-cream transition-colors">Meu perfil</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warm)', marginBottom: 14 }}>Legal</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><Link href="/privacidade" style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', textDecoration: 'none' }} className="hover:text-cream transition-colors">Privacidade (LGPD)</Link></li>
              <li><Link href="/termos" style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', textDecoration: 'none' }} className="hover:text-cream transition-colors">Termos de uso</Link></li>
            </ul>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(245,240,232,0.1)', padding: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.04em' }}>
            © {new Date().getFullYear()} Mikma Lençóis. Todos os direitos reservados.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(245,240,232,0.25)' }}>Blumenau, SC · Brasil</p>
        </div>
      </div>
    </footer>
  );
}
