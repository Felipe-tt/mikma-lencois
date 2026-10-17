'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Props { categories: string[]; active?: string; onClose?: () => void; }

function Filter({ categories, active, onClose }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(cat?: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat) params.set('categoria', cat); else params.delete('categoria');
    router.push(`/produtos?${params.toString()}`);
    onClose?.();
  }

  return (
    <div>
      <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-faint mb-4">Categoria</p>
      <ul className="flex flex-col gap-0.5">
        {[{ label: 'Todos', value: undefined }, ...categories.map(c => ({ label: c, value: c }))].map(({ label, value }) => {
          const isActive = active === value;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => go(value)}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full text-left rounded-xl px-4 py-2.5 text-sm transition-[background-color,color] duration-150 font-medium active:bg-warm-d ${isActive ? 'bg-ink text-paper active:bg-ink' : 'text-mid hover:text-ink hover:bg-warm'}`}
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

export function CategoryFilter(props: Props) {
  return <Suspense fallback={null}><Filter {...props} /></Suspense>;
}
