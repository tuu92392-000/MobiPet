// Sign-in sessions. Bedside sessions are bound to one patient, start locked, and re-lock after inactivity.
import { randomToken } from './hash';
import type { Account, AuthSession } from '../../shared/types';
import { getDB, mutateQuiet } from '../store';

/** Minutes of no touch before the bedside tablet re-locks. */
export const BEDSIDE_IDLE_MINUTES = Number(process.env.MOBIPET_BEDSIDE_IDLE_MINUTES ?? 5);
export const MAX_PIN_TRIES = 5;
export const PIN_BLOCK_MS = 60_000;

/** Session timing uses real time, so fast-forwarding the demo clock never locks a tablet. */
export const realNow = () => Date.now();

export function createSession(account: Account, kind: AuthSession['kind'], startedBy: string | null = null): AuthSession {
  const session: AuthSession = {
    token: randomToken(),
    accountId: account.id,
    kind,
    createdAt: realNow(),
    lastActiveAt: realNow(),
    locked: kind === 'bedside',
    pinFails: 0,
    pinBlockedUntil: null,
    startedBy,
  };
  mutateQuiet((db) => {
    // One bedside session per patient: starting a new one replaces the old tablet's.
    if (kind === 'bedside') db.sessions = db.sessions.filter((s) => !(s.kind === 'bedside' && s.accountId === account.id));
    db.sessions.push(session);
  });
  return session;
}

export function findSession(token: string | undefined): { session: AuthSession; account: Account } | null {
  if (!token) return null;
  const db = getDB();
  const session = db.sessions.find((s) => s.token === token);
  const account = session && db.accounts.find((a) => a.id === session.accountId);
  if (!session || !account) return null;
  if (session.kind === 'bedside' && !session.locked && realNow() - session.lastActiveAt > BEDSIDE_IDLE_MINUTES * 60_000) {
    mutateQuiet(() => {
      session.locked = true;
    });
  }
  return { session, account };
}

export function touch(session: AuthSession) {
  mutateQuiet(() => {
    session.lastActiveAt = realNow();
  });
}

export function endSessions(match: (s: AuthSession) => boolean) {
  mutateQuiet((db) => {
    db.sessions = db.sessions.filter((s) => !match(s));
  });
}
