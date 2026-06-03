/**
 * Serializa dados do Firestore para plain objects seguros para RSC→Client.
 * Converte Timestamp, DocumentReference e qualquer objeto com protótipo especial.
 */
export function serialize<T>(data: unknown): T {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  // Firestore Timestamp
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString() as unknown as T;
  }

  // Array
  if (Array.isArray(data)) {
    return data.map(serialize) as unknown as T;
  }

  // Plain object / DocumentData
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data as object)) {
    result[key] = serialize((data as Record<string, unknown>)[key]);
  }
  return result as T;
}
