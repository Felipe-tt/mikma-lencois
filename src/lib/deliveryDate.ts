/**
 * Data de entrega prevista a partir do prazo em dias úteis. Não contam
 * sábado, domingo e os feriados nacionais em que os Correios não entregam
 * (inclui Carnaval, Sexta-feira Santa e Corpus Christi). Mesma conta do
 * checkout, da página do produto e do e-mail de pedido enviado.
 *
 * A conta é feita no calendário de Brasília: no servidor (UTC), um pedido
 * das 22h saía com um dia a mais.
 */
const TZ = 'America/Sao_Paulo';
const DAY = 86_400_000;

/** Dia do calendário de Brasília, como data UTC ao meio-dia. */
function brasiliaDay(d: Date): Date {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), ao meio-dia UTC. */
function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

const FIXED_HOLIDAYS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
const holidayCache = new Map<number, Set<string>>();

/** Feriados nacionais do ano, como "MM-DD". */
function holidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (set) return set;
  const e = easter(year).getTime();
  const mmdd = (t: number) => new Date(t).toISOString().slice(5, 10);
  // Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi.
  set = new Set([...FIXED_HOLIDAYS, mmdd(e - 48 * DAY), mmdd(e - 47 * DAY), mmdd(e - 2 * DAY), mmdd(e + 60 * DAY)]);
  holidayCache.set(year, set);
  return set;
}

/** Dia útil para entrega: nem fim de semana nem feriado nacional. */
export function isBusinessDay(d: Date): boolean {
  const day = brasiliaDay(d);
  const wd = day.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(day.getUTCFullYear()).has(day.toISOString().slice(5, 10));
}

export function addBusinessDays(from: Date, days: number): Date {
  const d = brasiliaDay(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return d;
}

/** "Hoje" ou "sex., 21/11". */
export function estimatedDate(days: number, from = new Date()): string {
  if (days === 0) return 'Hoje';
  return addBusinessDays(from, days).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ });
}
