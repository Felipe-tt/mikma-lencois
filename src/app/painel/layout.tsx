import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebar } from '@/components/painel/PainelSidebar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <div className="flex min-h-screen bg-paper">
        <PainelSidebar />
        <main className="flex-1 min-w-0 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </PainelGuard>
  );
}
