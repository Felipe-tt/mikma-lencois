import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: { default: 'Mikma Lençóis — Blumenau SC', template: '%s | Mikma Lençóis' },
  description: 'Lençóis, jogos de cama e toalhas direto da fábrica. Entrega em Blumenau em 1h ou para todo o Brasil.',
  keywords: ['lençóis', 'jogos de cama', 'cama mesa banho', 'blumenau', 'mikma'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://mikmalencois.com.br',
    siteName: 'Mikma Lençóis',
    images: [{ url: '/logo.png', width: 400, height: 400, alt: 'Mikma Lençóis' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
