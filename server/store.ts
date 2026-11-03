// In-memory store with debounced JSON persistence so the demo survives a restart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB, Patient } from '../shared/types';
import { buildSeed } from './seed';
import { bus } from './events';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const DB_FILE = path.join(DATA_DIR, 'mobipet-db.json');
/** Tests run fully in memory so they never touch the demo data file. */
const PERSIST = process.env.MOBIPET_PERSIST !== 'false';

let db: DB = load();
let saveTimer: NodeJS.Timeout | null = null;

function load(): DB {
  if (!PERSIST) return buildSeed();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DB;
    if (parsed.version === 2) return parsed;
  } catch {
    // Missing or unreadable: fall through to seed.
  }
  const seeded = buildSeed();
  writeNow(seeded);
  return seeded;
}

function writeNow(data: DB) {
  if (!PERSIST) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeNow(db), 200);
}

export function getDB(): Readonly<DB> {
  return db;
}

/** Simulated "now" used for every timestamp in the app. */
export function now(): number {
  return Date.now() + db.clockOffsetMs;
}

export type ChangeKind = 'patient' | 'log' | 'flag' | 'message' | 'chat' | 'clock' | 'reset' | 'export' | 'buddy';

/** All writes go through here: mutate, persist, and notify live views. */
export function mutate<T>(kind: ChangeKind, patientId: string | null, fn: (db: DB) => T): T {
  const result = fn(db);
  scheduleSave();
  bus.emit('change', { kind, patientId, at: now() });
  return result;
}

/** Writes that no live view needs to hear about (sign-in sessions, activity timestamps). */
export function mutateQuiet<T>(fn: (db: DB) => T): T {
  const result = fn(db);
  scheduleSave();
  return result;
}

export function findPatient(id: string): Patient | undefined {
  return db.patients.find((p) => p.id === id);
}

export function resetToSeed() {
  // Account ids are stable across reseeds, so whoever is signed in stays signed in.
  const sessions = db.sessions;
  db = buildSeed();
  db.sessions = sessions.filter((s) => db.accounts.some((a) => a.id === s.accountId));
  writeNow(db);
  bus.emit('change', { kind: 'reset', patientId: null, at: now() });
}

export function flushSync() {
  if (saveTimer) clearTimeout(saveTimer);
  writeNow(db);
}
