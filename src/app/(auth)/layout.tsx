import { checkMaintenance } from '@/lib/maintenanceCheck';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await checkMaintenance();
  return <>{children}</>;
}
