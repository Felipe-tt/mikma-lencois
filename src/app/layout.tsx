import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
