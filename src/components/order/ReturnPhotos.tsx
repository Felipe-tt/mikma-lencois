'use client';

import { useEffect, useState } from 'react';

/**
 * Fotos que o cliente mandou com o pedido de troca. Ficam numa pasta
 * privada do Storage (só o cliente e a equipe leem), então o endereço de
 * cada uma é pedido na hora. Toque abre a foto inteira.
 */
export function ReturnPhotos({ paths, size = 64 }: { paths?: string[]; size?: number }) {
  const [urls, setUrls] = useState<(string | null)[] | null>(null);

  useEffect(() => {
    if (!paths?.length) return;
    let vivo = true;
    (async () => {
      const [{ storage }, { ref, getDownloadURL }] = await Promise.all([import('@/lib/firebase/storage'), import('firebase/storage')]);
      const out = await Promise.all(paths.map(p => getDownloadURL(ref(storage, p)).catch(() => null)));
      if (vivo) setUrls(out);
    })().catch(() => { if (vivo) setUrls(paths.map(() => null)); });
    return () => { vivo = false; };
  }, [paths]);

  if (!paths?.length) return null;
  return (
    <ul aria-label="Fotos enviadas pelo cliente" className="flex flex-wrap gap-2">
      {paths.map((p, i) => {
        const url = urls?.[i];
        return (
          <li key={p}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-mist hover:border-ink transition-colors">
                <img src={url} alt={`Foto ${i + 1} do cliente`} width={size} height={size} className="object-cover" style={{ width: size, height: size }} />
              </a>
            ) : (
              <span className="block rounded-lg bg-warm border border-mist" style={{ width: size, height: size }} aria-label={urls ? 'Foto indisponível' : 'Carregando foto'} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
