'use client';

import { useState } from 'react';
import {
  WEEKDAYS, type WeekdayKey, type BusinessHours, type DayHours, type TimeRange,
} from '@/lib/business-hours';

interface Props {
  value: BusinessHours;
  onChange: (next: BusinessHours) => void;
}

/**
 * Editor de horário de funcionamento — modelo Google Business.
 * Cada dia: aberto/fechado + múltiplos intervalos (ex: 07:00–12:00, 13:00–17:00).
 */
export function BusinessHoursEditor({ value, onChange }: Props) {
  const [copyMenuOpen, setCopyMenuOpen] = useState<WeekdayKey | null>(null);
  const [justCopied, setJustCopied] = useState(false);

  const openDaysCount = WEEKDAYS.filter(({ key }) => !value[key].closed && value[key].ranges.length > 0).length;
  const totalWeeklyMinutes = WEEKDAYS.reduce((sum, { key }) => {
    const day = value[key];
    if (day.closed) return sum;
    return sum + day.ranges.reduce((s, r) => s + Math.max(0, timeDiffMinutes(r.open, r.close)), 0);
  }, 0);
  const totalHoursLabel = totalWeeklyMinutes > 0
    ? `${Math.floor(totalWeeklyMinutes / 60)}h${totalWeeklyMinutes % 60 ? String(totalWeeklyMinutes % 60).padStart(2, '0') : ''}`
    : '0h';

  function updateDay(key: WeekdayKey, next: DayHours) {
    onChange({ ...value, [key]: next });
  }

  function toggleClosed(key: WeekdayKey) {
    const day = value[key];
    if (day.closed) {
      // Reabrindo — sugere um intervalo padrão se não tiver nenhum
      updateDay(key, {
        closed: false,
        ranges: day.ranges.length > 0 ? day.ranges : [{ open: '08:00', close: '18:00' }],
      });
    } else {
      updateDay(key, { closed: true, ranges: day.ranges });
    }
  }

  function addRange(key: WeekdayKey) {
    const day = value[key];
    const last = day.ranges[day.ranges.length - 1];
    // Sugere o próximo intervalo começando 1h depois do fim do último
    const suggestedStart = last ? addHour(last.close) : '08:00';
    const suggestedEnd = addHour(suggestedStart, 4);
    updateDay(key, { ...day, ranges: [...day.ranges, { open: suggestedStart, close: suggestedEnd }] });
  }

  function removeRange(key: WeekdayKey, idx: number) {
    const day = value[key];
    updateDay(key, { ...day, ranges: day.ranges.filter((_, i) => i !== idx) });
  }

  function setRange(key: WeekdayKey, idx: number, field: keyof TimeRange, val: string) {
    const day = value[key];
    const ranges = day.ranges.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    updateDay(key, { ...day, ranges });
  }

  function copyToAll(key: WeekdayKey) {
    const source = value[key];
    const next = { ...value };
    for (const { key: k } of WEEKDAYS) {
      if (k === key) continue;
      next[k] = { closed: source.closed, ranges: source.ranges.map(r => ({ ...r })) };
    }
    onChange(next);
    setCopyMenuOpen(null);
    flashCopied();
  }

  function copyToWeekdays(key: WeekdayKey) {
    const source = value[key];
    const next = { ...value };
    for (const k of ['mon', 'tue', 'wed', 'thu', 'fri'] as WeekdayKey[]) {
      if (k === key) continue;
      next[k] = { closed: source.closed, ranges: source.ranges.map(r => ({ ...r })) };
    }
    onChange(next);
    setCopyMenuOpen(null);
    flashCopied();
  }

  function flashCopied() {
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[11px] text-[#B09C8C]">
          <span className="font-semibold text-[#705A48]">{openDaysCount}</span> {openDaysCount === 1 ? 'dia aberto' : 'dias abertos'} por semana
          {totalWeeklyMinutes > 0 && <> · <span className="font-semibold text-[#705A48]">{totalHoursLabel}</span> de funcionamento</>}
        </p>
      </div>
      {justCopied && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 text-[12px] font-medium">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Horário copiado
        </div>
      )}
      {WEEKDAYS.map(({ key, label }) => {
        const day = value[key];
        const hasOverlapOrInvalid = validateDay(day);

        return (
          <div
            key={key}
            className={`border transition-colors ${
              day.closed ? 'border-[#E6DFD5] bg-[#FAF8F5]/40' : 'border-[#E6DFD5] bg-white'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
              {/* Dia + toggle */}
              <button
                type="button"
                onClick={() => toggleClosed(key)}
                className="flex items-center gap-2.5 shrink-0 sm:w-[148px] text-left group"
              >
                <span
                  className={`w-9 h-5 flex items-center rounded-full transition-colors shrink-0 ${
                    day.closed ? 'bg-[#E6DFD5]' : 'bg-[#1E1208]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${
                      day.closed ? 'translate-x-0' : 'translate-x-4'
                    }`}
                  />
                </span>
                <span className={`text-[13px] font-semibold ${day.closed ? 'text-[#B09C8C]' : 'text-[#1E1208]'}`}>
                  {label}
                </span>
              </button>

              {/* Intervalos ou "Fechado" */}
              <div className="flex-1 min-w-0">
                {day.closed ? (
                  <span className="text-[12px] text-[#C8BAB0] italic">Fechado</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {day.ranges.length === 0 && (
                      <span className="text-[11px] text-[#C4714A]">Nenhum horário definido — adicione um intervalo</span>
                    )}
                    {day.ranges.map((range, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                        <input
                          type="time"
                          value={range.open}
                          onChange={e => setRange(key, idx, 'open', e.target.value)}
                          className="border border-[#E6DFD5] px-2 py-1.5 text-[12px] tabular-nums w-[108px] sm:w-[92px] focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60"
                        />
                        <span className="text-[#C8BAB0] text-[11px] shrink-0">até</span>
                        <input
                          type="time"
                          value={range.close}
                          onChange={e => setRange(key, idx, 'close', e.target.value)}
                          className="border border-[#E6DFD5] px-2 py-1.5 text-[12px] tabular-nums w-[108px] sm:w-[92px] focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60"
                        />
                        <button
                          type="button"
                          onClick={() => removeRange(key, idx)}
                          className="w-6 h-6 flex items-center justify-center text-[#C8BAB0] hover:text-red-500 transition-colors shrink-0"
                          aria-label="Remover intervalo"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                        {idx === day.ranges.length - 1 && (
                          <button
                            type="button"
                            onClick={() => addRange(key)}
                            className="w-6 h-6 flex items-center justify-center text-[#C4714A] hover:bg-[#C4714A]/10 rounded transition-colors shrink-0"
                            aria-label="Adicionar outro intervalo"
                            title="Adicionar outro intervalo (ex: pausa de almoço)"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          </button>
                        )}
                      </div>
                    ))}
                    {day.ranges.length === 0 && (
                      <button
                        type="button"
                        onClick={() => addRange(key)}
                        className="self-start flex items-center gap-1 text-[11px] font-semibold text-[#C4714A] hover:text-[#1E1208] transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                        Adicionar horário
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Menu copiar */}
              <div className="relative shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCopyMenuOpen(copyMenuOpen === key ? null : key)}
                  className="w-7 h-7 flex items-center justify-center text-[#B09C8C] hover:text-[#1E1208] hover:bg-[#FAF8F5] rounded transition-colors"
                  aria-label="Copiar horário"
                  title="Copiar este horário para outros dias"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
                {copyMenuOpen === key && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCopyMenuOpen(null)} />
                    <div className="absolute right-0 top-9 z-20 bg-white border border-[#E6DFD5] shadow-lg py-1 w-52">
                      <button
                        type="button"
                        onClick={() => copyToAll(key)}
                        className="w-full text-left px-3.5 py-2.5 text-[12px] text-[#1E1208] hover:bg-[#FAF8F5] transition-colors"
                      >
                        Copiar para todos os dias
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToWeekdays(key)}
                        className="w-full text-left px-3.5 py-2.5 text-[12px] text-[#1E1208] hover:bg-[#FAF8F5] transition-colors"
                      >
                        Copiar para dias úteis (seg–sex)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {hasOverlapOrInvalid && (
              <div className="px-4 pb-3 -mt-1">
                <p className="text-[11px] text-red-500 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {hasOverlapOrInvalid}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Soma horas a um horário "HH:mm", devolvendo "HH:mm" (sem passar de 23:59) */
function addHour(time: string, hours = 1): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h || 0) * 60 + (m || 0) + hours * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** Diferença em minutos entre dois horários "HH:mm" */
function timeDiffMinutes(open: string, close: string): number {
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  return ((ch || 0) * 60 + (cm || 0)) - ((oh || 0) * 60 + (om || 0));
}

/** Retorna mensagem de erro se houver intervalo inválido (fim antes do início) ou sobreposição entre intervalos do mesmo dia */
function validateDay(day: DayHours): string | null {
  if (day.closed || day.ranges.length === 0) return null;
  for (const r of day.ranges) {
    if (r.open >= r.close) return 'O horário de fim deve ser depois do início';
  }
  const sorted = [...day.ranges].sort((a, b) => a.open.localeCompare(b.open));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].close > sorted[i + 1].open) return 'Os intervalos não podem se sobrepor';
  }
  return null;
}
