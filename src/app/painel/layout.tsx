import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebarWrapper } from '@/components/painel/PainelSidebarWrapper';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <PainelSidebarWrapper>
        {children}
      </PainelSidebarWrapper>
    </PainelGuard>
  );
}
