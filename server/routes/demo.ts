import { Router, type Request, type Response } from 'express';
import type { Patient, ShiftName } from '../../shared/types';
import { isRestGoal, JHHLM } from '../../shared/jhhlm';
import { goalProgress } from '../../shared/progression';
import { MINUTE, nextShiftStart, shiftAt } from '../../shared/shifts';
import { findPatient, getDB, mutate, mutateQuiet, now, resetToSeed } from '../store';
import { bus } from '../events';
import { staffRef } from '../auth/permissions';
import { parseThread, sendMessage } from '../messages';
import { buildTables, dateTag, rowCount } from '../exports';
import { clearAiLog } from '../ai/log';
import { coachReply, makeNudge } from '../ai/pipeline';
import { recordActivity } from '../activity';
import { newId } from '../seed';
import { demoPin, patientAccounts, STAFF, STAFF_PASSWORD } from '../auth/accounts';

export const demo = Router();

/** Presenter tools (switcher, clock, scenarios, reset). MOBIPET_DEMO_SWITCHER=false turns them all off. */
export const demoToolsEnabled = () => process.env.MOBIPET_DEMO_SWITCHER !== 'false';

demo.use(['/demo', '/clock'], (_req, res, next) => {
  if (!demoToolsEnabled()) return res.status(404).json({ error: 'Not found' });
  next();
});

/**
 * Demo switcher: the seeded credentials, so one tap can sign in through the real sign-in flow.
 * A real deployment turns this off; it exists only because every account here is synthetic.
 */
demo.get('/demo/accounts', (_req, res) => {
  const db = getDB();
  const byPatient = new Map(db.patients.map((p) => [p.id, p]));
  res.json({
    staffPassword: STAFF_PASSWORD,
    staff: STAFF.map(({ label, role, username }) => ({ label, role, username })),
    patients: db.patients.map((p) => ({ patientId: p.id, room: p.room, name: `${p.firstName} ${p.lastInitial}.`, pin: demoPin(p.room), pet: p.pet })),
    family: db.accounts
      .filter((a) => a.role === 'family')
      .map((a) => ({ label: a.label, patientId: a.patientId, code: byPatient.get(a.patientId ?? '')?.familyCode ?? '' })),
  });
});

demo.get('/clock', (_req, res) => res.json({ now: now(), shift: shiftAt(now()) }));

// Fast-forward simulated time, or jump to the start of the next named shift.
demo.post('/demo/clock', (req, res) => {
  const { advanceMinutes, shift } = req.body ?? {};
  if (typeof advanceMinutes === 'number' && advanceMinutes > 0 && advanceMinutes <= 24 * 60) {
    mutate('clock', null, (db) => {
      db.clockOffsetMs += advanceMinutes * MINUTE;
    });
  } else if (['day', 'evening', 'night'].includes(shift)) {
    const target = nextShiftStart(now(), shift as ShiftName);
    mutate('clock', null, (db) => {
      db.clockOffsetMs += target - now();
    });
  } else {
    return res.status(400).json({ error: 'Pass advanceMinutes (1–1440) or shift (day|evening|night)' });
  }
  res.json({ now: now(), shift: shiftAt(now()) });
});

// Scenario: a new admission arrives in Room 420 and has not picked a companion yet.
demo.post('/demo/scenarios/new-admission', (_req, res) => {
  const patient = mutate('patient', 'p420', (db) => {
    const t = now();
    db.patients = db.patients.filter((p) => p.id !== 'p420');
    db.logs = db.logs.filter((l) => l.patientId !== 'p420');
    db.flags = db.flags.filter((f) => f.patientId !== 'p420');
    db.messages = db.messages.filter((m) => m.patientId !== 'p420');
    db.chats = db.chats.filter((c) => c.patientId !== 'p420');
    db.accounts = db.accounts.filter((a) => a.patientId !== 'p420');
    db.notes = db.notes.filter((n) => n.patientId !== 'p420');
    db.buddyCheers = db.buddyCheers.filter((c) => c.fromPatientId !== 'p420' && c.toPatientId !== 'p420');
    db.sessions = db.sessions.filter((s) => !s.accountId.endsWith('p420'));
    const p: Patient = {
      id: 'p420', firstName: 'Rosalind', lastInitial: 'F', room: '420', cohort: 'med-surg',
      admittedAt: t, clearance: 'independent',
      goal: { level: 6, reps: 2, setBy: 'Nurse 1', setAt: t },
      goalHistory: [{ level: 6, reps: 2, setBy: 'Nurse 1', setAt: t }],
      pet: null, journeySteps: 0,
      settings: { language: 'en', textSize: 1, highContrast: false, readAloud: false, sound: true, volume: 0.6, buddies: false },
      motivators: ['her book club'], aiCoachingMuted: false,
      nudgesPausedUntil: null, nudgeSnoozedUntil: null, lastNudgeAt: null, nurseNote: null,
      familyCode: 'PIP-420',
      buddyHandle: 'buddy_p420demo',
      buddiesBlockedByStaff: false,
    };
    db.patients.push(p);
    db.accounts.push(...patientAccounts(p, demoPin(p.room)));
    return p;
  });
  res.status(201).json({ patientId: patient.id });
});

