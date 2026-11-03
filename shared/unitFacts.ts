// Verifiable facts about the unit, each with the data that supports it.
// The nurse summary is built only from these, so every claim can be checked.
import type { PatientSummary, SafetyFlag, ShiftInfo } from './types';
import { fmtTime, INACTIVE_AFTER, flagSourceLabel, flagText } from './derive';
import { isRestGoal, JHHLM } from './jhhlm';

export interface Evidence {
  patientId: string;
  room: string;
  name: string;
  detail: string;
}

export interface UnitFact {
  id: string;
  kind: 'flag' | 'behind' | 'idle' | 'question' | 'unconfirmed' | 'met';
  severity: 'high' | 'medium' | 'info';
  text: string;
  evidence: Evidence[];
}

const SHIFT_WORD: Record<ShiftInfo['name'], string> = { day: 'day-shift', evening: 'evening-shift', night: 'night-shift' };

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function unitFacts(summaries: PatientSummary[], flags: SafetyFlag[], now: number, shift: ShiftInfo): UnitFact[] {
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const ev = (s: PatientSummary, detail: string): Evidence => ({ patientId: s.id, room: s.room, name: s.displayName, detail });
  const facts: UnitFact[] = [];

  // 1. Unacknowledged safety flags, newest first.
  for (const f of flags.filter((x) => x.acknowledgedAt === null).sort((a, b) => b.at - a.at)) {
    const s = byId.get(f.patientId);
    if (!s) continue;
    const what = f.source === 'help-button' ? 'pressed "I need help"' : f.source === 'message' ? `mentioned "${f.matched}" in a message` : `reported "${f.text}"`;
    facts.push({
      id: `flag:${f.id}`,
      kind: 'flag',
      severity: 'high',
      text: `Room ${s.room} ${what} at ${fmtTime(f.at)} — not yet acknowledged.`,
      evidence: [ev(s, `${fmtTime(f.at)} · ${flagSourceLabel(f.source)} · ${flagText(f)}`)],
    });
  }

  // 2. Behind on this shift's goal (progress below the expected pace).
  const active = summaries.filter((s) => !isRestGoal(s.goal) && s.status !== 'needs-attention');
  const behind = active.filter((s) => s.status === 'behind');
  if (behind.length > 0) {
    facts.push({
      id: 'behind',
      kind: 'behind',
      severity: 'medium',
      text: `${behind.length} ${plural(behind.length, 'patient is', 'patients are')} behind on ${SHIFT_WORD[shift.name]} goals (Rooms ${behind.map((s) => s.room).join(', ')}).`,
      evidence: behind.map((s) => ev(s, `${s.progress}/${s.goal.reps} × L${s.goal.level} ${JHHLM[s.goal.level].nurse} · ${s.statusReason}`)),
    });
  }

  // 3. Long idle stretches (3+ hours without activity), longest first, up to two.
  if (shift.name !== 'night') {
    const idle = active
      .filter((s) => s.status !== 'goal-met' && (s.lastActivityAt === null || now - s.lastActivityAt > INACTIVE_AFTER))
      .sort((a, b) => (a.lastActivityAt ?? 0) - (b.lastActivityAt ?? 0))
      .slice(0, 2);
    for (const s of idle) {
      facts.push({
        id: `idle:${s.id}`,
        kind: 'idle',
        severity: 'medium',
        text: s.lastActivityAt === null ? `Room ${s.room} has no activity logged yet.` : `Room ${s.room} has not moved since ${fmtTime(s.lastActivityAt)}.`,
        evidence: [ev(s, s.lastActivityAt === null ? 'No logs on record' : `Last log ${fmtTime(s.lastActivityAt)}`)],
      });
    }
  }

  // 4. Questions patients asked Pip to pass on (medical questions Pip redirected).
  const asking = summaries.filter((s) => s.openQuestion);
  if (asking.length > 0) {
    facts.push({
      id: 'questions',
      kind: 'question',
      severity: 'medium',
      text: `${asking.length} ${plural(asking.length, 'patient has', 'patients have')} a question for their nurse (Rooms ${asking.map((s) => s.room).join(', ')}).`,
      evidence: asking.map((s) => ev(s, `“${s.openQuestion}”`)),
    });
  }

  // 5. Patient-reported logs awaiting confirmation.
  const pending = summaries.filter((s) => s.unconfirmedCount > 0);
  const totalPending = pending.reduce((n, s) => n + s.unconfirmedCount, 0);
  if (totalPending > 0) {
    facts.push({
      id: 'unconfirmed',
      kind: 'unconfirmed',
      severity: 'info',
      text: `${totalPending} patient-reported ${plural(totalPending, 'log is', 'logs are')} waiting for confirmation.`,
      evidence: pending.map((s) => ev(s, `${s.unconfirmedCount} unconfirmed`)),
    });
  }

  // 6. Goals met this shift.
  const met = summaries.filter((s) => s.status === 'goal-met');
  if (met.length > 0) {
    facts.push({
      id: 'met',
      kind: 'met',
      severity: 'info',
      text: `${met.length} ${plural(met.length, 'patient has', 'patients have')} met this shift's goal (Rooms ${met.map((s) => s.room).join(', ')}).`,
      evidence: met.map((s) => ev(s, `${s.progress}/${s.goal.reps} × L${s.goal.level}`)),
    });
  }

  return facts;
}
