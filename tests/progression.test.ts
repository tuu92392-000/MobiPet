import { describe, expect, it } from 'vitest';
import type { ActivityLog, Level } from '../shared/types';
import {
  ACCESSORIES, applyActivity, goalProgress, highestLevel, HOME_STEPS, journeyFraction, KEEPSAKES, keepsakesFor,
  nextRegion, petMood, POINTS, progressWords, regionAt, stageFor,
} from '../shared/progression';
import { HOUR, MINUTE, shiftAt, shiftElapsed } from '../shared/shifts';

const at = (iso: string) => new Date(iso).getTime();
const log = (time: string, level: Level, status: ActivityLog['status'] = 'reported'): ActivityLog => ({
  id: time, patientId: 'p', level, at: at(time), source: 'patient', status, reviewedAt: null,
});

describe('journey steps', () => {
  it('adds points by JH-HLM level', () => {
    const r = applyActivity(10, 7);
    expect(r.gained).toBe(POINTS[7]);
    expect(r.after).toBe(10 + POINTS[7]);
  });

  it('never goes backward and never passes Home', () => {
    for (let steps = 0; steps <= HOME_STEPS; steps += 7) {
      for (const level of [1, 3, 8] as Level[]) {
        const r = applyActivity(steps, level);
        expect(r.after).toBeGreaterThanOrEqual(steps);
        expect(r.after).toBeLessThanOrEqual(HOME_STEPS);
      }
    }
    expect(applyActivity(HOME_STEPS, 8).gained).toBe(0);
  });

  it('reports reaching Home exactly once', () => {
    expect(applyActivity(HOME_STEPS - 2, 8).reachedHome).toBe(true);
    expect(applyActivity(HOME_STEPS, 8).reachedHome).toBe(false);
  });

  it('reports keepsakes, stage-ups and regions crossed', () => {
    const r = applyActivity(7, 6); // 7 → 10: passes the leaf (8)
    expect(r.newKeepsakes).toEqual(['leaf']);
    expect(applyActivity(3, 6).newRegion).toBe('garden'); // 3 → 6 crosses 5
    expect(applyActivity(22, 6).stageUp).toBe(true); // 22 → 25
  });

  it('offers every accessory from the start and has a keepsake in every region', () => {
    expect(ACCESSORIES).toEqual(['scarf', 'backpack', 'stick', 'hat']);
    expect(keepsakesFor(HOME_STEPS)).toHaveLength(KEEPSAKES.length);
    expect(new Set(KEEPSAKES.map((k) => k.region))).toEqual(new Set(['garden', 'meadow', 'river', 'hilltop', 'home']));
  });

  it('maps steps to stages and regions', () => {
    expect([0, 24, 25, 59, 60, 99, 100].map(stageFor)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect([0, 5, 30, 60, 90, 120].map(regionAt)).toEqual(['room', 'garden', 'meadow', 'river', 'hilltop', 'home']);
    expect(nextRegion(28)).toBe('meadow');
    expect(nextRegion(HOME_STEPS)).toBeNull();
  });

  it('places the pet monotonically along the map path', () => {
    let prev = -1;
    for (let s = 0; s <= HOME_STEPS; s++) {
      const f = journeyFraction(s);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
  });
});

describe('8-hour shifts', () => {
  it('splits the day at 7 AM, 3 PM and 11 PM', () => {
    expect(shiftAt(at('2026-10-29T06:59:00')).name).toBe('night');
    expect(shiftAt(at('2026-10-29T07:00:00')).name).toBe('day');
    expect(shiftAt(at('2026-10-29T14:59:00')).name).toBe('day');
    expect(shiftAt(at('2026-10-29T15:00:00')).name).toBe('evening');
    expect(shiftAt(at('2026-10-29T23:00:00')).name).toBe('night');
  });

  it('gives a night shift the date it started on', () => {
    expect(shiftAt(at('2026-10-30T02:00:00')).id).toBe('2026-10-29-night');
    expect(shiftAt(at('2026-10-29T23:30:00')).id).toBe('2026-10-29-night');
  });

  it('measures elapsed fraction', () => {
    const s = shiftAt(at('2026-10-29T11:00:00'));
    expect(shiftElapsed(s, at('2026-10-29T11:00:00'))).toBe(0.5);
  });
});

describe('goal progress', () => {
  const shift = shiftAt(at('2026-10-29T13:30:00'));

  it('counts activities at or above the goal level this shift, capped at reps', () => {
    const logs = [log('2026-10-29T08:00:00', 7), log('2026-10-29T09:00:00', 8), log('2026-10-29T10:00:00', 7)];
    expect(goalProgress(logs, { level: 7, reps: 2 }, shift)).toBe(2);
  });

  it('ignores lower levels, rejected logs and other shifts', () => {
    const logs = [
      log('2026-10-29T08:00:00', 6),
      log('2026-10-29T09:00:00', 7, 'rejected'),
      log('2026-10-29T16:00:00', 7), // evening shift
      log('2026-10-28T09:00:00', 7), // yesterday
    ];
    expect(goalProgress(logs, { level: 7, reps: 2 }, shift)).toBe(0);
  });

  it('counts patient-reported logs before a nurse confirms them', () => {
    expect(goalProgress([log('2026-10-29T08:00:00', 7, 'reported')], { level: 7, reps: 1 }, shift)).toBe(1);
  });

  it('reports the highest level reached this shift', () => {
    expect(highestLevel([log('2026-10-29T08:00:00', 5), log('2026-10-29T09:00:00', 6)], shift)).toBe(6);
    expect(highestLevel([], shift)).toBeNull();
  });
});

describe('pet mood is never punished', () => {
  const now = at('2026-10-29T13:30:00');
  it('is excited, happy or curious after activity and sleepy (never sad) after long rest', () => {
    expect(petMood(now, now - 10 * MINUTE, null, false)).toBe('excited');
    expect(petMood(now, now - HOUR, null, false)).toBe('happy');
    expect(petMood(now, now - 3 * HOUR, null, false)).toBe('curious');
    expect(petMood(now, now - 10 * HOUR, null, false)).toBe('sleepy');
  });

  it('is cheered up by family encouragement and curious for a brand-new patient', () => {
    expect(petMood(now, now - 10 * HOUR, now - 30 * MINUTE, false)).toBe('happy');
    expect(petMood(now, null, null, false)).toBe('curious');
  });

  it('naps on a rest goal', () => {
    expect(petMood(now, now - MINUTE, null, true)).toBe('sleepy');
  });

  it('only ever returns gentle moods', () => {
    const allowed = new Set(['curious', 'happy', 'excited', 'sleepy']);
    for (let h = 0; h < 48; h += 0.5) expect(allowed.has(petMood(now, now - h * HOUR, null, false))).toBe(true);
  });
});

describe('progress in words', () => {
  it('never needs a number', () => {
    expect(progressWords(0, 2)).toBe('not-started');
    expect(progressWords(1, 2)).toBe('partway');
    expect(progressWords(2, 2)).toBe('met');
  });
});
