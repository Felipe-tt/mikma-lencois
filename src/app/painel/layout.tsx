import { PainelGuard } from '@/components/painel/PainelGuard';
import { PainelSidebarWrapper } from '@/components/painel/PainelSidebarWrapper';
import { PainelReconnectingBanner } from '@/components/painel/PainelReconnecting';
import { PainelPushOptIn } from '@/components/painel/PainelPushOptIn';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PainelGuard>
      <PainelReconnectingBanner />
      <PainelSidebarWrapper>
        <PainelPushOptIn />
        {children}
      </PainelSidebarWrapper>
    </PainelGuard>
  );
}
