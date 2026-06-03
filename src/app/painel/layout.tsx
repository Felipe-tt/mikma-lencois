import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebar } from '@/components/painel/PainelSidebar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <div className="flex min-h-screen bg-stone-50">
        <PainelSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-8 py-10">
            {children}
          </div>
        </main>
      </div>
    </PainelGuard>
  );
}
