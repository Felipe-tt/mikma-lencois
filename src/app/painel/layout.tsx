import { PainelSidebar } from '@/components/painel/PainelSidebar';
import { PainelGuard } from '@/components/painel/PainelGuard';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <div className="flex min-h-screen bg-gray-50">
        <PainelSidebar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </PainelGuard>
  );
}
