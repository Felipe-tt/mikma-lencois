import { packageLineText, type PackageLine } from '@/lib/packageContents';

/**
 * "Esta embalagem contém", no formato do cartão que vai dentro do pacote.
 * Sem estado: serve na página do produto, no modal de medidas e na
 * pré-visualização do painel.
 */
export function PackageContents({ lines, compact = false }: { lines: PackageLine[]; compact?: boolean }) {
  if (!lines.length) return null;
  return (
    <ul className={`divide-y divide-mist ${compact ? '' : 'border-y border-mist'}`}>
      {lines.map(line => (
        <li key={line.size} className={compact ? 'py-3 px-5' : 'py-3.5'}>
          <p className="text-[13px] font-semibold text-ink">{line.size}</p>
          <p className="text-[13px] text-mid mt-0.5 leading-snug">{packageLineText(line)}</p>
          {line.mattress && (
            <p className="text-[11.5px] text-faint mt-1">Serve em colchão de {line.mattress}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
