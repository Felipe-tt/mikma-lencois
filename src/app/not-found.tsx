import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6 gap-4">
      <p className="font-display text-[8rem] text-mist font-normal leading-none select-none">404</p>
      <h1 className="font-display text-3xl font-normal text-ink -mt-4">Página não encontrada</h1>
      <p className="text-sm text-mid max-w-xs">A página que você procura não existe ou foi movida.</p>
      <Link href="/" className="btn-primary mt-4">Voltar ao início</Link>
    </div>
  );
}
