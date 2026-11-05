import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebarWrapper } from '@/components/painel/PainelSidebarWrapper';
import { PainelReconnectingBanner } from '@/components/painel/PainelReconnecting';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <PainelReconnectingBanner />
      <PainelSidebarWrapper>
        {children}
      </PainelSidebarWrapper>
    </PainelGuard>
  );
}
