import type { Address } from '@/types';

export const EMPTY_ADDRESS: Address = { cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' };

/**
 * Endereço salvo no perfil, sempre no formato atual. Contas antigas podem
 * ter o endereço como texto (as regras do Firestore ainda aceitam) ou sem
 * algum campo: sem isso o perfil quebrava e o checkout travava na etapa 2.
 * Texto ou valor sem nenhum campo útil vira null (nenhum endereço salvo).
 */
export function toAddress(raw: unknown): Address | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (k: keyof Address) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const a: Address = {
    cep: str('cep'), street: str('street'), number: str('number'), complement: str('complement'),
    neighborhood: str('neighborhood'), city: str('city'), state: str('state'),
  };
  return Object.values(a).some(v => v.trim()) ? a : null;
}

/** Rua e número, sem vírgula sobrando quando falta o número. */
export function streetLine(a: Pick<Address, 'street' | 'number'>): string {
  return [a.street.trim(), a.number.trim()].filter(Boolean).join(', ');
}

/** "Blumenau/SC", ou só o que existir. */
export function cityLine(a: Pick<Address, 'city' | 'state'>): string {
  return [a.city.trim(), a.state.trim()].filter(Boolean).join('/');
}
