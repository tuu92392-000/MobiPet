// Sign-in: staff (username + password), family (invite code), and staff-started bedside sessions (PIN).
import { Router, type Request } from 'express';
import type { Account, AuthSession } from '../../shared/types';
import { checkSecret, codeLookup } from '../auth/accounts';
import { requireCan } from '../auth/middleware';
import { isStaff } from '../auth/permissions';
import {
  BEDSIDE_IDLE_MINUTES, createSession, endSessions, MAX_PIN_TRIES, PIN_BLOCK_MS, realNow, touch,
} from '../auth/sessions';
import { findPatient, getDB, mutateQuiet, now } from '../store';
import { bus } from '../events';
import { demoToolsEnabled } from './demo';

export const auth = Router();

/** What the signed-in client needs to know about itself. A locked tablet learns only what the lock screen shows. */
function meView(account: Account, session: AuthSession) {
  const p = account.patientId ? findPatient(account.patientId) : undefined;
  if (session.locked) {
    return {
      locked: true as const,
      role: account.role,
      pinBlockedUntil: session.pinBlockedUntil && session.pinBlockedUntil > realNow() ? session.pinBlockedUntil : null,
      lockScreen: p ? { firstName: p.firstName, pet: p.pet, language: p.settings.language } : null,
    };
  }
  return {
    locked: false as const,
    accountId: account.id,
    role: account.role,
    label: account.label,
    patientId: account.patientId,
    bedside: session.kind === 'bedside',
  };
}

/** Tell the patient's tablet its session changed, so an ended session drops to the sign-in screen at once. */
const announce = (patientId: string) => bus.emit('change', { kind: 'session', patientId, at: now() });

const signedIn = (session: AuthSession, account: Account) => ({ token: session.token, me: meView(account, session) });

auth.get('/auth/config', (_req, res) => {
  res.json({ demoSwitcher: demoToolsEnabled(), bedsideIdleMinutes: BEDSIDE_IDLE_MINUTES });
});

auth.post('/auth/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const account = getDB().accounts.find((a) => a.username === username && isStaff(a.role));
  if (!account || !checkSecret(account, password)) {
    return res.status(401).json({ error: 'bad-credentials', message: 'That username and password did not match.' });
  }
  res.json(signedIn(createSession(account, 'staff'), account));
});

auth.post('/auth/family', (req, res) => {
  const lookup = codeLookup(String(req.body?.code ?? ''));
  const account = getDB().accounts.find((a) => a.role === 'family' && a.codeLookup === lookup);
  if (!account) return res.status(404).json({ error: 'That code did not match. Please check with the care team.' });
  res.json(signedIn(createSession(account, 'family'), account));
});

auth.get('/auth/me', (req, res) => {
  if (!req.session || !req.account) return res.status(401).json({ error: 'signed-out' });
  res.json(meView(req.account, req.session));
});

auth.post('/auth/logout', (req, res) => {
  const token = req.session?.token;
  if (token) endSessions((s) => s.token === token);
  res.json({ ok: true });
});

// The tablet reports a touch so the inactivity lock only counts real idle time.
auth.post('/auth/activity', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'signed-out' });
  if (req.session.locked) return res.status(401).json({ error: 'locked' });
  touch(req.session);
  res.json({ ok: true });
});

const bedsideSession = (req: Request) => (req.session?.kind === 'bedside' ? req.session : null);

/** Staff hand the tablet to the patient: returns a new, locked session bound to that one patient. */
auth.post('/bedside/start', requireCan('bedside.start'), (req, res) => {
  const patientId = String(req.body?.patientId ?? '');
  const account = getDB().accounts.find((a) => a.role === 'patient' && a.patientId === patientId);
  if (!account) return res.status(404).json({ error: 'Patient not found' });
  const session = createSession(account, 'bedside', req.actor!.accountId);
  announce(patientId);
  res.status(201).json(signedIn(session, account));
});

auth.post('/bedside/unlock', (req, res) => {
  const session = bedsideSession(req);
  if (!session || !req.account) return res.status(401).json({ error: 'signed-out' });
  if (session.pinBlockedUntil && session.pinBlockedUntil > realNow()) {
    return res.status(429).json({ error: 'pin-blocked', pinBlockedUntil: session.pinBlockedUntil });
  }
  const pin = String(req.body?.pin ?? '');
  if (!/^\d{4}$/.test(pin) || !checkSecret(req.account, pin)) {
    const blocked = mutateQuiet(() => {
      session.pinFails += 1;
      if (session.pinFails >= MAX_PIN_TRIES) {
        session.pinFails = 0;
        session.pinBlockedUntil = realNow() + PIN_BLOCK_MS;
        return true;
      }
      return false;
    });
    if (blocked) return res.status(429).json({ error: 'pin-blocked', pinBlockedUntil: session.pinBlockedUntil });
    return res.status(401).json({ error: 'wrong-pin', triesLeft: MAX_PIN_TRIES - session.pinFails });
  }
  mutateQuiet(() => {
    session.locked = false;
    session.pinFails = 0;
    session.pinBlockedUntil = null;
    session.lastActiveAt = realNow();
  });
  res.json(signedIn(session, req.account));
});

auth.post('/bedside/lock', (req, res) => {
  const session = bedsideSession(req);
  if (!session) return res.status(401).json({ error: 'signed-out' });
  mutateQuiet(() => {
    session.locked = true;
  });
  res.json({ ok: true });
});

auth.get('/patients/:id/bedside', requireCan('bedside.start', () => null), (req, res) => {
  const account = getDB().accounts.find((a) => a.role === 'patient' && a.patientId === req.params.id);
  const session = account && getDB().sessions.find((s) => s.kind === 'bedside' && s.accountId === account.id);
  // Shown on the board, which runs on the simulated clock.
  res.json(session ? { active: true, locked: session.locked, since: session.createdAt + getDB().clockOffsetMs } : { active: false });
});

// Staff end the bedside session (e.g. at discharge). The tablet drops back to the sign-in screen.
auth.post('/patients/:id/bedside/end', requireCan('bedside.end', () => null), (req, res) => {
  const accountId = `acct_${req.params.id}`;
  endSessions((s) => s.kind === 'bedside' && s.accountId === accountId);
  announce(req.params.id);
  res.json({ ok: true });
});
