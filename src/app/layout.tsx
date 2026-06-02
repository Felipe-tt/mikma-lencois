import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: {
    default: 'Mikma Lençóis — Blumenau SC',
    template: '%s | Mikma Lençóis',
  },
  description:
    'Lençóis, jogos de cama e toalhas com qualidade premium. Entrega em todo o Brasil. Blumenau, SC.',
  keywords: ['lençóis', 'jogos de cama', 'cama mesa banho', 'blumenau', 'mikma'],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://mikmalencois.com.br',
    siteName: 'Mikma Lençóis',
  },
};

// Usa Inter localmente via @fontsource-variable/inter — sem chamada de rede no build
const inter = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource-variable/inter/files/inter-latin-standard-normal.woff2',
      weight: '100 900',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
