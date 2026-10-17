import type { Metadata } from 'next';

// A página é client component e não pode exportar metadata: sem este
// layout ela herdava o título da home. Fora do índice dos buscadores.
export const metadata: Metadata = {
  title: 'Criar conta',
  robots: { index: false, follow: false },
};

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
