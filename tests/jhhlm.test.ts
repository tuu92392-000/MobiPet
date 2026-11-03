import { describe, expect, it } from 'vitest';
import type { Level } from '../shared/types';
import { allowedActivityLevels, goalText, isRestGoal, JHHLM, LEVELS, requiresAssistGate } from '../shared/jhhlm';

describe('goal → plain language', () => {
  it('matches the brief’s example wording', () => {
    expect(goalText({ level: 7, reps: 2 }, 'en')).toBe('Your goal this shift: walk to the hallway (25 feet) 2 times.');
  });

  it('says "once" / "1 vez" for a single repetition', () => {
    expect(goalText({ level: 6, reps: 1 }, 'en')).toBe('Your goal this shift: walk 10 steps once.');
    expect(goalText({ level: 6, reps: 1 }, 'es')).toBe('Tu meta este turno: caminar 10 pasos 1 vez.');
  });

  it('translates every level to Spanish', () => {
    expect(goalText({ level: 8, reps: 3 }, 'es')).toBe('Tu meta este turno: caminar por el pasillo (250 pies o más) 3 veces.');
    for (const level of LEVELS) {
      expect(JHHLM[level].goal.es).not.toEqual(JHHLM[level].goal.en);
    }
  });

  it('frames levels 1–2 as rest, with the pet resting too', () => {
    for (const level of [1, 2] as Level[]) {
      expect(isRestGoal({ level })).toBe(true);
      expect(goalText({ level, reps: 1 }, 'en', 'Juno')).toContain('Juno is resting with you');
      expect(goalText({ level, reps: 1 }, 'es', 'Juno')).toContain('Juno descansa contigo');
    }
  });

  it('never mentions a percentage', () => {
    for (const level of LEVELS) expect(goalText({ level, reps: 2 }, 'en')).not.toMatch(/%/);
  });
});

describe('activity buttons', () => {
  it('offers level 3 up to the nurse-set goal level, never above it', () => {
    expect(allowedActivityLevels({ level: 5 })).toEqual([3, 4, 5]);
    expect(allowedActivityLevels({ level: 8 })).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('offers no buttons on a rest goal', () => {
    expect(allowedActivityLevels({ level: 2 })).toEqual([]);
    expect(allowedActivityLevels({ level: 1 })).toEqual([]);
  });

  it('every button level has an English and Spanish label', () => {
    for (const level of allowedActivityLevels({ level: 8 })) {
      expect(JHHLM[level].done?.en).toBeTruthy();
      expect(JHHLM[level].done?.es).toBeTruthy();
    }
  });
});

describe('assisted-standing gate', () => {
  it('gates every standing activity (chair transfer and up) for needs-assist patients', () => {
    expect(requiresAssistGate(3, 'needs-assist')).toBe(false);
    for (const level of [4, 5, 6, 7, 8] as Level[]) expect(requiresAssistGate(level, 'needs-assist')).toBe(true);
  });

  it('never gates independent patients', () => {
    for (const level of LEVELS) expect(requiresAssistGate(level, 'independent')).toBe(false);
  });
});
