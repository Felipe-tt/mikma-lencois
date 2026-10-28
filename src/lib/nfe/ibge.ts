/**
 * Código IBGE do município pelo CEP (a NF-e exige o código, não o nome).
 * ViaCEP é gratuito e não precisa de chave. Guarda em memória por instância.
 */
const cache = new Map<string, string>();

export async function ibgeFromCep(cep: string, uf: string): Promise<string | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const hit = cache.get(digits);
  if (hit) return hit;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { ibge?: string; uf?: string; erro?: boolean | string };
    if (data.erro || !data.ibge || !/^\d{7}$/.test(data.ibge)) return null;
    // Código IBGE começa pelo código da UF: confere se o CEP é mesmo do estado informado.
    if (data.uf && uf && data.uf.toUpperCase() !== uf.toUpperCase()) return null;
    cache.set(digits, data.ibge);
    return data.ibge;
  } catch {
    return null;
  }
}
