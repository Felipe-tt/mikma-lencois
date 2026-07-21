'use client';

import { Select } from '@/components/ui/Select';

interface Props { current?: string; }

export function SortSelect({ current }: Props) {
  const options = [
    { value: '',           label: 'Mais recentes' },
    { value: 'preco_asc',  label: 'Menor preço' },
    { value: 'preco_desc', label: 'Maior preço' },
  ];

  function handleChange(value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('ordem', value);
    else url.searchParams.delete('ordem');
    window.location.href = url.toString();
  }

  return (
    <Select
      value={current ?? ''}
      onChange={handleChange}
      options={options}
      triggerClassName="text-[12px] text-mid border border-mist bg-paper px-3 py-2 cursor-pointer hover:border-ink/20 transition-colors focus:outline-none focus:border-clay/40 rounded-[2px] flex items-center justify-between gap-2 min-w-[150px]"
    />
  );
}
