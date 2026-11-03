// Private notes: visible only to their author (CLAUDE.md permissions, "Own notes only").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bedside, call, family, staff, start, stop } from './http';

const t: Record<string, string> = {};

beforeAll(async () => {
  start();
  t.nurse1 = await staff('nurse1');
  t.nurse2 = await staff('nurse2');
  t.aid1 = await staff('aid1');
  t.patient = await bedside('p412');
  t.family = await family('p412');
});
afterAll(stop);

describe('private notes', () => {
  it('each staff member sees only their own notes', async () => {
    const mine = await call('GET', '/notes', t.nurse1);
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect(mine.body.every((n: { authorId: string }) => n.authorId === 'acct_nurse1')).toBe(true);
    const other = await call('GET', '/notes', t.nurse2);
    expect(other.body.some((n: { authorId: string }) => n.authorId !== 'acct_nurse2')).toBe(false);
  });

  it('create, edit and delete by the author, with timestamps', async () => {
    const created = await call('POST', '/notes', t.aid1, { text: 'Bring the walker', patientId: 'p415' });
    expect(created.status).toBe(201);
    expect(created.body.createdAt).toBeGreaterThan(0);
    const id = created.body.id;
    const edited = await call('PATCH', `/notes/${id}`, t.aid1, { text: 'Bring the walker and gait belt' });
    expect(edited.status).toBe(200);
    expect(edited.body.updatedAt).toBeGreaterThanOrEqual(created.body.updatedAt);
    expect((await call('GET', '/notes?patientId=p415', t.aid1)).body.map((n: { id: string }) => n.id)).toContain(id);
    expect((await call('DELETE', `/notes/${id}`, t.aid1)).status).toBe(200);
    expect((await call('GET', '/notes?patientId=p415', t.aid1)).body.map((n: { id: string }) => n.id)).not.toContain(id);
  });

  it("another staff member can't read, edit or delete someone else's note", async () => {
    const created = await call('POST', '/notes', t.nurse1, { text: 'Private reminder' });
    const id = created.body.id;
    expect((await call('PATCH', `/notes/${id}`, t.nurse2, { text: 'changed' })).status).toBe(404);
    expect((await call('DELETE', `/notes/${id}`, t.aid1)).status).toBe(404);
    expect((await call('GET', '/notes', t.nurse2)).body.map((n: { id: string }) => n.id)).not.toContain(id);
  });

  it('patients and family have no notes at all', async () => {
    expect((await call('GET', '/notes', t.patient)).status).toBe(403);
    expect((await call('POST', '/notes', t.family, { text: 'hi' })).status).toBe(403);
  });
});
