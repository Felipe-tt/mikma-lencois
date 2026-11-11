/**
 * Data de entrega prevista a partir do prazo em dias úteis (sábado e domingo
 * não contam). Mesma conta do checkout, da página do produto e do e-mail de
 * pedido enviado.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

/** "Hoje" ou "sex., 21/11". */
export function estimatedDate(days: number, from = new Date()): string {
  if (days === 0) return 'Hoje';
  return addBusinessDays(from, days).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
