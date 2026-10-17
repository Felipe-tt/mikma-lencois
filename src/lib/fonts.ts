import { DM_Serif_Display, Inter } from 'next/font/google';

// Fontes servidas pelo próprio site (next/font): antes vinham de um @import
// do Google Fonts no CSS, que bloqueava a renderização (HTML → CSS → CSS do
// Google → arquivos de fonte, em dois domínios a mais) e trocava a fonte do
// título sem ajuste de métricas. Os nomes das variáveis são usados no
// tailwind.config (font-sans / font-display).
export const fontSans = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const fontDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-dm-serif',
});
