import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center px-4">
        <p className="text-6xl font-bold text-indigo-600 mb-4">404</p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Página não encontrada</h1>
        <p className="text-gray-500 mb-8">O endereço que você acessou não existe ou foi removido.</p>
        <Link
          href="/"
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
        >
          Voltar para a loja
        </Link>
      </div>
    </div>
  );
}
