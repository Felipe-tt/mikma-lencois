export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Converte Firestore Timestamp { seconds, nanoseconds } ou string ISO para Date */
export function tsToDate(val: unknown): Date {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  if (typeof val === 'object' && 'seconds' in (val as object)) {
    return new Date((val as { seconds: number }).seconds * 1000);
  }
  return new Date(0);
}

export function formatTs(val: unknown): string {
  return formatDate(tsToDate(val).toISOString());
}

export function formatTsDateTime(val: unknown): string {
  return formatDateTime(tsToDate(val).toISOString());
}
