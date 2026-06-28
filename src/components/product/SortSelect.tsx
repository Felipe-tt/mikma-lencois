'use client';

interface Props { current?: string; }

export function SortSelect({ current }: Props) {
  const options = [
    { value: '',           label: 'Mais recentes' },
    { value: 'preco_asc',  label: 'Menor preço' },
    { value: 'preco_desc', label: 'Maior preço' },
  ];

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    if (e.target.value) url.searchParams.set('ordem', e.target.value);
    else url.searchParams.delete('ordem');
    window.location.href = url.toString();
  }

  return (
    <select
      defaultValue={current ?? ''}
      onChange={handleChange}
      className="text-[12px] text-mid border border-mist bg-paper px-3 py-2 cursor-pointer hover:border-ink/20 transition-colors focus:outline-none focus:border-clay/40 rounded-[2px]"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
