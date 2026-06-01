'use client';

import { useRouter, usePathname } from 'next/navigation';

interface Props {
  categories: string[];
  active?: string;
}

export function CategoryFilter({ categories, active }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function select(cat: string | undefined) {
    const params = new URLSearchParams();
    if (cat) params.set('categoria', cat);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (categories.length === 0) return null;

  return (
    <nav aria-label="Filtrar por categoria">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Categoria
      </p>
      <ul className="space-y-1">
        <li>
          <button
            onClick={() => select(undefined)}
            className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${
              !active
                ? 'bg-blue-50 font-medium text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Todas
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat}>
            <button
              onClick={() => select(cat)}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${
                active === cat
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
