// Message visibility: a message is visible only to its sender and recipients (staff also see the unit
// thread), and the send rules match the permissions table. Runs against the real app over HTTP.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bedside, call, family, staff, start, stop } from './http';

const OWN = 'p412';
const OTHER = 'p410';
const t: Record<string, string> = {};

beforeAll(async () => {
  start();
  t.nurse1 = await staff('nurse1');
  t.aid1 = await staff('aid1');
  t.patient = await bedside(OWN);
  t.family = await family(OWN);
});
afterAll(stop);

const read = (thread: string, who: string) => call('GET', `/messages/threads/${thread}`, t[who]);
const send = (thread: string, who: string, body: string, kind = 'text') => call('POST', `/messages/threads/${thread}`, t[who], { kind, body });

describe('who can read which conversation', () => {
  it('patient: own family and care team threads only', async () => {
    expect((await read(`family:${OWN}`, 'patient')).status).toBe(200);
    expect((await read(`careteam:${OWN}`, 'patient')).status).toBe(200);
    expect((await read(`family:${OTHER}`, 'patient')).status).toBe(403);
    expect((await read(`careteam:${OTHER}`, 'patient')).status).toBe(403);
    expect((await read('unit', 'patient')).status).toBe(403);
  });

  it('family: only their own family thread, never the care team conversation', async () => {
    expect((await read(`family:${OWN}`, 'family')).status).toBe(200);
    expect((await read(`careteam:${OWN}`, 'family')).status).toBe(403);
    expect((await read(`family:${OTHER}`, 'family')).status).toBe(403);
    expect((await read('unit', 'family')).status).toBe(403);
  });

  it('staff: every care team thread and the unit thread, but not family conversations', async () => {
    expect((await read(`careteam:${OTHER}`, 'aid1')).status).toBe(200);
    expect((await read('unit', 'nurse1')).status).toBe(200);
    expect((await read(`family:${OWN}`, 'nurse1')).status).toBe(403);
  });

  it("staff can't read another pair's 1:1 thread", async () => {
    expect((await read('staff:acct_nurse1:acct_nurse2', 'aid1')).status).toBe(403);
    expect((await read('staff:acct_aid1:acct_nurse1', 'aid1')).status).toBe(200);
  });

  it('malformed or unknown thread ids are refused', async () => {
    for (const id of ['family:nobody', 'staff:acct_nurse2:acct_nurse1', 'careteam', 'unit:x', 'family:p412:extra']) {
      expect((await read(id, 'nurse1')).status).toBe(403);
    }
  });

  it('thread lists contain only threads the viewer is part of', async () => {
    const fam = await call('GET', '/messages/threads', t.family);
    expect(fam.body.map((x: { id: string }) => x.id)).toEqual([`family:${OWN}`]);
    const pat = await call('GET', '/messages/threads', t.patient);
    expect(pat.body.map((x: { id: string }) => x.id).sort()).toEqual([`careteam:${OWN}`, `family:${OWN}`]);
    const aid = await call('GET', '/messages/threads', t.aid1);
    const ids: string[] = aid.body.map((x: { id: string }) => x.id);
    expect(ids).toContain('unit');
    expect(ids.some((id) => id.startsWith('family:'))).toBe(false);
    expect(ids.filter((id) => id.startsWith('staff:')).every((id) => id.includes('acct_aid1'))).toBe(true);
  });
});

describe('who can post where', () => {
  it('family → own family thread only', async () => {
    expect((await send(`family:${OWN}`, 'family', 'Love you!')).status).toBe(201);
    expect((await send(`family:${OTHER}`, 'family', 'Hi')).status).toBe(403);
    expect((await send(`careteam:${OWN}`, 'family', 'Hi')).status).toBe(403);
  });

  it('patient → replies to family and the care team, never another patient', async () => {
    expect((await send(`family:${OWN}`, 'patient', 'Thank you!')).status).toBe(201);
    expect((await send(`careteam:${OWN}`, 'patient', 'I am ready for a walk')).status).toBe(201);
    expect((await send(`careteam:${OTHER}`, 'patient', 'Hi')).status).toBe(403);
    expect((await send('unit', 'patient', 'Hi')).status).toBe(403);
  });

  it('staff → patients (care team thread); not into family conversations', async () => {
    const r = await send(`careteam:${OWN}`, 'aid1', 'I’ll be by at 2 for a walk.');
    expect(r.status).toBe(201);
    expect(r.body.message.from).toBe('Mobility Aide 1');
    expect((await send(`family:${OWN}`, 'nurse1', 'Hello')).status).toBe(403);
  });

  it('messages to patients pass the content filter (staff included)', async () => {
    const r = await send(`careteam:${OWN}`, 'nurse1', 'Call me at 215-555-0100');
    expect(r.status).toBe(422);
    expect(r.body.reason).toBe('contact-info');
    const history = await read(`careteam:${OWN}`, 'patient');
    expect(history.body.messages.some((m: { body: string }) => m.body.includes('555'))).toBe(false);
  });

  it('a family member cannot use staff-only message kinds or tags', async () => {
    expect((await call('POST', `/messages/threads/family:${OWN}`, t.family, { kind: 'text', body: 'Hi', patientTag: OTHER })).status).toBe(400);
  });
});

