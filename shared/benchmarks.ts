// Nurse view benchmarks and unit metrics, computed from logs and goal history (never stored).
//
// Counting rules, used everywhere (board, Nurse view, exports):
// - A "patient-shift" is a day or evening shift that started after admission. Night is for rest.
// - Shifts with a rest goal (JH-HLM 1–2) are not counted: there is nothing to meet.
// - The goal in effect is the latest goal set before the shift ended.
// - A finished shift counts as met or not met. The current shift counts only once it is met,
//   so an unfinished shift is never shown as a miss.
import type { ActivityLog, Goal, Level, Patient, SafetyFlag } from './types';
import { isRestGoal } from './jhhlm';
import { HOUR, shiftAt } from './shifts';

export const DAY = 24 * HOUR;

export interface ShiftResult {
  shiftId: string;
  name: 'day' | 'evening';
  start: number;
  goal: Pick<Goal, 'level' | 'reps' | 'setBy'>;
  done: number;
  met: boolean;
  inProgress: boolean;
}

export function goalAt(p: Pick<Patient, 'goal' | 'goalHistory'>, t: number): Goal {
  const history = p.goalHistory?.length ? p.goalHistory : [p.goal];
  let g = history[0];
  for (const h of history) if (h.setAt <= t) g = h;
  return g;
}

/** Counted day/evening shifts since admission, oldest first. */
export function shiftResults(p: Pick<Patient, 'id' | 'admittedAt' | 'goal' | 'goalHistory'>, logs: ActivityLog[], now: number): ShiftResult[] {
  const mine = logs.filter((l) => l.patientId === p.id && l.status !== 'rejected' && l.at <= now);
  const out: ShiftResult[] = [];
  // Walk shift by shift from the first one starting at or after admission.
  let shift = shiftAt(p.admittedAt);
  if (shift.start < p.admittedAt) shift = nextShift(shift);
  for (; shift.start <= now; shift = nextShift(shift)) {
    if (shift.name === 'night') continue;
    const goal = goalAt(p, Math.min(shift.end, now));
    if (isRestGoal(goal)) continue;
    const done = mine.filter((l) => l.at >= shift.start && l.at < shift.end && l.level >= goal.level).length;
    const met = done >= goal.reps;
    const inProgress = now < shift.end;
    if (inProgress && !met) continue;
    out.push({ shiftId: shift.id, name: shift.name, start: shift.start, goal: { level: goal.level, reps: goal.reps, setBy: goal.setBy }, done, met, inProgress });
  }
  return out;
}

/** The shift after this one. A fixed 8-hour step can land inside the same night when clocks fall back, so always move forward. */
function nextShift(shift: ReturnType<typeof shiftAt>) {
  let next = shiftAt(shift.end);
  while (next.start <= shift.start) next = shiftAt(next.end + HOUR);
  return next;
}

const pct = (met: number, total: number) => (total === 0 ? null : Math.round((met / total) * 100));

export type Trend = 'improving' | 'steady' | 'declining' | 'too-early';

export interface PatientBenchmark {
  id: string;
  room: string;
  displayName: string;
  goal: Pick<Goal, 'level' | 'reps'>;
  restGoal: boolean;
  highestThisShift: Level | null;
  /** % of counted shifts met since admission; null when nothing counted yet. */
  pctMet: number | null;
  shiftsCounted: number;
  /** Highest JH-HLM level reached each day since admission (null = no activity that day). */
  dailyHighest: (Level | null)[];
  trend: Trend;
  vsUnit: 'above' | 'at' | 'below' | null;
  daysSinceAdmission: number;
  lastActivityAt: number | null;
}

