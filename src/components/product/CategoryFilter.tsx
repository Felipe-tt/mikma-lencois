'use client';
import { useRouter, useSearchParams } from 'next/navigation';

interface Props { categories: string[]; active?: string; }

export function CategoryFilter({ categories, active }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(cat?: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat) params.set('categoria', cat);
    else params.delete('categoria');
    router.push(`/produtos?${params.toString()}`);
  }

  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warm-d)', marginBottom: 16 }}>
        Categoria
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <li>
          <button onClick={() => go()} style={{
            width: '100%', textAlign: 'left', background: !active ? 'var(--ink)' : 'transparent',
            color: !active ? 'var(--white)' : 'var(--ink-m)',
            border: 'none', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
            fontWeight: !active ? 500 : 400, transition: 'all 0.15s'
          }}>
            Todos
          </button>
        </li>
        {categories.map(cat => (
          <li key={cat}>
            <button onClick={() => go(cat)} style={{
              width: '100%', textAlign: 'left',
              background: active === cat ? 'var(--ink)' : 'transparent',
              color: active === cat ? 'var(--white)' : 'var(--ink-m)',
              border: 'none', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
              fontWeight: active === cat ? 500 : 400, transition: 'all 0.15s'
            }}>
              {cat}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
