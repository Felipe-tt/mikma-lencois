import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebar } from '@/components/painel/PainelSidebar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--white)' }}>
        <PainelSidebar />
        <main style={{ flex: 1, padding: '36px 40px', background: 'var(--white)', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </PainelGuard>
  );
}
