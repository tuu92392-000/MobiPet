// The browser-only demo's data: the same in-memory DB as server/store.ts, saved in this visitor's
// localStorage instead of a file. Every storage call is wrapped: private windows and blocked storage
// still work, the data just lasts until the page is closed. Replaces server/store.ts.
import type { DB, Patient } from '../../shared/types';
import { buildSeed } from '../../server/seed';
import { bus } from '../../server/events';

const KEY = 'mobipet.demo.db';

let db: DB = load();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function read(): DB | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as DB) : null;
    return parsed && parsed.version === 2 && Array.isArray(parsed.buddyCheers) ? parsed : null;
  } catch {
    return null;
  }
}

function load(): DB {
  const saved = read();
  if (saved) return saved;
  const seeded = buildSeed();
  writeNow(seeded);
  return seeded;
}

function writeNow(data: DB) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable or full: keep going in memory.
  }
}

function scheduleSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeNow(db), 150);
}

// Another tab of the demo changed the data: pick it up and refresh this tab's views.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const saved = read();
    if (!saved) return;
    db = saved;
    bus.emit('change', { kind: 'reset', patientId: null, at: now() });
  });
}

export function getDB(): Readonly<DB> {
  return db;
}

export function now(): number {
  return Date.now() + db.clockOffsetMs;
}

export type ChangeKind = 'patient' | 'log' | 'flag' | 'message' | 'chat' | 'clock' | 'reset' | 'export' | 'buddy';

export function mutate<T>(kind: ChangeKind, patientId: string | null, fn: (db: DB) => T): T {
  const result = fn(db);
  scheduleSave();
  bus.emit('change', { kind, patientId, at: now() });
  return result;
}

export function mutateQuiet<T>(fn: (db: DB) => T): T {
  const result = fn(db);
  scheduleSave();
  return result;
}

export function findPatient(id: string): Patient | undefined {
  return db.patients.find((p) => p.id === id);
}

export function resetToSeed() {
  const sessions = db.sessions;
  db = buildSeed();
  db.sessions = sessions.filter((s) => db.accounts.some((a) => a.id === s.accountId));
  writeNow(db);
  bus.emit('change', { kind: 'reset', patientId: null, at: now() });
}

export function flushSync() {
  writeNow(db);
}
