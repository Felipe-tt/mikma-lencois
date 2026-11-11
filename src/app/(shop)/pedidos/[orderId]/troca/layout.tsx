import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Troca ou devolução',
  robots: { index: false, follow: false },
};

export default function TrocaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
