import Image from 'next/image';

/**
 * Fronha trocada no item do carrinho/checkout: miniatura da fronha e
 * "Fronha trocada por Verde", em vez do texto cru "Par de Fronhas".
 */
export function SwapNote({ note, image, small = false }: { note?: string; image?: string; small?: boolean }) {
  if (!note) return null;
  // "Fronha trocada: Fronhas Verde" vira "Fronhas trocadas por Verde".
  const m = note.match(/^Fronha trocada:\s*(Fronhas?)\s+(.+)$/i);
  const text = m ? `${/s$/i.test(m[1]) ? 'Fronhas trocadas' : 'Fronha trocada'} por ${m[2]}` : note;
  return (
    <p className={`mt-1 inline-flex items-center gap-1.5 font-medium text-clay ${small ? 'text-[11px]' : 'text-xs'}`}>
      {image && (
        <span className="relative block w-5 h-5 shrink-0 overflow-hidden rounded-md border border-mist bg-warm">
          <Image src={image} alt="" fill sizes="20px" className="object-cover" />
        </span>
      )}
      {text}
    </p>
  );
}
