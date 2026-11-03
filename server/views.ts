// Read models assembled from the store for API responses.
import type { Patient } from '../shared/types';
import { sortForBoard, summarize } from '../shared/derive';
import { shiftAt, HOUR } from '../shared/shifts';
import { ACCESSORIES, keepsakesFor, regionAt, stageFor } from '../shared/progression';
import { unitFacts } from '../shared/unitFacts';
import { benchmarks } from '../shared/benchmarks';
import { getDB, now } from './store';

export function boardView() {
  const db = getDB();
  const t = now();
  const shift = shiftAt(t);
  const shiftLogs = (id: string) =>
    db.logs.filter((l) => l.patientId === id && l.at >= shift.start && l.at <= t && l.status !== 'rejected').sort((a, b) => a.at - b.at);
  return {
    now: t,
    shift,
    patients: sortForBoard(db.patients.map((p) => summarize(p, db.logs, db.flags, db.messages, t))).map((s) => ({ ...s, shiftLogs: shiftLogs(s.id) })),
  };
}

/** Facts behind the nurse unit summary, with supporting data for each claim. */
export function unitView() {
  const board = boardView();
  return { now: board.now, shift: board.shift, facts: unitFacts(board.patients, getDB().flags, board.now, board.shift) };
}

/** Nurse view: unit metrics and the per-patient benchmark table. */
export function benchmarksView() {
  const db = getDB();
  const board = boardView();
  return { now: board.now, ...benchmarks({ patients: db.patients, logs: db.logs, flags: db.flags, now: board.now, summaries: board.patients }) };
}

export function progressionView(p: Patient) {
  return {
    steps: p.journeySteps,
    region: regionAt(p.journeySteps),
    stage: stageFor(p.journeySteps),
    accessories: ACCESSORIES,
    keepsakes: keepsakesFor(p.journeySteps),
  };
}

/** Full patient record for the patient tablet and nurse drawer. */
export function patientView(p: Patient) {
  const db = getDB();
  const t = now();
  const since = t - 72 * HOUR;
  return {
    now: t,
    shift: shiftAt(t),
    patient: p,
    summary: summarize(p, db.logs, db.flags, db.messages, t),
    progression: progressionView(p),
    logs: db.logs.filter((l) => l.patientId === p.id && l.at >= since && l.at <= t).sort((a, b) => b.at - a.at),
    flags: db.flags.filter((f) => f.patientId === p.id).sort((a, b) => b.at - a.at),
    messages: db.messages
      .filter((m) => m.patientId === p.id && m.fromRole !== 'patient' && !m.blocked && (m.threadId.startsWith('family:') || m.threadId.startsWith('careteam:')))
      .sort((a, b) => b.at - a.at),
    chat: db.chats.filter((c) => c.patientId === p.id).sort((a, b) => a.at - b.at),
  };
}

/**
 * Family sees the companion and journey only — no goal levels, logs, flags, or chat.
 * `walkTogether` says only whether the visit-walk button should appear (walking is in the current plan).
 */
export function familyView(p: Patient) {
  const db = getDB();
  const t = now();
  const summary = summarize(p, db.logs, db.flags, db.messages, t);
  return {
    now: t,
    patientId: p.id,
    firstName: p.firstName,
    pet: p.pet,
    mood: summary.mood,
    progression: progressionView(p),
    language: p.settings.language,
    walkTogether: p.goal.level >= 6 ? { needsStaff: p.clearance === 'needs-assist' } : null,
    // Only the family thread: never the care team conversation.
    messages: db.messages
      .filter((m) => m.threadId === `family:${p.id}` && !m.blocked)
      .sort((a, b) => b.at - a.at)
      .slice(0, 20)
      .map(({ id, at, from, fromRole, kind, body, deliveredAt }) => ({ id, at, from, fromRole, kind, body, deliveredAt })),
  };
}
