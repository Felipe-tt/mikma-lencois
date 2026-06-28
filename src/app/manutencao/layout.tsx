export default function ManutencaoLayout({ children }: { children: React.ReactNode }) {
  return <body className="theme-locked" style={{ margin: 0, padding: 0 }}>{children}</body>;
}
