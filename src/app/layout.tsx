import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { ThemeScript } from '@/components/ThemeScript';
import { Analytics } from '@/components/Analytics';
import { fontSans, fontDisplay } from '@/lib/fonts';
import { baseOpenGraph } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mikma.com.br'),
  title: { default: 'Mikma Lençóis · Lençóis direto da fábrica em Blumenau', template: '%s | Mikma Lençóis' },
  description: 'Lençóis, fronhas e jogos de cama direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
  keywords: ['lençóis', 'fronhas', 'jogos de cama', 'blumenau', 'mikma'],
  icons: {
    icon: [
      // Todos com fundo escuro da marca: a lua é clara, e o Google mostra o
      // ícone num círculo branco (transparente, a lua sumia no resultado).
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/favicon-48-google.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-96-google.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-192-google.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    ...baseOpenGraph,
    url: '/',
    title: 'Mikma Lençóis · Lençóis direto da fábrica em Blumenau',
    description: 'Lençóis, fronhas e jogos de cama direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mikma Lençóis · Lençóis direto da fábrica em Blumenau',
    description: 'Lençóis, fronhas e jogos de cama direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
    images: ['/og-image.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" className={`${fontSans.variable} ${fontDisplay.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body suppressHydrationWarning>
        <Analytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
