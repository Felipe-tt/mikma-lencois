// Sem force-dynamic: manutenção é verificada no middleware (Edge).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
