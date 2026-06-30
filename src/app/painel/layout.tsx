import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebarWrapper } from '@/components/painel/PainelSidebarWrapper';
import { PainelNavProgressProvider } from '@/components/painel/PainelNavProgress';
import { PainelReconnectingBanner } from '@/components/painel/PainelReconnecting';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <PainelNavProgressProvider>
        <PainelReconnectingBanner />
        <PainelSidebarWrapper>
          {children}
        </PainelSidebarWrapper>
      </PainelNavProgressProvider>
    </PainelGuard>
  );
}
