import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Mikma Lençóis · Blumenau, SC
          </p>
          <nav className="flex gap-5 text-sm text-gray-400">
            <Link href="/privacidade" className="hover:text-gray-700 transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/termos" className="hover:text-gray-700 transition-colors">
              Termos de Uso
            </Link>
            <a href="mailto:" className="hover:text-gray-700 transition-colors">
              Contato
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
