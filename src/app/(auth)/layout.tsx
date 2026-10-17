// Sem force-dynamic: manutenção é verificada no middleware (Edge).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // <main> pra entrar/cadastro terem um landmark (antes não tinham nenhum).
  return <main>{children}</main>;
}
