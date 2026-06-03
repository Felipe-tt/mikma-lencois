'use client';
import { useRouter, useSearchParams } from 'next/navigation';

export function CategoryFilter({ categories, active }: { categories: string[]; active?: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(cat?: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat) params.set('categoria', cat); else params.delete('categoria');
    router.push(`/produtos?${params.toString()}`);
  }

  return (
    <div>
      <p className="text-2xs font-bold tracking-[0.2em] uppercase text-faint mb-4">Categoria</p>
      <ul className="flex flex-col gap-0.5">
        {[{ label: 'Todos', value: undefined }, ...categories.map(c => ({ label: c, value: c }))].map(({ label, value }) => {
          const isActive = active === value;
          return (
            <li key={label}>
              <button onClick={() => go(value)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-all duration-200 font-medium
                  ${isActive
                    ? 'bg-ink text-paper'
                    : 'text-mid hover:text-ink hover:bg-warm'
                  }`}>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
