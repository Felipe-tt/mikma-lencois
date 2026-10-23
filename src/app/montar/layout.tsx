import type { Metadata } from 'next';

// Página de quem abriu o link "Montar junto": sem cabeçalho nem rodapé da
// loja, pra ficar só no carrinho.
export const metadata: Metadata = {
  title: 'Montar junto',
  robots: { index: false, follow: false },
};

export default function MontarLayout({ children }: { children: React.ReactNode }) {
  return <main id="conteudo" className="min-h-screen bg-paper">{children}</main>;
}
