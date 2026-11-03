// The guardrail pipeline, with the store, AI log and model client replaced by in-memory fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DB, Patient } from '../shared/types';
import type { UnitFact } from '../shared/unitFacts';

const NOW = new Date('2026-10-29T13:30:00').getTime();
const state: { db: DB } = { db: emptyDb() };

function emptyDb(): DB {
  return { version: 2, clockOffsetMs: 0, patients: [], logs: [], flags: [], messages: [], chats: [], accounts: [], sessions: [], notes: [], exportLog: [], buddyCheers: [] };
}

vi.mock('../server/store', () => ({
  getDB: () => state.db,
  now: () => NOW,
  mutate: (_kind: string, _id: string | null, fn: (db: DB) => unknown) => fn(state.db),
  findPatient: (id: string) => state.db.patients.find((p) => p.id === id),
}));

vi.mock('../server/ai/log', () => ({
  logAi: vi.fn((e: object) => ({ id: `ai_${Math.random()}`, ...e })),
  aiLogFor: () => [],
  clearAiLog: () => undefined,
}));

vi.mock('../server/ai/client', () => {
  class AIUnavailable extends Error {}
  return { MODEL: 'test-model', aiMode: vi.fn(() => 'ai'), complete: vi.fn(), AIUnavailable };
});

const { aiMode, complete, AIUnavailable } = await import('../server/ai/client');
const { logAi } = await import('../server/ai/log');
const { coachReply, filterFamilyMessage, makeNudge, nudgeBlocker, summarizeUnit, trimReply, verifyBullets } = await import('../server/ai/pipeline');

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: 'p1', firstName: 'Marigold', lastInitial: 'T', room: '410', cohort: 'lung-transplant',
    admittedAt: NOW - 86_400_000, clearance: 'independent',
    goal: { level: 7, reps: 2, setBy: 'RN', setAt: NOW },
    goalHistory: [{ level: 7, reps: 2, setBy: 'RN', setAt: NOW }],
    pet: { species: 'nimbus', palette: 0, name: 'Pip', accessory: null },
    journeySteps: 20,
    settings: { language: 'en', textSize: 1, highContrast: false, readAloud: false, sound: false, volume: 0.6, buddies: false },
    motivators: ['her garden'], aiCoachingMuted: false,
    nudgesPausedUntil: null, nudgeSnoozedUntil: null, lastNudgeAt: null, nurseNote: null, familyCode: 'PIP-410', buddyHandle: 'buddy_test', buddiesBlockedByStaff: false,
    ...over,
  };
}

function setup(over: Partial<Patient> = {}) {
  state.db = emptyDb();
  const p = patient(over);
  state.db.patients.push(p);
  return p;
}

beforeEach(() => {
  vi.mocked(complete).mockReset();
  vi.mocked(aiMode).mockReturnValue('ai');
  vi.mocked(logAi).mockClear();
});

describe('symptoms: escalate, never coach', () => {
  it('skips the AI, flags the nurse, and asks for the call button', async () => {
    const p = setup();
    const r = await coachReply(p, 'I feel dizzy');
    expect(complete).not.toHaveBeenCalled();
    expect(r.action).toBe('call-button');
    expect(r.turns[1]).toMatchObject({ role: 'pet', mode: 'safety', guardrail: 'symptom:dizzy' });
    expect(r.turns[1].text).toMatch(/call button/);
    expect(state.db.flags).toHaveLength(1);
    expect(state.db.flags[0]).toMatchObject({ patientId: 'p1', text: 'I feel dizzy', matched: 'dizzy', acknowledgedAt: null });
  });

  it('works in Spanish', async () => {
    const p = setup({ settings: { ...patient().settings, language: 'es' } });
    const r = await coachReply(p, 'Me duele el pecho');
    expect(complete).not.toHaveBeenCalled();
    expect(r.turns[1].text).toMatch(/botón de llamada/);
    expect(state.db.flags).toHaveLength(1);
  });

  it('logs the decision for the nurse', async () => {
    const p = setup();
    await coachReply(p, 'I fell');
    expect(logAi).toHaveBeenCalledWith(expect.objectContaining({ fn: 'petCoach', mode: 'safety', guardrail: 'symptom:fall' }));
  });
});

describe('medical questions: redirect to the nurse', () => {
  it('never reaches the AI and offers a reminder', async () => {
    const p = setup();
    const r = await coachReply(p, 'When can I go home?');
    expect(complete).not.toHaveBeenCalled();
    expect(r.turns[1].guardrail).toBe('route:medical-question');
    expect(r.turns[1].text).toBe('That’s a great question for your nurse. Want me to remind you to ask your nurse?');
  });

  it('saves the question for the nurse when the patient says yes', async () => {
    const p = setup();
    await coachReply(p, 'When can I go home?');
    const r = await coachReply(p, 'yes please');
    expect(r.turns[1].guardrail).toBe('route:remind-nurse');
    expect(p.questionForNurse?.text).toBe('When can I go home?');
  });
});

