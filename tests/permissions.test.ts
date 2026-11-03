// Every row of the permissions table (CLAUDE.md), including every "No": first the rules themselves,
// then the real Express app over HTTP, so a missing middleware on any route fails here.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../shared/types';
import { can, type Action, type Actor } from '../server/auth/permissions';
import { createApp } from '../server/app';
import { demoPin, STAFF_PASSWORD } from '../server/auth/accounts';
import { getDB, resetToSeed } from '../server/store';
import { BEDSIDE_IDLE_MINUTES } from '../server/auth/sessions';

const OWN = 'p412';
const OTHER = 'p410';

const actor = (role: Role): Actor => ({
  accountId: `a_${role}`,
  role,
  label: role,
  patientId: role === 'patient' || role === 'family' ? OWN : null,
});

/** Expected answer per role: true/false for unscoped rules, 'own' when only the actor's own patient is allowed. */
type Row = { action: Action; nurse: boolean | 'own'; mobility_aid: boolean | 'own'; patient: boolean | 'own'; family: boolean | 'own' };

const TABLE: Row[] = [
  { action: 'careTeam.view', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'unit.read', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'patient.read', nurse: true, mobility_aid: true, patient: 'own', family: false },
  { action: 'family.read', nurse: false, mobility_aid: false, patient: false, family: 'own' },
  { action: 'goal.set', nurse: true, mobility_aid: false, patient: false, family: false },
  { action: 'activity.selfReport', nurse: false, mobility_aid: false, patient: 'own', family: false },
  { action: 'activity.staffLog', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'activity.confirm', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'export.create', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'export.log.read', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'notes.use', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'staffMessages.use', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'unitThread.use', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'message.toPatient', nurse: true, mobility_aid: true, patient: false, family: 'own' },
  { action: 'message.patientReply', nurse: false, mobility_aid: false, patient: 'own', family: false },
  { action: 'buddies.use', nurse: false, mobility_aid: false, patient: 'own', family: false },
  { action: 'bedside.end', nurse: true, mobility_aid: true, patient: false, family: false },
  { action: 'bedside.start', nurse: true, mobility_aid: true, patient: false, family: false },
];

describe('permission rules (every row, every role)', () => {
  for (const row of TABLE) {
    for (const role of ['nurse', 'mobility_aid', 'patient', 'family'] as const) {
      const expected = row[role];
      it(`${row.action}: ${role} → ${expected === 'own' ? 'own patient only' : expected ? 'yes' : 'no'}`, () => {
        const a = actor(role);
        if (expected === 'own') {
          expect(can(a, row.action, OWN)).toBe(true);
          expect(can(a, row.action, OTHER)).toBe(false);
        } else {
          expect(can(a, row.action, OWN)).toBe(expected);
          expect(can(a, row.action, OTHER)).toBe(expected);
        }
      });
    }
  }

  it('signed-out callers can do nothing', () => {
    for (const row of TABLE) expect(can(null, row.action, OWN)).toBe(false);
  });
});

// ---- HTTP: the same rules, enforced on real routes ----

let server: Server;
let base = '';

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

