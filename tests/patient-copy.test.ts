// Patients never see stamps, step counts, or progress numbers (CLAUDE.md core principles).
import { describe, expect, it } from 'vitest';
import { DICTS } from '../client/src/i18n';
import { template, progressPhrase } from '../server/ai/templates';

/** Screen-reader feedback while typing a PIN is input help, not a progress count. */
const ALLOWED_NUMBERS = new Set(['lock.entered']);

describe('patient- and family-facing copy', () => {
  for (const [lang, dict] of Object.entries(DICTS)) {
    it(`${lang}: no stamps anywhere`, () => {
      for (const [key, text] of Object.entries(dict)) {
        expect(`${key}: ${text}`).not.toMatch(/stamp|sello/i);
      }
    });

    it(`${lang}: no counts, totals or percentages`, () => {
      for (const [key, text] of Object.entries(dict)) {
        if (ALLOWED_NUMBERS.has(key)) continue;
        expect(`${key}: ${text}`).not.toMatch(/\{(n|steps|total|done|count|percent)\}|%/);
      }
    });
  }

  it('template coaching describes progress in words', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const words of ['not-started', 'partway', 'met'] as const) {
        const text = template(lang, 'goal', { goal: 'Your goal.', progress: progressPhrase(lang, words) });
        expect(text).not.toMatch(/\d/);
      }
    }
  });
});

describe('welcome-back greeting', () => {
  it('has six lines in each language, each using the first name and no numbers', async () => {
    const { makeT } = await import('../client/src/i18n');
    const { welcomeLine } = await import('../client/src/views/patient/welcomeLines');
    for (const lang of ['en', 'es'] as const) {
      const t = makeT(lang);
      const seen = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const line = welcomeLine(t, lang, { firstName: 'Marigold', goal: { level: 6, reps: 2, setBy: 'Nurse 1', setAt: 0 } }, 'river', i);
        expect(line).toContain('Marigold');
        expect(line).not.toMatch(/\{\w+\}/);
        seen.add(line);
      }
      expect(seen.size).toBe(6);
      // Rest days get a rest line, not a walk.
      expect(welcomeLine(t, lang, { firstName: 'Augustin', goal: { level: 2, reps: 1, setBy: 'Nurse 1', setAt: 0 } }, 'room', 3)).toMatch(/rest|descans/i);
    }
  });
});