describe('AI replies', () => {
  it('passes a clean reply through, trimmed to two sentences', async () => {
    const p = setup();
    vi.mocked(complete).mockResolvedValueOnce('You’re doing great, Marigold! One more walk to the hallway. Then we rest. And more.');
    const r = await coachReply(p, 'How am I doing?');
    expect(r.turns[1]).toMatchObject({ mode: 'ai', guardrail: null });
    expect(r.turns[1].text).toBe('You’re doing great, Marigold! One more walk to the hallway.');
  });

  it('replaces a reply that mentions medication with a safe template', async () => {
    const p = setup();
    vi.mocked(complete).mockResolvedValueOnce('Take your pills and then walk!');
    const r = await coachReply(p, 'What should I do?');
    expect(r.turns[1].guardrail).toBe('output:medication');
    expect(r.turns[1].mode).toBe('template');
    expect(r.turns[1].text).not.toMatch(/pill/i);
    // The blocked text is kept in the log so nurses can see what was replaced.
    expect(logAi).toHaveBeenLastCalledWith(expect.objectContaining({ rawOutput: 'Take your pills and then walk!' }));
  });

  it('blocks walking advice to a patient whose goal is standing', async () => {
    const p = setup({ goal: { level: 5, reps: 2, setBy: 'RN', setAt: NOW } });
    vi.mocked(complete).mockResolvedValueOnce('Let’s walk down the hall together!');
    const r = await coachReply(p, 'Cheer me on');
    expect(r.turns[1].guardrail).toBe('output:exercise-out-of-level');
  });

  it('blocks standing advice to a needs-assist patient unless it says to call the nurse', async () => {
    const p = setup({ clearance: 'needs-assist', goal: { level: 5, reps: 2, setBy: 'RN', setAt: NOW } });
    vi.mocked(complete).mockResolvedValueOnce('Time to stand up for a minute!');
    expect((await coachReply(p, 'What now?')).turns[1].guardrail).toBe('output:assist-reminder-missing');
    vi.mocked(complete).mockResolvedValueOnce('Call your nurse, then stand up for a minute!');
    expect((await coachReply(p, 'What now?')).turns[1].mode).toBe('ai');
  });

  it('falls back to a template when the AI errors or declines', async () => {
    const p = setup();
    vi.mocked(complete).mockRejectedValueOnce(new AIUnavailable('refusal'));
    const r = await coachReply(p, 'What is my goal?');
    expect(r.turns[1]).toMatchObject({ mode: 'template', guardrail: 'ai-error:refusal' });
    expect(r.turns[1].text).toContain('walk to the hallway (25 feet) 2 times');
  });

  it('sends only minimal, non-clinical context — never the cohort or diagnosis', async () => {
    const p = setup();
    vi.mocked(complete).mockResolvedValueOnce('Hi Marigold!');
    await coachReply(p, 'Hello');
    const call = vi.mocked(complete).mock.calls[0][0];
    expect(call.system).not.toMatch(/transplant|lung|cohort|diagnos(is|ed)/i);
    expect(call.system).toContain('Marigold');
    expect(call.messages.at(-1)).toEqual({ role: 'user', content: 'Hello' });
  });

  it('asks for replies in the patient’s language', async () => {
    const p = setup({ settings: { ...patient().settings, language: 'es' } });
    vi.mocked(complete).mockResolvedValueOnce('¡Hola!');
    await coachReply(p, 'Hola');
    expect(vi.mocked(complete).mock.calls[0][0].system).toContain('Reply in Spanish');
  });

  it('starts the breathing guide when asked', async () => {
    const p = setup();
    vi.mocked(complete).mockResolvedValueOnce('Let’s breathe slowly together.');
    expect((await coachReply(p, 'Can we do a breathing break?')).action).toBe('breathing');
  });
});

describe('template mode and nurse mute', () => {
  it('never calls the AI without a key', async () => {
    vi.mocked(aiMode).mockReturnValue('template');
    const p = setup();
    const r = await coachReply(p, 'What is my goal?');
    expect(complete).not.toHaveBeenCalled();
    expect(r.turns[1].mode).toBe('template');
  });

  it('never calls the AI when the nurse muted coaching', async () => {
    const p = setup({ aiCoachingMuted: true });
    const r = await coachReply(p, 'Hi Pip');
    expect(complete).not.toHaveBeenCalled();
    expect(r.turns[1].guardrail).toBe('muted-by-nurse');
  });

  it('replies in Spanish from templates', async () => {
    vi.mocked(aiMode).mockReturnValue('template');
    const p = setup({ settings: { ...patient().settings, language: 'es' } });
    expect((await coachReply(p, 'Hola')).turns[1].text).toMatch(/^¡Hola, Marigold!/);
  });
});