describe('symptom scan on patient messages', () => {
  it('delivers the message, tells the patient to press the call button, and flags the keyword only', async () => {
    const r = await send(`family:${OWN}`, 'patient', 'I feel dizzy today but don’t tell anyone');
    expect(r.status).toBe(201);
    expect(r.body.action).toBe('call-button');
    const flags = await call('GET', '/flags', t.nurse1);
    const flag = flags.body.find((f: { patientId: string; source: string }) => f.patientId === OWN && f.source === 'message');
    expect(flag.matched).toBe('dizzy');
    expect(flag.text).not.toContain('tell anyone');
    // Still delivered to family.
    const fam = await read(`family:${OWN}`, 'family');
    expect(fam.body.messages.at(-1).body).toContain('dizzy');
  });

  it('staff messages are not scanned as patient symptoms', async () => {
    const r = await send(`careteam:${OWN}`, 'nurse1', 'Let me know if you feel dizzy when you stand.');
    expect(r.status).toBe(201);
    expect(r.body.action).toBeNull();
  });
});

describe('read state and views', () => {
  it('unread counts drop after reading', async () => {
    await send(`careteam:${OWN}`, 'aid1', 'Ready when you are!');
    const before = (await call('GET', '/messages/threads', t.patient)).body.find((x: { id: string }) => x.id === `careteam:${OWN}`);
    expect(before.unread).toBeGreaterThan(0);
    await call('POST', `/messages/threads/careteam:${OWN}/read`, t.patient);
    const after = (await call('GET', '/messages/threads', t.patient)).body.find((x: { id: string }) => x.id === `careteam:${OWN}`);
    expect(after.unread).toBe(0);
  });

  it('the family view never includes care team messages', async () => {
    const view = await call('GET', `/family/${OWN}`, t.family);
    expect(view.body.messages.some((m: { body: string }) => m.body.includes('Ready when you are'))).toBe(false);
  });
});

describe('staff messages tagged to a patient', () => {
  it('appear under the patient only for people who can already see them', async () => {
    t.aid2 = await staff('aid2');
    const aid1 = await call('GET', '/patients/p412/tagged-messages', t.aid1);
    expect(aid1.status).toBe(200);
    expect(aid1.body.length).toBeGreaterThan(0); // aid1 ↔ nurse1 thread
    const aid2 = await call('GET', '/patients/p412/tagged-messages', t.aid2);
    expect(aid2.body).toEqual([]); // not part of that 1:1 thread
    // A unit-thread tag is visible to every staff member.
    expect((await call('GET', '/patients/p418/tagged-messages', t.aid2)).body.length).toBeGreaterThan(0);
  });

  it('patients and family cannot list tagged staff messages', async () => {
    expect((await call('GET', `/patients/${OWN}/tagged-messages`, t.patient)).status).toBe(403);
    expect((await call('GET', `/patients/${OWN}/tagged-messages`, t.family)).status).toBe(403);
  });

  it('staff can tag a patient in the unit thread and 1:1 threads', async () => {
    const r = await call('POST', '/messages/threads/unit', t.nurse1, { kind: 'text', body: 'Walk at 2?', patientTag: OWN });
    expect(r.status).toBe(201);
    expect(r.body.message.patientTag).toBe(OWN);
    expect((await call('POST', '/messages/threads/staff:acct_aid1:acct_nurse1', t.aid1, { kind: 'text', body: 'On it', patientTag: OWN })).status).toBe(201);
  });
});

describe('care team → patient', () => {
  it('a staff message reaches the tablet as a card the pet delivers, and never the family view', async () => {
    const r = await send(`careteam:${OWN}`, 'nurse1', 'Your daughter called. She’ll visit at 4!');
    expect(r.status).toBe(201);
    const view = await call('GET', `/patients/${OWN}`, t.patient);
    const card = view.body.messages.find((m: { id: string }) => m.id === r.body.message.id);
    expect(card).toMatchObject({ from: 'Nurse 1', deliveredAt: null });
    expect((await call('POST', `/patients/${OWN}/messages/${card.id}/delivered`, t.patient)).status).toBe(200);
    const fam = await call('GET', `/family/${OWN}`, t.family);
    expect(fam.body.messages.some((m: { id: string }) => m.id === card.id)).toBe(false);
  });

  it("the patient's own replies are never delivered back to the patient as cards", async () => {
    const r = await send(`careteam:${OWN}`, 'patient', 'Thank you!');
    const view = await call('GET', `/patients/${OWN}`, t.patient);
    expect(view.body.messages.some((m: { id: string }) => m.id === r.body.message.id)).toBe(false);
  });
});
