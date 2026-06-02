'use client';
import { useRouter, useSearchParams } from 'next/navigation';

interface Props { categories: string[]; active?: string; }

export function CategoryFilter({ categories, active }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(cat?: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat) params.set('categoria', cat); else params.delete('categoria');
    router.push(`/produtos?${params.toString()}`);
  }

  const all = [{ label: 'Todos', value: undefined }, ...categories.map(c => ({ label: c, value: c }))];

  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-warm-dark mb-4">Categoria</p>
      <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
        {all.map(({ label, value }) => {
          const isActive = value === active;
          return (
            <li key={label}>
              <button
                onClick={() => go(value)}
                className={`w-full text-left px-3 py-2 text-[13px] border-l-2 transition-all duration-150 bg-transparent border-none cursor-pointer
                  ${isActive
                    ? 'border-l-warm-dark text-ink font-semibold bg-cream'
                    : 'border-l-transparent text-ink-mid font-normal hover:text-ink hover:bg-cream/60'
                  }`}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
