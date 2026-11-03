// The browser-only demo (npm run build:demo) runs the real routes in the page. These checks run its
// transport with the same module swaps as client/vite.demo.config.ts, to show the permission rules,
// template-only AI and in-page live events all still hold without a server.
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('express', () => import('../client/demo/express'));
vi.mock('../server/store', () => import('../client/demo/store'));
vi.mock('../server/events', () => import('../client/demo/events'));
vi.mock('../server/ai/client', () => import('../client/demo/aiClient'));
vi.mock('../server/ai/log', () => import('../client/demo/aiLog'));
vi.mock('../server/auth/hash', () => import('../client/demo/hash'));

const { transport } = await import('../client/demo/transport');
const { demoPin, STAFF_PASSWORD } = await import('../server/auth/accounts');

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await transport(url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

const t: Record<string, string> = {};

beforeAll(async () => {
  t.nurse = (await call('POST', '/auth/login', undefined, { username: 'nurse1', password: STAFF_PASSWORD })).body.token;
  t.aid = (await call('POST', '/auth/login', undefined, { username: 'aid1', password: STAFF_PASSWORD })).body.token;
  const started = await call('POST', '/bedside/start', t.nurse, { patientId: 'p412' });
  t.patient = started.body.token;
  await call('POST', '/bedside/unlock', t.patient, { pin: demoPin('412') });
  t.family = (await call('POST', '/auth/family', undefined, { code: 'PIP-412' })).body.token;
});

describe('browser-only demo layer', () => {
  it('enforces the same permissions as the server', async () => {
    expect((await call('GET', '/board', t.aid)).status).toBe(200);
    expect((await call('GET', '/board', t.patient)).status).toBe(403);
    expect((await call('GET', '/patients/p410', t.patient)).status).toBe(403);
    expect((await call('GET', '/family/p410', t.family)).status).toBe(403);
    expect((await call('PUT', '/patients/p412/goal', t.aid, { level: 5, reps: 2 })).status).toBe(403);
    expect((await call('PUT', '/patients/p412/goal', t.nurse, { level: 5, reps: 2 })).status).toBe(200);
    expect((await call('GET', '/notes', t.family)).status).toBe(403);
    expect((await call('GET', '/board')).status).toBe(401);
    expect((await call('POST', '/bedside/unlock', 'forged', { pin: '0000' })).status).toBe(401);
  });

  it('uses templates only (no AI), with the symptom check first', async () => {
    expect((await call('GET', '/health')).body.aiMode).toBe('template');
    const chat = await call('POST', '/patients/p412/chat', t.patient, { text: 'I feel dizzy' });
    expect(chat.body.action).toBe('call-button');
    const coach = await call('POST', '/patients/p412/chat', t.patient, { text: 'What is my goal?' });
    expect(coach.body.turns.at(-1).mode).toBe('template');
  });

  it('builds exports in the page and logs them', async () => {
    const res = await transport('/exports', { method: 'POST', headers: { Authorization: `Bearer ${t.aid}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'p412', format: 'csv' }) });
    expect(res.status).toBe(200);
    expect((await res.text()).split('\r\n')[0]).toBe('SYNTHETIC DEMO DATA — MobiPet');
    expect((await call('GET', '/exports/log', t.nurse)).body[0].scope).toBe('p412');
  });

  it('never hands the page a live reference into the data', async () => {
    const a = await call('GET', '/patients/p412', t.patient);
    a.body.patient.firstName = 'Changed';
    expect((await call('GET', '/patients/p412', t.patient)).body.patient.firstName).toBe('Odessa');
  });
});
