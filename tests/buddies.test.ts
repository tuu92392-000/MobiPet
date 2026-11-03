// Walking buddies: opt-in, anonymous, preset-only, rate-limited, and under care team control.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDB } from '../server/store';
import { bedside, call, family, staff, start, stop } from './http';

const t: Record<string, string> = {};
const handle = (room: string) => getDB().patients.find((p) => p.room === room)!.buddyHandle;
const cheer = (who: string, room: string, toRoom: string, body = 'keep-going') =>
  call('POST', `/patients/p${room}/buddies/cheer`, t[who], { to: handle(toRoom), body });

beforeAll(async () => {
  start();
  t.p410 = await bedside('p410'); // opted in (seed)
  t.p416 = await bedside('p416'); // opted in, also "Pip" the cloud
  t.p412 = await bedside('p412'); // not opted in
  t.nurse = await staff('nurse1');
  t.family = await family('p410');
});
afterAll(stop);

describe('anonymous', () => {
  it('other patients appear only as their pet, never with a name, room or id', async () => {
    const r = await call('GET', '/patients/p410/buddies', t.p410);
    expect(r.status).toBe(200);
    const json = JSON.stringify(r.body);
    for (const p of getDB().patients.filter((x) => x.id !== 'p410')) {
      expect(json).not.toContain(p.id);
      expect(json).not.toContain(`"${p.room}"`);
      expect(json).not.toContain(p.firstName);
    }
    expect(Object.keys(r.body.buddies[0]).sort()).toEqual(['accessory', 'colorWord', 'handle', 'name', 'palette', 'species', 'speciesWord']);
  });

  it('adds a color word when two buddies share a pet name and species', async () => {
    const r = await call('GET', '/patients/p411/buddies', await bedside('p411'));
    const pips = r.body.buddies.filter((b: { name: string; species: string }) => b.name === 'Pip' && b.species === 'nimbus');
    expect(pips).toHaveLength(2);
    expect(new Set(pips.map((b: { colorWord: string }) => b.colorWord)).size).toBe(2);
    expect(r.body.buddies.find((b: { name: string }) => b.name === 'Clover')).toBeUndefined(); // 411 is the viewer
  });
});

describe('preset only, opt-in only', () => {
  it('rejects anything that is not a preset message or sticker', async () => {
    expect((await call('POST', '/patients/p410/buddies/cheer', t.p410, { to: handle('416'), body: 'Call me at room 412' })).status).toBe(400);
    expect((await cheer('p410', '410', '416', 'thumbs-up')).status).toBe(201);
  });

  it('a patient who has not opted in can neither send nor receive', async () => {
    expect((await cheer('p412', '412', '410')).status).toBe(403);
    expect((await cheer('p410', '410', '412')).status).toBe(404);
    expect((await call('GET', '/patients/p412/buddies', t.p412)).body.buddies).toEqual([]);
  });

  it('only the patient can opt in; staff can turn it off', async () => {
    expect((await call('PATCH', '/patients/p412/settings', t.nurse, { buddies: true })).status).toBe(200);
    expect(getDB().patients.find((p) => p.id === 'p412')!.settings.buddies).toBe(false);
    await call('PATCH', '/patients/p416/controls', t.nurse, { buddiesBlockedByStaff: true });
    expect((await cheer('p416', '416', '410')).status).toBe(403);
    expect((await cheer('p410', '410', '416')).status).toBe(404);
    await call('PATCH', '/patients/p416/controls', t.nurse, { buddiesBlockedByStaff: false });
  });

  it('family and staff cannot send cheers, and patients only from their own tablet', async () => {
    expect((await call('POST', '/patients/p410/buddies/cheer', t.family, { to: handle('416'), body: 'proud' })).status).toBe(403);
    expect((await call('POST', '/patients/p410/buddies/cheer', t.nurse, { to: handle('416'), body: 'proud' })).status).toBe(403);
    expect((await call('POST', '/patients/p416/buddies/cheer', t.p410, { to: handle('410'), body: 'proud' })).status).toBe(403);
  });
});

describe('rate limits', () => {
  it('at most 5 sends per patient per day', async () => {
    // p410 sent one above; four more are allowed, then the server refuses.
    getDB().buddyCheers.splice(0); // only today's cheers from this test
    for (let i = 0; i < 5; i++) expect((await cheer('p410', '410', i % 2 ? '413' : '417', 'proud')).status).toBe(201);
    expect((await cheer('p410', '410', '413')).status).toBe(429);
    expect((await call('GET', '/patients/p410/buddies', t.p410)).body.canSendToday).toBe(false);
  });

  it('a buddy receives at most 10 per day', async () => {
    getDB().buddyCheers.splice(0);
    const at = Date.now();
    for (let i = 0; i < 10; i++) getDB().buddyCheers.push({ id: `c${i}`, at: at + getDB().clockOffsetMs, fromPatientId: 'p413', toPatientId: 'p417', body: 'proud' });
    const r = await cheer('p416', '416', '417');
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('receive-limit');
  });
});
