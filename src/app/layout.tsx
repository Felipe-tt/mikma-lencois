import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { ThemeScript } from '@/components/ThemeScript';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mikma.com.br'),
  title: { default: 'Mikma Lençóis · Blumenau SC', template: '%s | Mikma Lençóis' },
  description: 'Lençóis, jogos de cama e toalhas direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
  keywords: ['lençóis', 'jogos de cama', 'cama mesa banho', 'blumenau', 'mikma'],
  icons: {
    icon: [
      // Ícone pequeno (aba do navegador): mantido transparente, como já estava.
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      // Ícones ≥48px: com fundo preto sólido. Buscadores como o Google usam o maior
      // ícone declarado nos resultados de busca; se ele for transparente, o Google
      // preenche o fundo com branco. A aba do navegador não é afetada, pois usa o
      // favicon.ico pequeno acima.
      { url: '/favicon-48-google.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-96-google.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-192-google.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://mikma.com.br',
    siteName: 'Mikma Lençóis',
    title: 'Mikma Lençóis · Blumenau SC',
    description: 'Lençóis, jogos de cama e toalhas direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Mikma Lençóis · Lençóis e jogos de cama' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mikma Lençóis · Blumenau SC',
    description: 'Lençóis, jogos de cama e toalhas direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
    images: ['/og-image.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon-48-google.png" type="image/png" sizes="48x48" />
        <link rel="icon" href="/favicon-96-google.png" type="image/png" sizes="96x96" />
        <link rel="icon" href="/favicon-192-google.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