function scenarioPatient(req: Request, res: Response): Patient | null {
  const p = findPatient(String(req.body?.patientId ?? ''));
  if (!p) res.status(404).json({ error: 'Pick a patient first' });
  return p ?? null;
}

// Scenario: the patient logs goal-level activities until this shift's goal is met (tablet celebrates live).
demo.post('/demo/scenarios/meet-goal', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  if (isRestGoal(p.goal)) return res.status(400).json({ error: `Room ${p.room} has a rest goal this shift` });
  if (!p.pet) return res.status(400).json({ error: `Room ${p.room} hasn't picked a companion yet` });
  const db = getDB();
  const done = goalProgress(db.logs.filter((l) => l.patientId === p.id), p.goal, shiftAt(now()));
  if (done >= p.goal.reps) return res.status(409).json({ error: `Room ${p.room} already met this shift's goal` });
  let last = null;
  for (let i = done; i < p.goal.reps; i++) last = recordActivity(p, p.goal.level, 'patient');
  res.json({ ok: true, message: `Room ${p.room} logged ${p.goal.reps - done} × ${JHHLM[p.goal.level].nurse}`, progression: last?.progression });
});

// Scenario: the patient tells Pip they feel dizzy — the same pipeline the tablet uses.
demo.post('/demo/scenarios/dizziness', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  const text = p.settings.language === 'es' ? 'Me siento mareado' : 'I feel dizzy';
  coachReply(p, text)
    .then((r) => res.json({ ok: true, message: `Room ${p.room} said “${text}” → ${r.turns[1].guardrail}`, action: r.action }))
    .catch(() => res.status(500).json({ error: 'Something went wrong' }));
});

// Scenario: a family member sends a cheer through the same filter and delivery flow as the family view.
demo.post('/demo/scenarios/family-cheer', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  const es = p.settings.language === 'es';
  mutate('message', p.id, (db) => {
    db.messages.push({
      id: newId('msg'), threadId: `family:${p.id}`, patientId: p.id, at: now(),
      fromAccountId: `acct_fam_${p.id}`, fromRole: 'family', from: es ? 'Rosie (nieta)' : 'Rosie (granddaughter)',
      kind: 'preset', body: es ? '¡Estamos muy orgullosos de ti!' : 'So proud of you!', blocked: false, deliveredAt: null,
      readBy: [`acct_fam_${p.id}`],
    });
  });
  res.json({ ok: true, message: `Cheer sent to Room ${p.room}` });
});

const NUDGE_REASON: Record<string, string> = {
  'no-pet': 'no companion picked yet',
  'paused-by-nurse': 'the nurse paused nudges',
  'rest-goal': 'rest goal this shift',
  'goal-met': 'goal already met this shift',
  'open-safety-flag': 'a safety flag is open (acknowledge it first)',
  night: 'it’s night shift',
};

// Scenario: the lunch tray was just collected. Clears the hourly limit for the demo; every other nudge rule still applies.
demo.post('/demo/scenarios/meal', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  mutate('patient', p.id, () => {
    p.lastNudgeAt = null;
    p.nudgeSnoozedUntil = null;
    p.activeNudge = null;
  });
  makeNudge(p, 'meal')
    .then((r) =>
      res.json('skipped' in r ? { ok: false, message: `No nudge for Room ${p.room}: ${NUDGE_REASON[r.skipped] ?? r.skipped}.` } : { ok: true, message: `Nudge sent: “${r.text}”` }),
    )
    .catch(() => res.status(500).json({ error: 'Something went wrong' }));
});

