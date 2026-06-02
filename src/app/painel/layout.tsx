import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebar } from '@/components/painel/PainelSidebar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <div className="flex min-h-screen bg-paper">
        <PainelSidebar />
        <main className="flex-1 px-10 py-9 overflow-y-auto bg-paper">
          {children}
        </main>
      </div>
    </PainelGuard>
  );
}
