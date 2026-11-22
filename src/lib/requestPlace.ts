import { cameThroughEdge } from '@/lib/ip';

type Headers = { get(name: string): string | null };

/**
 * A Cloudflare manda cidade e região em UTF-8, mas o Node lê header byte a
 * byte (latin1): "São Paulo" chegava "SÃ£o Paulo". Desfaz isso quando o
 * texto é UTF-8 válido; senão devolve como veio.
 */
export function headerText(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!/[\u0080-ÿ]/.test(v)) return v;
  const fixed = Buffer.from(v, 'latin1').toString('utf8');
  return fixed.includes('�') ? v : fixed;
}

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 60).trim();

function countryName(code: string): string {
  if (code === 'T1') return 'rede Tor';
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX') return '';
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * De onde veio a requisição, para e-mail de segurança ("Blumenau, SC,
 * Brasil"). Usa os headers de local da Cloudflare só quando a requisição
 * provou que passou por ela: quem chamasse a hospedagem direto escolheria a
 * cidade que aparece no e-mail. null quando não dá para saber.
 */
export function requestPlace(headers: Headers): string | null {
  if (!cameThroughEdge(headers)) return null;
  const city = clean(headerText(headers.get('cf-ipcity')));
  const region = clean(headerText(headers.get('cf-region-code')));
  const country = countryName((headers.get('cf-ipcountry') ?? '').trim().toUpperCase());
  const parts = [city, /^[A-Z0-9]{1,3}$/.test(region) ? region : '', country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * País da requisição em código ISO ("BR"; "T1" é a rede Tor), só de header
 * provado da Cloudflare, como requestPlace. null quando não dá para saber.
 */
export function requestCountry(headers: Headers): string | null {
  if (!cameThroughEdge(headers)) return null;
  const code = (headers.get('cf-ipcountry') ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9]$/.test(code) && code !== 'XX' ? code : null;
}
