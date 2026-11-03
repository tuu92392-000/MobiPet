// Nurse view benchmarks: which shifts count, goal history, trend and unit comparison.
import { describe, expect, it } from 'vitest';
import type { ActivityLog, Goal, Level, Patient } from '../shared/types';
import { compareToUnit, goalAt, shiftResults, trendOf } from '../shared/benchmarks';

const at = (iso: string) => new Date(iso).getTime();
const goal = (level: Level, reps: number, setAt: string): Goal => ({ level, reps, setBy: 'Nurse 1', setAt: at(setAt) });
let n = 0;
const log = (iso: string, level: Level, status: ActivityLog['status'] = 'confirmed'): ActivityLog => ({
  id: `l${n++}`, patientId: 'p1', level, at: at(iso), source: 'patient', status, reviewedAt: null,
});

function patient(goals: Goal[], admitted = '2026-10-28T06:00:00'): Pick<Patient, 'id' | 'admittedAt' | 'goal' | 'goalHistory'> {
  return { id: 'p1', admittedAt: at(admitted), goal: goals[goals.length - 1], goalHistory: goals };
}

describe('shift results', () => {
  it('counts day and evening shifts since admission against the goal in effect', () => {
    const p = patient([goal(5, 1, '2026-10-28T06:00:00'), goal(6, 1, '2026-10-29T07:00:00')]);
    const logs = [log('2026-10-28T09:00:00', 5), log('2026-10-29T09:00:00', 5), log('2026-10-29T16:00:00', 6)];
    const r = shiftResults(p, logs, at('2026-10-29T23:30:00'));
    expect(r.map((x) => [x.shiftId, x.met])).toEqual([
      ['2026-10-28-day', true],
      ['2026-10-28-evening', false],
      ['2026-10-29-day', false], // level 5 no longer meets the new level-6 goal
      ['2026-10-29-evening', true],
    ]);
  });

  it('never counts the current shift as a miss, but counts it once met', () => {
    const p = patient([goal(5, 1, '2026-10-28T06:00:00')]);
    expect(shiftResults(p, [], at('2026-10-28T10:00:00'))).toEqual([]);
    expect(shiftResults(p, [log('2026-10-28T09:00:00', 5)], at('2026-10-28T10:00:00')).map((x) => x.met)).toEqual([true]);
  });

  it('skips rest-goal shifts and rejected logs', () => {
    const p = patient([goal(2, 1, '2026-10-28T06:00:00')]);
    expect(shiftResults(p, [log('2026-10-28T09:00:00', 3)], at('2026-10-29T08:00:00'))).toEqual([]);
    const q = patient([goal(4, 1, '2026-10-28T06:00:00')]);
    expect(shiftResults(q, [log('2026-10-28T09:00:00', 4, 'rejected')], at('2026-10-28T16:00:00'))[0].met).toBe(false);
  });

  it('walks across the end of daylight saving time without looping', () => {
    const p = patient([goal(4, 1, '2026-10-30T06:00:00')], '2026-10-30T06:00:00');
    const r = shiftResults(p, [], at('2026-11-03T13:30:00'));
    expect(r.map((x) => x.shiftId)).toContain('2026-11-01-day');
    expect(new Set(r.map((x) => x.shiftId)).size).toBe(r.length);
  });

  it('goalAt picks the latest goal set by that time', () => {
    const p = patient([goal(4, 1, '2026-10-28T06:00:00'), goal(6, 2, '2026-10-30T07:00:00')]);
    expect(goalAt(p, at('2026-10-29T12:00:00')).level).toBe(4);
    expect(goalAt(p, at('2026-10-30T12:00:00')).level).toBe(6);
  });
});

describe('trend and comparison', () => {
  it('reads completed days only, and needs three before calling a trend', () => {
    expect(trendOf([4, 5, null])).toBe('too-early');
    expect(trendOf([4, 4, 5, 6, 6, 3])).toBe('improving'); // today's 3 is ignored: the day isn't over
    expect(trendOf([7, 7, 6, 5, 5, 5])).toBe('declining');
    expect(trendOf([6, 6, 6, 6, 6])).toBe('steady');
  });

  it('uses the goal-met rate when levels are flat', () => {
    const shift = (met: boolean) => ({ shiftId: 's', name: 'day' as const, start: 0, goal: { level: 6 as Level, reps: 1, setBy: '' }, done: 0, met, inProgress: false });
    expect(trendOf([6, 6, 6, 6, 6], [true, true, true, false, false, false].map(shift))).toBe('declining');
  });

  it('compares with the unit average within 5 points as "at"', () => {
    expect(compareToUnit(70, 68)).toBe('at');
    expect(compareToUnit(80, 68)).toBe('above');
    expect(compareToUnit(50, 68)).toBe('below');
    expect(compareToUnit(null, 68)).toBeNull();
  });
});

