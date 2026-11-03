// The pet is never referred to by a pronoun, and never given a gender (CLAUDE.md core principles).
import { describe, expect, it } from 'vitest';
import { DICTS } from '../client/src/i18n';
import { TEMPLATES } from '../server/ai/templates';
import { petCoach } from '../server/ai/prompts';

const EN_PRONOUNS = /\b(he|she|him|her|his|hers|they|them|its)\b/i;
/** Gendered words that would describe the pet in Spanish. */
const ES_GENDERED = /\b(él|ella|ellos|orgullos[oa]s?|content[oa]|cansad[oa]|list[oa]|un amigo|una amiga|compañer[oa])\b/i;

describe('template messages (the pet speaking)', () => {
  it('English templates use no third-person pronouns at all', () => {
    for (const [key, lines] of Object.entries(TEMPLATES.en)) {
      for (const line of lines) expect(`${key}: ${line}`).not.toMatch(EN_PRONOUNS);
    }
  });

  it('Spanish templates never gender the pet', () => {
    for (const [key, lines] of Object.entries(TEMPLATES.es)) {
      for (const line of lines) expect(`${key}: ${line}`).not.toMatch(ES_GENDERED);
    }
  });
});

describe('UI strings that mention the pet', () => {
  it('English strings with {pet} use the name, never a pronoun', () => {
    for (const [key, text] of Object.entries(DICTS.en)) {
      if (text.includes('{pet}')) expect(`${key}: ${text}`).not.toMatch(EN_PRONOUNS);
    }
  });

  it('Spanish strings with {pet}, and the setup flow, never gender the pet', () => {
    for (const [key, text] of Object.entries(DICTS.es)) {
      if (text.includes('{pet}') || key.startsWith('setup.') || key.startsWith('species.')) expect(`${key}: ${text}`).not.toMatch(ES_GENDERED);
    }
  });
});

describe('AI system prompt', () => {
  it('tells the model the pet has no gender and must never get a pronoun', () => {
    const prompt = petCoach({
      firstName: 'Odessa', petName: 'Ember', petKind: 'a small fox-like friend', language: 'en', goal: 'Your goal.',
      progress: 'partway', restGoal: false, needsAssist: false, minutesSinceLastActivity: 30, journeyRegion: 'Riverside Path', motivators: [],
    });
    expect(prompt).toMatch(/Ember has no gender/);
    expect(prompt).toMatch(/Never refer to Ember with he, she, him, her, his, hers, they or them/);
  });
});