describe('nudges', () => {
  it('allows at most one per hour', () => {
    const p = setup({ lastNudgeAt: NOW - 30 * 60_000 });
    expect(nudgeBlocker(p, 'meal')).toBe('max-one-per-hour');
  });

  it('respects nurse pause, snooze, rest goals, met goals and open safety flags', () => {
    expect(nudgeBlocker(setup({ nudgesPausedUntil: NOW + 1 }), 'meal')).toBe('paused-by-nurse');
    expect(nudgeBlocker(setup({ nudgeSnoozedUntil: NOW + 1 }), 'meal')).toBe('snoozed');
    expect(nudgeBlocker(setup({ goal: { level: 2, reps: 1, setBy: 'RN', setAt: NOW } }), 'meal')).toBe('rest-goal');
    const flagged = setup();
    state.db.flags.push({ id: 'f', patientId: 'p1', at: NOW, text: 'dizzy', source: 'chat', matched: 'dizzy', acknowledgedAt: null });
    expect(nudgeBlocker(flagged, 'meal')).toBe('open-safety-flag');
  });

  it('only nudges an idle patient after two hours without activity', () => {
    const p = setup();
    state.db.logs.push({ id: 'l', patientId: 'p1', level: 7, at: NOW - 60 * 60_000, source: 'patient', status: 'reported', reviewedAt: null });
    expect(nudgeBlocker(p, 'idle')).toBe('recently-active');
  });

  it('shows the nudge on the tablet and records it', async () => {
    vi.mocked(aiMode).mockReturnValue('template');
    const p = setup();
    const r = await makeNudge(p, 'meal');
    expect('text' in r && r.text).toMatch(/walk to the hallway/);
    expect(p.activeNudge?.text).toBeTruthy();
    expect(p.lastNudgeAt).toBe(NOW);
  });
});

describe('unit summary verification', () => {
  const facts: UnitFact[] = [
    { id: 'flag:1', kind: 'flag', severity: 'high', text: 'Room 418 reported "dizzy" at 1:15 PM — not yet acknowledged.', evidence: [{ patientId: 'p418', room: '418', name: 'Percival H.', detail: '1:15 PM' }] },
    { id: 'behind', kind: 'behind', severity: 'medium', text: '2 patients are behind on day-shift goals (Rooms 412, 415).', evidence: [] },
  ];

  it('keeps bullets whose numbers appear in the facts they cite', () => {
    const ok = [{ text: 'Room 418 reported dizziness at 1:15 PM.', factIds: ['flag:1'] }];
    expect(verifyBullets(ok, facts)).toEqual(ok);
  });

  it('drops bullets with invented numbers or unknown facts', () => {
    expect(verifyBullets([{ text: '3 patients are behind.', factIds: ['behind'] }], facts)).toEqual([]);
    expect(verifyBullets([{ text: 'Room 418 is fine.', factIds: ['made-up'] }], facts)).toEqual([]);
    expect(verifyBullets([{ text: 'All good.', factIds: [] }], facts)).toEqual([]);
  });

  it('falls back to the plain facts if the AI drops a safety flag', async () => {
    vi.mocked(complete).mockResolvedValueOnce(JSON.stringify({ bullets: [{ text: '2 patients are behind (Rooms 412, 415).', factIds: ['behind'] }] }));
    const r = await summarizeUnit(facts);
    expect(r.mode).toBe('template');
    expect(r.guardrail).toBe('missing-safety-flag');
    expect(r.bullets[0].factIds).toEqual(['flag:1']);
  });

  it('uses the AI wording when every claim checks out', async () => {
    vi.mocked(complete).mockResolvedValueOnce(
      JSON.stringify({ bullets: [{ text: 'Room 418 reported dizziness at 1:15 PM.', factIds: ['flag:1'] }, { text: '2 patients behind: Rooms 412 and 415.', factIds: ['behind'] }] }),
    );
    const r = await summarizeUnit(facts);
    expect(r.mode).toBe('ai');
    expect(r.bullets).toHaveLength(2);
  });
});

describe('family message filter', () => {
  it.each([
    ['Hurry up, you’re being lazy', 'pressure-or-guilt'],
    ['Did they change your medication?', 'medical-content'],
    ['Call me at 215-555-0199', 'contact-info'],
    ['see www.example.com', 'link'],
  ])('blocks “%s” by rule, before any AI call', async (body, reason) => {
    const r = await filterFamilyMessage(body);
    expect(r).toMatchObject({ ok: false, reason });
    expect(complete).not.toHaveBeenCalled();
  });

  it('lets kind messages through, including ones that mention running', async () => {
    vi.mocked(aiMode).mockReturnValue('template');
    expect((await filterFamilyMessage('Can’t wait to run around the park with you!')).ok).toBe(true);
  });

  it('asks the AI about messages the rules allow', async () => {
    vi.mocked(complete).mockResolvedValueOnce(JSON.stringify({ allow: false, reason: 'distressing' }));
    expect(await filterFamilyMessage('The dog ran away and we can’t find him')).toMatchObject({ ok: false, reason: 'distressing', mode: 'ai' });
  });
});

describe('trimReply', () => {
  it('strips markdown and keeps two sentences', () => {
    expect(trimReply('**Great job!** You did it. Keep going. Yay.')).toBe('Great job! You did it.');
  });

  it('caps very long replies', () => {
    expect(trimReply('a'.repeat(400)).length).toBeLessThanOrEqual(300);
  });
});
