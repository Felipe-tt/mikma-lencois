import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--white)', flexDirection: 'column', gap: 16, textAlign: 'center', padding: 24 }}>
      <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 80, fontWeight: 300, color: 'var(--cream-d)', lineHeight: 1 }}>404</p>
      <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, fontWeight: 300, color: 'var(--ink)' }}>Página não encontrada</h1>
      <p style={{ fontSize: 14, color: 'var(--ink-l)', maxWidth: 320 }}>A página que você procura não existe ou foi movida.</p>
      <Link href="/" className="btn-primary" style={{ marginTop: 12 }}>Voltar ao início</Link>
    </div>
  );
}