/** Local midnight after `t` (calendar days, so daylight-saving changes are handled). */
function nextMidnight(t: number): number {
  const d = new Date(t);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Days are calendar days in local time, admission day first. */
export function dailyHighest(p: Pick<Patient, 'id' | 'admittedAt'>, logs: ActivityLog[], now: number): (Level | null)[] {
  const out: (Level | null)[] = [];
  for (let d = new Date(p.admittedAt).setHours(0, 0, 0, 0); d <= now; d = nextMidnight(d)) {
    const end = nextMidnight(d);
    let best: Level | null = null;
    for (const l of logs) {
      if (l.patientId !== p.id || l.status === 'rejected' || l.at < d || l.at >= end || l.at > now) continue;
      if (best === null || l.level > best) best = l.level;
    }
    out.push(best);
  }
  return out;
}

/**
 * Direction over the stay, from completed days only (today is still in progress): first the daily highest
 * JH-HLM level, first half against second half; if levels are flat, the goal-met rate across counted shifts.
 */
export function trendOf(daily: (Level | null)[], shifts: ShiftResult[] = []): Trend {
  const values = daily.slice(0, -1).filter((v): v is Level => v !== null);
  if (values.length < 3) return 'too-early';
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const half = Math.floor(values.length / 2);
  const levelDiff = avg(values.slice(values.length - half)) - avg(values.slice(0, half));
  if (levelDiff >= 0.5) return 'improving';
  if (levelDiff <= -0.5) return 'declining';
  const done = shifts.filter((r) => !r.inProgress).map((r) => (r.met ? 1 : 0));
  if (done.length >= 4) {
    const h = Math.floor(done.length / 2);
    const metDiff = avg(done.slice(done.length - h)) - avg(done.slice(0, h));
    if (metDiff >= 0.25) return 'improving';
    if (metDiff <= -0.25) return 'declining';
  }
  return 'steady';
}

/** Within 5 percentage points of the unit average counts as "at". */
export function compareToUnit(p: number | null, unit: number | null): PatientBenchmark['vsUnit'] {
  if (p === null || unit === null) return null;
  if (p > unit + 5) return 'above';
  if (p < unit - 5) return 'below';
  return 'at';
}

export interface UnitMetrics {
  pctMetToday: number | null;
  shiftsToday: number;
  pctMet7d: number | null;
  shifts7d: number;
  /** Unit average since admission, across every patient's counted shifts. */
  pctMetUnit: number | null;
  patientsBehind: number;
  openFlags: number;
  unconfirmedReports: number;
}

interface Input {
  patients: Patient[];
  logs: ActivityLog[];
  flags: SafetyFlag[];
  now: number;
  /** From the board: status per patient and highest level this shift. */
  summaries: { id: string; displayName: string; status: string; highestLevelThisShift: Level | null; lastActivityAt: number | null }[];
}

export function benchmarks({ patients, logs, flags, now, summaries }: Input): { metrics: UnitMetrics; patients: PatientBenchmark[] } {
  const results = new Map(patients.map((p) => [p.id, shiftResults(p, logs, now)]));
  const all = [...results.values()].flat();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const today = all.filter((r) => r.start >= todayStart);
  const week = all.filter((r) => r.start >= now - 7 * DAY);
  const count = (rs: ShiftResult[]) => rs.filter((r) => r.met).length;
  const pctMetUnit = pct(count(all), all.length);

  const metrics: UnitMetrics = {
    pctMetToday: pct(count(today), today.length),
    shiftsToday: today.length,
    pctMet7d: pct(count(week), week.length),
    shifts7d: week.length,
    pctMetUnit,
    patientsBehind: summaries.filter((s) => s.status === 'behind').length,
    openFlags: flags.filter((f) => f.acknowledgedAt === null).length,
    unconfirmedReports: logs.filter((l) => l.status === 'reported' && l.at <= now).length,
  };

  const rows = patients.map((p): PatientBenchmark => {
    const rs = results.get(p.id) ?? [];
    const s = summaries.find((x) => x.id === p.id);
    const daily = dailyHighest(p, logs, now);
    const mine = pct(count(rs), rs.length);
    return {
      id: p.id,
      room: p.room,
      displayName: s?.displayName ?? `${p.firstName} ${p.lastInitial}.`,
      goal: { level: p.goal.level, reps: p.goal.reps },
      restGoal: isRestGoal(p.goal),
      highestThisShift: s?.highestLevelThisShift ?? null,
      pctMet: mine,
      shiftsCounted: rs.length,
      dailyHighest: daily,
      trend: trendOf(daily, rs),
      vsUnit: compareToUnit(mine, pctMetUnit),
      daysSinceAdmission: Math.max(0, Math.floor((now - p.admittedAt) / DAY)),
      lastActivityAt: s?.lastActivityAt ?? null,
    };
  });
  return { metrics, patients: rows };
}

