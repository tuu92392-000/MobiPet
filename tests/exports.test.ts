// Exports: staff only, mobility data only, labeled synthetic, and every export logged.
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDB } from '../server/store';
import { bedside, call, family, raw, staff, start, stop } from './http';

const t: Record<string, string> = {};

beforeAll(async () => {
  start();
  t.nurse = await staff('nurse1');
  t.aid = await staff('aid1');
  t.patient = await bedside('p412');
  t.family = await family('p412');
});
afterAll(stop);

/** Private text that must never leave in an export: messages, notes, AI chat, safety-flag text. */
function privateText(): string[] {
  const db = getDB();
  return [...db.messages.map((m) => m.body), ...db.notes.map((n) => n.text), ...db.chats.map((c) => c.text), ...db.flags.map((f) => f.text)].filter(
    (s) => s.length >= 12,
  );
}

describe('who can export', () => {
  it('nurses and mobility aides yes; patients and family no', async () => {
    expect((await raw('POST', '/exports', t.nurse, { scope: 'unit', format: 'csv' })).status).toBe(200);
    expect((await raw('POST', '/exports', t.aid, { scope: 'p412', format: 'xlsx' })).status).toBe(200);
    expect((await raw('POST', '/exports', t.patient, { scope: 'p412', format: 'csv' })).status).toBe(403);
    expect((await raw('POST', '/exports', t.family, { scope: 'p412', format: 'csv' })).status).toBe(403);
    expect((await raw('POST', '/exports', undefined, { scope: 'unit', format: 'csv' })).status).toBe(401);
  });

  it('only staff can read the export log, and nothing can delete it', async () => {
    expect((await call('GET', '/exports/log', t.aid)).status).toBe(200);
    expect((await call('GET', '/exports/log', t.patient)).status).toBe(403);
    expect((await call('GET', '/exports/log', t.family)).status).toBe(403);
    expect((await call('DELETE', '/exports/log', t.nurse)).status).toBe(404);
  });
});

describe('CSV', () => {
  it('starts with the synthetic label, is named by scope and date, and holds mobility data only', async () => {
    const res = await raw('POST', '/exports', t.nurse, { scope: 'p412', format: 'csv' });
    expect(res.headers.get('content-disposition')).toMatch(/filename="mobipet_room412_\d{4}-\d{2}-\d{2}\.csv"/);
    const text = await res.text();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('SYNTHETIC DEMO DATA — MobiPet');
    expect(lines[1].split(',')[0]).toBe('record_type');
    expect(text).toContain('activity,p412');
    expect(text).toContain('goal,p412');
    expect(text).toContain('shift_result,p412');
    expect(text).not.toContain('p410'); // one patient only
    for (const s of privateText()) expect(text).not.toContain(s);
  });

  it('a unit export includes every patient, and each row says who logged or confirmed it', async () => {
    await call('POST', '/patients/p411/logs/staff', t.aid, { level: 6 });
    const text = await (await raw('POST', '/exports', t.nurse, { scope: 'unit', format: 'csv' })).text();
    for (const p of getDB().patients) expect(text).toContain(`patient,${p.id}`);
    expect(text).toMatch(/activity,p411,.*Confirmed \(logged by staff\),Mobility aide,Mobility Aide 1/);
  });
});

describe('Excel', () => {
  it('has a synthetic header note on every sheet and no private text', async () => {
    const res = await raw('POST', '/exports', t.aid, { scope: 'unit', format: 'xlsx' });
    expect(res.headers.get('content-disposition')).toMatch(/filename="mobipet_unit_\d{4}-\d{2}-\d{2}\.xlsx"/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Patients', 'Activity log', 'Goals over time', 'Shift results']);
    const cells: string[] = [];
    for (const ws of wb.worksheets) {
      expect(String(ws.getCell('A1').value)).toMatch(/^SYNTHETIC DEMO DATA — MobiPet/);
      ws.eachRow((row) => row.eachCell((c) => cells.push(String(c.value))));
    }
    const all = cells.join('\n');
    for (const s of privateText()) expect(all).not.toContain(s);
  });
});

describe('export log', () => {
  it('records who, role, when, scope, format and row count for every export', async () => {
    const before = (await call('GET', '/exports/log', t.nurse)).body.length;
    const res = await raw('POST', '/exports', t.aid, { scope: 'p415', format: 'csv' });
    const log = (await call('GET', '/exports/log', t.nurse)).body;
    expect(log.length).toBe(before + 1);
    expect(log[0]).toMatchObject({ label: 'Mobility Aide 1', role: 'mobility_aid', scope: 'p415', scopeLabel: 'Room 415', format: 'csv' });
    expect(log[0].rowCount).toBe(Number(res.headers.get('x-export-rows')));
    expect(log[0].rowCount).toBeGreaterThan(0);
  });
});
