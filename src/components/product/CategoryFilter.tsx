'use client';
import { useRouter, useSearchParams } from 'next/navigation';

interface Props {
  categories: string[];
  active?: string;
  onClose?: () => void;
}

export function CategoryFilter({ categories, active, onClose }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(cat?: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat) params.set('categoria', cat);
    else params.delete('categoria');
    router.push(`/produtos?${params.toString()}`);
    onClose?.();
  }

  const items = [
    { label: 'Todos', value: undefined },
    ...categories.map(c => ({ label: c, value: c })),
  ];

  return (
    <div>
      <p className="eyebrow text-stone-500 mb-4">Categoria</p>
      <ul className="flex flex-col gap-0.5">
        {items.map(({ label, value }) => {
          const isActive = value === active;
          return (
            <li key={label}>
              <button
                onClick={() => navigate(value)}
                className={`w-full text-left px-3 py-2.5 text-sm border-l-2 transition-colors duration-150
                  ${isActive
                    ? 'border-l-gold-600 text-stone-900 font-semibold bg-stone-100'
                    : 'border-l-transparent text-stone-500 font-normal hover:text-stone-900 hover:bg-stone-100'
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
