/**
 * Serializa dados do Firestore para plain objects seguros para RSC->Client.
 * Converte Timestamp, DocumentReference e qualquer objeto com protótipo especial.
 */
export function serialize<T>(data: unknown): T {
  if (data === null || data === undefined) return data as T;
  if (typeof data !== 'object') return data as T;

  // Firestore Timestamp
  if ('toDate' in (data as object) && typeof (data as Record<string, unknown>).toDate === 'function') {
    return ((data as Record<string, unknown>).toDate as () => Date)().toISOString() as unknown as T;
  }

  // Array
  if (Array.isArray(data)) {
    return data.map((item) => serialize(item)) as unknown as T;
  }

  // Plain object
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data as object)) {
    result[key] = serialize((data as Record<string, unknown>)[key]);
  }
  return result as unknown as T;
}

/**
 * Produto como vai para a loja (HTML, cache, API pública): sem o preço da
 * loja física, que só a equipe vê (ver /api/painel/preco/[id]).
 */
export function publicProduct<T>(data: Record<string, unknown>): T {
  const { storePrice: _storePrice, ...rest } = data;
  void _storePrice;
  return serialize<T>(rest);
}
