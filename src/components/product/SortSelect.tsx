'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/Select';

interface Props { current?: string; }

export function SortSelect({ current }: Props) {
  const options = [
    { value: '',           label: 'Mais recentes' },
    { value: 'preco_asc',  label: 'Menor preço' },
    { value: 'preco_desc', label: 'Maior preço' },
  ];

  const router = useRouter();

  // Navegação do Next em vez de recarregar a página inteira; volta pra
  // primeira página da lista quando muda a ordem.
  function handleChange(value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('ordem', value);
    else url.searchParams.delete('ordem');
    url.searchParams.delete('pagina');
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  }

  return (
    <Select
      value={current ?? ''}
      onChange={handleChange}
      options={options}
      fitContentEnd
      ariaLabel="Ordenar produtos"
      triggerClassName="h-10 text-[12.5px] text-ink border border-mist-d bg-paper pl-4 pr-3 cursor-pointer hover:bg-warm transition-colors rounded-full flex items-center justify-between gap-2 min-w-[150px]"
    />
  );
}
