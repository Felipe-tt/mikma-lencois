export default function ManutencaoLayout({ children }: { children: React.ReactNode }) {
  // div e não <body>: o layout raiz já abre o <body>, e um segundo dentro
  // dele é descartado pelo navegador, o que fazia o React acusar erro de
  // hidratação e redesenhar a página inteira.
  return <div className="theme-locked">{children}</div>;
}
