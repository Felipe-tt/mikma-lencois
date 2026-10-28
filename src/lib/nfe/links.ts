import type { NfeRecord } from './types';

/** Link assinado da DANFE (PDF) ou do XML de uma nota autorizada. */
export function nfeDocUrl(orderId: string, rec: NfeRecord | undefined, tipo: 'danfe' | 'xml'): string | null {
  if (!rec?.docToken || (rec.status !== 'autorizada' && rec.status !== 'cancelada')) return null;
  const q = new URLSearchParams({ o: orderId, e: rec.environment, t: rec.docToken, tipo });
  return `/api/nfe/documento?${q}`;
}
