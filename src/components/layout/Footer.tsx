import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Mikma Lençóis</p>
            <p className="mt-2 text-xs text-gray-500">
              
              <br />
              Garcia — Blumenau, SC
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Loja</p>
            <ul className="mt-2 space-y-1">
              <li>
                <Link href="/produtos" className="text-xs text-gray-500 hover:text-gray-900">
                  Produtos
                </Link>
              </li>
              <li>
                <Link href="/sobre" className="text-xs text-gray-500 hover:text-gray-900">
                  Sobre nós
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Conta</p>
            <ul className="mt-2 space-y-1">
              <li>
                <Link href="/conta/pedidos" className="text-xs text-gray-500 hover:text-gray-900">
                  Meus pedidos
                </Link>
              </li>
              <li>
                <Link href="/conta" className="text-xs text-gray-500 hover:text-gray-900">
                  Meu perfil
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Legal</p>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href="/privacidade"
                  className="text-xs text-gray-500 hover:text-gray-900"
                >
                  Privacidade (LGPD)
                </Link>
              </li>
              <li>
                <Link href="/termos" className="text-xs text-gray-500 hover:text-gray-900">
                  Termos de uso
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-6">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} Mikma Lençóis. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
