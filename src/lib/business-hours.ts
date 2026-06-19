// Modelo de horário de funcionamento — estilo Google Business.
// Cada dia pode ter múltiplos intervalos (ex: 07:00–12:00 e 13:00–17:00).
// Serializado como JSON dentro de StoreSettings.businessHours (string).

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAYS: { key: WeekdayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Segunda-feira', short: 'Seg' },
  { key: 'tue', label: 'Terça-feira',   short: 'Ter' },
  { key: 'wed', label: 'Quarta-feira',  short: 'Qua' },
  { key: 'thu', label: 'Quinta-feira',  short: 'Qui' },
  { key: 'fri', label: 'Sexta-feira',   short: 'Sex' },
  { key: 'sat', label: 'Sábado',        short: 'Sáb' },
  { key: 'sun', label: 'Domingo',       short: 'Dom' },
];

export interface TimeRange {
  open: string;  // "HH:mm", 24h
  close: string; // "HH:mm", 24h
}

export interface DayHours {
  closed: boolean;
  ranges: TimeRange[]; // ignorado se closed = true
}

export type BusinessHours = Record<WeekdayKey, DayHours>;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { closed: false, ranges: [{ open: '08:00', close: '18:00' }] },
  tue: { closed: false, ranges: [{ open: '08:00', close: '18:00' }] },
  wed: { closed: false, ranges: [{ open: '08:00', close: '18:00' }] },
  thu: { closed: false, ranges: [{ open: '08:00', close: '18:00' }] },
  fri: { closed: false, ranges: [{ open: '08:00', close: '18:00' }] },
  sat: { closed: false, ranges: [{ open: '08:00', close: '12:00' }] },
  sun: { closed: true,  ranges: [] },
};

export function parseBusinessHours(json: string | undefined | null): BusinessHours {
  if (!json) return DEFAULT_BUSINESS_HOURS;
  try {
    const parsed = JSON.parse(json);
    // Valida estrutura mínima — se algo estiver corrompido, cai pro default
    const result = {} as BusinessHours;
    for (const { key } of WEEKDAYS) {
      const day = parsed[key];
      if (day && typeof day === 'object' && Array.isArray(day.ranges)) {
        result[key] = {
          closed: !!day.closed,
          ranges: day.ranges
            .filter((r: unknown): r is TimeRange =>
              !!r && typeof r === 'object' &&
              typeof (r as TimeRange).open === 'string' &&
              typeof (r as TimeRange).close === 'string'
            ),
        };
      } else {
        result[key] = DEFAULT_BUSINESS_HOURS[key];
      }
    }
    return result;
  } catch {
    return DEFAULT_BUSINESS_HOURS;
  }
}

export function serializeBusinessHours(hours: BusinessHours): string {
  return JSON.stringify(hours);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calcula o status "aberto agora / fechado" considerando o fuso horário
 * informado (IANA, ex: "America/Sao_Paulo"). Sem fuso explícito, usa o
 * horário local do servidor — por isso o fuso deve sempre ser passado
 * a partir das configurações da loja.
 */
export interface OpenStatus {
  isOpen: boolean;
  // Próxima mudança de estado, em texto pronto para exibir.
  nextChangeLabel: string;
  // Intervalo atual ou próximo, se houver.
  currentOrNextRange: TimeRange | null;
}

const DOW_TO_KEY: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function nowInTimeZone(timeZone: string): { dow: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  const hourStr = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minuteStr = parts.find(p => p.type === 'minute')?.value ?? '00';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[weekdayStr] ?? 0;
  // hour can be "24" at midnight in some environments — normalize
  let hour = parseInt(hourStr, 10);
  if (hour === 24) hour = 0;
  const minutes = hour * 60 + parseInt(minuteStr, 10);
  return { dow, minutes };
}

export function getOpenStatus(hours: BusinessHours, timeZone = 'America/Sao_Paulo'): OpenStatus {
  const { dow, minutes } = nowInTimeZone(timeZone);
  const todayKey = DOW_TO_KEY[dow];
  const today = hours[todayKey];

  if (!today.closed) {
    for (const range of today.ranges) {
      const o = timeToMinutes(range.open);
      const c = timeToMinutes(range.close);
      if (minutes >= o && minutes < c) {
        return {
          isOpen: true,
          nextChangeLabel: `Fecha às ${range.close}`,
          currentOrNextRange: range,
        };
      }
    }
    // Ainda não abriu hoje — próximo intervalo do dia
    const upcoming = today.ranges
      .filter(r => timeToMinutes(r.open) > minutes)
      .sort((a, b) => timeToMinutes(a.open) - timeToMinutes(b.open))[0];
    if (upcoming) {
      return {
        isOpen: false,
        nextChangeLabel: `Abre hoje às ${upcoming.open}`,
        currentOrNextRange: upcoming,
      };
    }
  }

  // Procura o próximo dia com horário definido (até 7 dias à frente)
  for (let i = 1; i <= 7; i++) {
    const nextDow = (dow + i) % 7;
    const nextKey = DOW_TO_KEY[nextDow];
    const nextDay = hours[nextKey];
    if (!nextDay.closed && nextDay.ranges.length > 0) {
      const sorted = [...nextDay.ranges].sort((a, b) => timeToMinutes(a.open) - timeToMinutes(b.open));
      const dayLabel = i === 1 ? 'amanhã' : WEEKDAYS.find(w => w.key === nextKey)!.label.toLowerCase();
      return {
        isOpen: false,
        nextChangeLabel: `Abre ${dayLabel} às ${sorted[0].open}`,
        currentOrNextRange: sorted[0],
      };
    }
  }

  return { isOpen: false, nextChangeLabel: 'Fechado', currentOrNextRange: null };
}

/** Formata os intervalos de um dia em texto curto, ex: "07:00–12:00, 13:00–17:00" */
export function formatDayRanges(day: DayHours): string {
  if (day.closed || day.ranges.length === 0) return 'Fechado';
  return day.ranges.map(r => `${r.open}–${r.close}`).join(', ');
}

/** Agrupa dias consecutivos com o mesmo horário, ex: "Seg–Sex: 08:00–18:00" */
export function groupConsecutiveDays(hours: BusinessHours): { label: string; text: string }[] {
  const groups: { label: string; text: string }[] = [];
  let i = 0;
  while (i < WEEKDAYS.length) {
    const day = WEEKDAYS[i];
    const text = formatDayRanges(hours[day.key]);
    let j = i;
    while (j + 1 < WEEKDAYS.length && formatDayRanges(hours[WEEKDAYS[j + 1].key]) === text) {
      j++;
    }
    const label = i === j ? WEEKDAYS[i].short : `${WEEKDAYS[i].short}–${WEEKDAYS[j].short}`;
    groups.push({ label, text });
    i = j + 1;
  }
  return groups;
}