const actorOf = (id: string) => {
  const a = getDB().accounts.find((x) => x.id === id)!;
  return { accountId: a.id, role: a.role, label: a.label, patientId: a.patientId };
};

// Scenario: Mobility Aide 1 checks off a goal-level walk on the worklist (staff-confirmed, with who logged it).
demo.post('/demo/scenarios/aid-check-off', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  if (isRestGoal(p.goal)) return res.status(400).json({ error: `Room ${p.room} has a rest goal this shift` });
  recordActivity(p, p.goal.level, 'staff', staffRef(actorOf('acct_aid1')));
  res.json({ ok: true, message: `Mobility Aide 1 checked off “${JHHLM[p.goal.level].nurse}” for Room ${p.room}` });
});

// Scenario: the patient tells family they feel dizzy. Delivered, call-button card, keyword-only flag.
demo.post('/demo/scenarios/dizzy-message', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  const thread = parseThread(`family:${p.id}`)!;
  const text = p.settings.language === 'es' ? 'Hoy me sentí un poco mareado después de caminar.' : 'I felt a little dizzy after my walk today.';
  sendMessage(actorOf(`acct_${p.id}`), thread, { kind: 'text', body: text })
    .then((r) => res.json(r.ok ? { ok: true, message: `Room ${p.room} told family “${text}” → delivered; safety flag shows only the keyword` } : { ok: false, message: r.error }))
    .catch(() => res.status(500).json({ error: 'Something went wrong' }));
});

// Scenario: another walker sends this patient a cheer (both must have walking buddies on).
demo.post('/demo/scenarios/buddy-cheer', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  const ok = (x: typeof p) => x.settings.buddies && !x.buddiesBlockedByStaff && !!x.pet;
  if (!ok(p)) return res.status(400).json({ error: `Room ${p.room} hasn’t turned on walking buddies (try 410, 411, 413, 416 or 417)` });
  const from = getDB().patients.find((x) => x.id !== p.id && ok(x));
  if (!from) return res.status(400).json({ error: 'No other walker has buddies turned on' });
  mutate('buddy', p.id, (db) => db.buddyCheers.push({ id: newId('cheer'), at: now(), fromPatientId: from.id, toPatientId: p.id, body: 'got-this' }));
  res.json({ ok: true, message: `${from.pet!.name} sent Room ${p.room} “You’ve got this!” (shown anonymously as the pet)` });
});

// Scenario: Nurse 1 exports unit data. Records the export-log entry exactly as a real export would.
demo.post('/demo/scenarios/nurse-export', (_req, res) => {
  const tables = buildTables(getDB().patients.map((x) => x.id));
  const filename = `mobipet_unit_${dateTag(now())}.xlsx`;
  mutate('export', null, (db) =>
    db.exportLog.push({ id: newId('exp'), at: now(), accountId: 'acct_nurse1', label: 'Nurse 1', role: 'nurse', scope: 'unit', scopeLabel: 'Unit', format: 'xlsx', rowCount: rowCount(tables), filename }),
  );
  res.json({ ok: true, message: `Nurse 1 exported ${filename} (${rowCount(tables)} rows) — see Export history in the Nurse view` });
});

// Scenario: the bedside tablet locks as if idle; entering the PIN plays the welcome back.
demo.post('/demo/scenarios/lock-tablet', (req, res) => {
  const p = scenarioPatient(req, res);
  if (!p) return;
  const sessions = getDB().sessions.filter((x) => x.kind === 'bedside' && x.accountId === `acct_${p.id}`);
  if (sessions.length === 0) return res.status(400).json({ error: `Room ${p.room} has no bedside session. Open its tablet first.` });
  mutateQuiet(() => sessions.forEach((x) => (x.locked = true)));
  bus.emit('change', { kind: 'session', patientId: p.id, at: now() });
  res.json({ ok: true, message: `Room ${p.room} tablet locked. Enter PIN ${demoPin(p.room)} to see the welcome back.` });
});

demo.post('/demo/reset', (_req, res) => {
  resetToSeed();
  clearAiLog();
  res.json({ ok: true, now: now() });
});