async function staff(username: string) {
  const r = await call('POST', '/auth/login', undefined, { username, password: STAFF_PASSWORD });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

async function bedside(patientId: string, room: string) {
  const nurse = await staff('nurse1');
  const started = await call('POST', '/bedside/start', nurse, { patientId });
  expect(started.status).toBe(201);
  const token = started.body.token as string;
  const unlocked = await call('POST', '/bedside/unlock', token, { pin: demoPin(room) });
  expect(unlocked.status).toBe(200);
  return token;
}

async function family(code: string) {
  const r = await call('POST', '/auth/family', undefined, { code });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

const tokens: Record<'nurse' | 'aid' | 'patient' | 'family', string> = { nurse: '', aid: '', patient: '', family: '' };

beforeAll(async () => {
  resetToSeed();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokens.nurse = await staff('nurse1');
  tokens.aid = await staff('aid1');
  tokens.patient = await bedside(OWN, '412');
  tokens.family = await family('PIP-412');
});

afterAll(() => {
  server.close();
});

describe('sign-in', () => {
  it('rejects a wrong staff password and a patient account trying the staff login', async () => {
    expect((await call('POST', '/auth/login', undefined, { username: 'nurse1', password: 'nope' })).status).toBe(401);
    expect((await call('POST', '/auth/login', undefined, { username: '', password: '' })).status).toBe(401);
  });

  it('rejects a wrong family code', async () => {
    expect((await call('POST', '/auth/family', undefined, { code: 'PIP-999' })).status).toBe(404);
  });

  it('signed-out requests get 401 everywhere', async () => {
    for (const path of ['/board', '/unit', '/unit/benchmarks', `/patients/${OWN}`, `/family/${OWN}`, '/flags']) {
      expect((await call('GET', path)).status).toBe(401);
    }
  });

  it('a forged token is treated as signed out', async () => {
    expect((await call('GET', '/board', 'not-a-real-token')).status).toBe(401);
  });
});

describe('Care Team tab and unit data: staff yes, patient and family no', () => {
  for (const path of ['/board', '/unit', '/unit/benchmarks', '/flags']) {
    it(`GET ${path}`, async () => {
      expect((await call('GET', path, tokens.nurse)).status).toBe(200);
      expect((await call('GET', path, tokens.aid)).status).toBe(200);
      expect((await call('GET', path, tokens.patient)).status).toBe(403);
      expect((await call('GET', path, tokens.family)).status).toBe(403);
    });
  }

  it('POST /unit/summary', async () => {
    expect((await call('POST', '/unit/summary', tokens.aid)).status).toBe(200);
    expect((await call('POST', '/unit/summary', tokens.patient)).status).toBe(403);
    expect((await call('POST', '/unit/summary', tokens.family)).status).toBe(403);
  });
});

describe("a patient's mobility data", () => {
  it('staff can read any patient', async () => {
    expect((await call('GET', `/patients/${OTHER}`, tokens.nurse)).status).toBe(200);
    expect((await call('GET', `/patients/${OTHER}`, tokens.aid)).status).toBe(200);
  });

  it('a patient can read only their own record, even by editing the URL', async () => {
    expect((await call('GET', `/patients/${OWN}`, tokens.patient)).status).toBe(200);
    expect((await call('GET', `/patients/${OTHER}`, tokens.patient)).status).toBe(403);
    expect((await call('GET', `/family/${OWN}`, tokens.patient)).status).toBe(403);
  });

  it('family can read only their own patient, and only the family view', async () => {
    expect((await call('GET', `/family/${OWN}`, tokens.family)).status).toBe(200);
    expect((await call('GET', `/family/${OTHER}`, tokens.family)).status).toBe(403);
    expect((await call('GET', `/patients/${OWN}`, tokens.family)).status).toBe(403);
  });

  it('the AI log is staff only', async () => {
    expect((await call('GET', `/patients/${OWN}/ai-log`, tokens.aid)).status).toBe(200);
    expect((await call('GET', `/patients/${OWN}/ai-log`, tokens.patient)).status).toBe(403);
    expect((await call('GET', `/patients/${OWN}/ai-log`, tokens.family)).status).toBe(403);
  });
});

describe('setting the JH-HLM goal: nurses only', () => {
  const goal = { level: 6, reps: 2, clearance: 'independent' };
  it('nurse yes, and the goal records who set it', async () => {
    const r = await call('PUT', `/patients/${OTHER}/goal`, tokens.nurse, goal);
    expect(r.status).toBe(200);
    expect(r.body.patient.goal.setBy).toBe('Nurse 1');
  });
  it('mobility aid, patient and family no', async () => {
    expect((await call('PUT', `/patients/${OTHER}/goal`, tokens.aid, goal)).status).toBe(403);
    expect((await call('PUT', `/patients/${OWN}/goal`, tokens.patient, goal)).status).toBe(403);
    expect((await call('PUT', `/patients/${OWN}/goal`, tokens.family, goal)).status).toBe(403);
  });
});

describe('logging and confirming activity', () => {
  it('a patient can self-report only for themselves', async () => {
    expect((await call('POST', `/patients/${OWN}/logs`, tokens.patient, { level: 4 })).status).toBe(201);
    expect((await call('POST', `/patients/${OTHER}/logs`, tokens.patient, { level: 4 })).status).toBe(403);
  });

  it('family and staff cannot self-report as the patient', async () => {
    expect((await call('POST', `/patients/${OWN}/logs`, tokens.family, { level: 4 })).status).toBe(403);
    expect((await call('POST', `/patients/${OWN}/logs`, tokens.nurse, { level: 4 })).status).toBe(403);
  });

  it('staff check-offs are confirmed at once and record who logged them', async () => {
    const r = await call('POST', `/patients/${OWN}/logs/staff`, tokens.aid, { level: 4 });
    expect(r.status).toBe(201);
    expect(r.body.log.status).toBe('confirmed');
    expect(r.body.log.loggedBy).toEqual({ accountId: 'acct_aid1', role: 'mobility_aid', label: 'Mobility Aid 1' });
    expect((await call('POST', `/patients/${OWN}/logs/staff`, tokens.nurse, { level: 5 })).status).toBe(201);
  });

  it('patient and family cannot use the staff check-off', async () => {
    expect((await call('POST', `/patients/${OWN}/logs/staff`, tokens.patient, { level: 4 })).status).toBe(403);
    expect((await call('POST', `/patients/${OWN}/logs/staff`, tokens.family, { level: 4 })).status).toBe(403);
  });

  it('staff can confirm; patient and family cannot', async () => {
    const view = await call('GET', `/patients/${OWN}`, tokens.nurse);
    const pending = view.body.logs.find((l: { status: string }) => l.status === 'reported');
    expect(pending).toBeTruthy();
    expect((await call('POST', `/logs/${pending.id}/confirm`, tokens.patient)).status).toBe(403);
    expect((await call('POST', `/logs/${pending.id}/confirm`, tokens.family)).status).toBe(403);
    const confirmed = await call('POST', `/logs/${pending.id}/confirm`, tokens.aid);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.reviewedBy.label).toBe('Mobility Aid 1');
  });
});

describe('tablet-only actions belong to the bedside patient', () => {
  it('help, nudge dismiss and chat: own patient only', async () => {
    expect((await call('POST', `/patients/${OWN}/nudge/dismiss`, tokens.patient, {})).status).toBe(200);
    expect((await call('POST', `/patients/${OTHER}/help`, tokens.patient)).status).toBe(403);
    expect((await call('POST', `/patients/${OTHER}/chat`, tokens.patient, { text: 'hi' })).status).toBe(403);
    expect((await call('POST', `/patients/${OWN}/help`, tokens.family)).status).toBe(403);
  });

  it('settings: own patient or staff', async () => {
    expect((await call('PATCH', `/patients/${OWN}/settings`, tokens.patient, { textSize: 2 })).status).toBe(200);
    expect((await call('PATCH', `/patients/${OTHER}/settings`, tokens.patient, { textSize: 2 })).status).toBe(403);
    expect((await call('PATCH', `/patients/${OWN}/settings`, tokens.family, { textSize: 2 })).status).toBe(403);
  });

  it('nurse controls (mute AI, note): staff only', async () => {
    expect((await call('PATCH', `/patients/${OWN}/controls`, tokens.aid, { aiCoachingMuted: false })).status).toBe(200);
    expect((await call('PATCH', `/patients/${OWN}/controls`, tokens.patient, { aiCoachingMuted: true })).status).toBe(403);
    expect((await call('PATCH', `/patients/${OWN}/controls`, tokens.family, { aiCoachingMuted: true })).status).toBe(403);
  });
});

describe('pet setup', () => {
  it('staff can open "Help set up pet"; the patient can only close it; family cannot', async () => {
    expect((await call('POST', `/patients/${OWN}/pet/setup`, tokens.aid, { open: true })).status).toBe(200);
    expect((await call('POST', `/patients/${OWN}/pet/setup`, tokens.patient, { open: true })).status).toBe(403);
    expect((await call('POST', `/patients/${OWN}/pet/setup`, tokens.patient, { open: false })).status).toBe(200);
    expect((await call('POST', `/patients/${OTHER}/pet/setup`, tokens.patient, { open: false })).status).toBe(403);
    expect((await call('POST', `/patients/${OWN}/pet/setup`, tokens.family, { open: true })).status).toBe(403);
  });

  it('the patient can change only their own pet', async () => {
    const pet = { species: 'glimkit', palette: 1, name: 'Pepper', accessory: 'hat' };
    expect((await call('PATCH', `/patients/${OWN}/pet`, tokens.patient, pet)).status).toBe(200);
    expect((await call('PATCH', `/patients/${OTHER}/pet`, tokens.patient, pet)).status).toBe(403);
    expect((await call('PATCH', `/patients/${OWN}/pet`, tokens.family, pet)).status).toBe(403);
  });
});

describe('family messages to the patient', () => {
  const msg = { from: 'Sam', kind: 'preset', body: 'Keep going!' };
  it('own patient only', async () => {
    expect((await call('POST', `/family/${OWN}/messages`, tokens.family, msg)).status).toBe(201);
    expect((await call('POST', `/family/${OTHER}/messages`, tokens.family, msg)).status).toBe(403);
  });
  it('a patient cannot post as family', async () => {
    expect((await call('POST', `/family/${OWN}/messages`, tokens.patient, msg)).status).toBe(403);
  });
});

describe('bedside sessions', () => {
  it('only staff can start one; the tablet starts locked', async () => {
    expect((await call('POST', '/bedside/start', tokens.patient, { patientId: OTHER })).status).toBe(403);
    expect((await call('POST', '/bedside/start', tokens.family, { patientId: OTHER })).status).toBe(403);
    const r = await call('POST', '/bedside/start', tokens.aid, { patientId: OTHER });
    expect(r.status).toBe(201);
    expect(r.body.me.locked).toBe(true);
    // Locked: nothing but the lock screen.
    expect((await call('GET', `/patients/${OTHER}`, r.body.token)).status).toBe(401);
    expect((await call('GET', `/patients/${OTHER}`, r.body.token)).body.error).toBe('locked');
  });

  it('the lock screen reveals only the first name, pet and language', async () => {
    const r = await call('POST', '/bedside/start', tokens.nurse, { patientId: OTHER });
    const me = await call('GET', '/auth/me', r.body.token);
    expect(Object.keys(me.body).sort()).toEqual(['lockScreen', 'locked', 'pinBlockedUntil', 'role']);
    expect(Object.keys(me.body.lockScreen).sort()).toEqual(['firstName', 'language', 'pet']);
  });

  it('a session is bound to one patient: the PIN of another patient does not unlock it', async () => {
    const r = await call('POST', '/bedside/start', tokens.nurse, { patientId: OTHER });
    expect((await call('POST', '/bedside/unlock', r.body.token, { pin: demoPin('412') })).status).toBe(401);
    expect((await call('POST', '/bedside/unlock', r.body.token, { pin: demoPin('410') })).status).toBe(200);
  });

  it('5 wrong PINs block entry for a minute, even with the right PIN', async () => {
    const r = await call('POST', '/bedside/start', tokens.nurse, { patientId: OTHER });
    for (let i = 0; i < 4; i++) expect((await call('POST', '/bedside/unlock', r.body.token, { pin: '0000' })).status).toBe(401);
    const fifth = await call('POST', '/bedside/unlock', r.body.token, { pin: '0000' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.pinBlockedUntil).toBeGreaterThan(Date.now());
    expect((await call('POST', '/bedside/unlock', r.body.token, { pin: demoPin('410') })).status).toBe(429);
  });

  it('locking the tablet blocks data until the PIN is entered again', async () => {
    const token = await bedside(OTHER, '410');
    expect((await call('GET', `/patients/${OTHER}`, token)).status).toBe(200);
    expect((await call('POST', '/bedside/lock', token)).status).toBe(200);
    expect((await call('GET', `/patients/${OTHER}`, token)).status).toBe(401);
    expect((await call('POST', '/bedside/unlock', token, { pin: demoPin('410') })).status).toBe(200);
    expect((await call('GET', `/patients/${OTHER}`, token)).status).toBe(200);
  });

  it('staff can end a session; patient and family cannot', async () => {
    const token = await bedside(OTHER, '410');
    expect((await call('POST', `/patients/${OTHER}/bedside/end`, token)).status).toBe(403);
    expect((await call('POST', `/patients/${OTHER}/bedside/end`, tokens.family)).status).toBe(403);
    expect((await call('POST', `/patients/${OTHER}/bedside/end`, tokens.aid)).status).toBe(200);
    expect((await call('GET', `/patients/${OTHER}`, token)).status).toBe(401);
  });
});

describe('inactivity lock', () => {
  it(`the server re-locks a bedside session after ${BEDSIDE_IDLE_MINUTES} idle minutes`, async () => {
    const token = await bedside(OTHER, '410');
    expect((await call('GET', `/patients/${OTHER}`, token)).status).toBe(200);
    const session = getDB().sessions.find((s) => s.token === token)!;
    session.lastActiveAt = Date.now() - (BEDSIDE_IDLE_MINUTES * 60_000 + 1000);
    const r = await call('GET', `/patients/${OTHER}`, token);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('locked');
  });

  it('a touch keeps the session open', async () => {
    const token = await bedside(OTHER, '410');
    const session = getDB().sessions.find((s) => s.token === token)!;
    session.lastActiveAt = Date.now() - (BEDSIDE_IDLE_MINUTES * 60_000 - 5000);
    expect((await call('POST', '/auth/activity', token)).status).toBe(200);
    expect((await call('GET', `/patients/${OTHER}`, token)).status).toBe(200);
  });
});

describe('demo switcher flag', () => {
  it('MOBIPET_DEMO_SWITCHER=false removes the switcher and every demo tool', async () => {
    expect((await call('GET', '/demo/accounts')).status).toBe(200);
    process.env.MOBIPET_DEMO_SWITCHER = 'false';
    try {
      expect((await call('GET', '/demo/accounts')).status).toBe(404);
      expect((await call('POST', '/demo/reset')).status).toBe(404);
      expect((await call('GET', '/auth/config')).body.demoSwitcher).toBe(false);
    } finally {
      delete process.env.MOBIPET_DEMO_SWITCHER;
    }
  });
});

describe('live events', () => {
  it('the stream refuses signed-out callers', async () => {
    expect((await fetch(`${base}/api/events`)).status).toBe(401);
    expect((await fetch(`${base}/api/events?token=forged`)).status).toBe(401);
  });
});

describe('demo scenarios (v2)', () => {
  it('each new scenario runs through the real rules', async () => {
    const run = (name: string, patientId?: string) => call('POST', `/demo/scenarios/${name}`, undefined, { patientId });
    expect((await run('aid-check-off', 'p413')).body.ok).toBe(true);
    expect((await run('dizzy-message', 'p413')).body.ok).toBe(true);
    const flags = await call('GET', '/flags', tokens.nurse);
    expect(flags.body.some((f: { patientId: string; source: string; text: string }) => f.patientId === 'p413' && f.source === 'message' && !f.text.includes('after my walk'))).toBe(true);
    expect((await run('buddy-cheer', 'p416')).body.ok).toBe(true);
    expect((await run('buddy-cheer', 'p412')).status).toBe(400);
    expect((await run('nurse-export')).body.ok).toBe(true);
    expect((await call('GET', '/exports/log', tokens.nurse)).body[0].label).toBe('Nurse 1');
    expect((await run('lock-tablet', OWN)).body.ok).toBe(true);
    expect((await call('GET', `/patients/${OWN}`, tokens.patient)).body.error).toBe('locked');
    expect((await call('POST', '/bedside/unlock', tokens.patient, { pin: demoPin('412') })).status).toBe(200);
  });
});
