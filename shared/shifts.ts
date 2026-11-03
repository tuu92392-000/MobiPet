import type { ShiftInfo, ShiftName } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const SHIFT_LENGTH = 8 * HOUR;

/** 8-hour nursing shifts, local time. Night belongs to the date it starts on. */
export const SHIFT_START_HOUR: Record<ShiftName, number> = { day: 7, evening: 15, night: 23 };

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shiftAt(t: number): ShiftInfo {
  const d = new Date(t);
  const h = d.getHours();
  const start = new Date(d);
  start.setMinutes(0, 0, 0);
  let name: ShiftName;
  if (h >= 7 && h < 15) {
    name = 'day';
    start.setHours(7);
  } else if (h >= 15 && h < 23) {
    name = 'evening';
    start.setHours(15);
  } else {
    name = 'night';
    if (h < 7) start.setDate(start.getDate() - 1);
    start.setHours(23);
  }
  return { name, id: `${ymd(start)}-${name}`, start: start.getTime(), end: start.getTime() + SHIFT_LENGTH };
}

/** Fraction of the shift elapsed, 0..1. */
export function shiftElapsed(shift: ShiftInfo, now: number): number {
  return Math.min(1, Math.max(0, (now - shift.start) / SHIFT_LENGTH));
}

/** Start time of the next occurrence of the named shift after `t`. */
export function nextShiftStart(t: number, name: ShiftName): number {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  d.setHours(SHIFT_START_HOUR[name]);
  if (d.getTime() <= t) d.setDate(d.getDate() + 1);
  return d.getTime();
}
