// Derived, read-only views of patient state, shared by the nurse board and patient view.
import type { ActivityLog, Message, Patient, PatientStatus, PatientSummary, SafetyFlag } from './types';
import { isRestGoal } from './jhhlm';
import { goalProgress, highestLevel, petMood } from './progression';
import { HOUR, shiftAt, shiftElapsed } from './shifts';

export const INACTIVE_AFTER = 3 * HOUR;

function lastAt<T extends { at: number }>(items: T[]): number | null {
  return items.reduce<number | null>((m, x) => (m === null || x.at > m ? x.at : m), null);
}

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function summarize(
  p: Patient,
  allLogs: ActivityLog[],
  allFlags: SafetyFlag[],
  allMessages: Message[],
  now: number,
): PatientSummary {
  const shift = shiftAt(now);
  const logs = allLogs.filter((l) => l.patientId === p.id && l.at <= now);
  const counted = logs.filter((l) => l.status !== 'rejected');
  const progress = goalProgress(counted, p.goal, shift);
  const lastActivityAt = lastAt(counted);
  const openFlags = allFlags.filter((f) => f.patientId === p.id && f.acknowledgedAt === null);
  // Encouragement sent to the patient (not the patient's own replies) keeps the pet cheerful.
  const lastCheer = lastAt(allMessages.filter((m) => m.patientId === p.id && m.fromRole !== 'patient' && !m.blocked && m.at <= now));
  const rest = isRestGoal(p.goal);

  let status: PatientStatus;
  let statusReason: string;
  if (openFlags.length > 0) {
    status = 'needs-attention';
    const f = openFlags[openFlags.length - 1];
    statusReason = `Safety flag at ${fmtTime(f.at)}: ${flagText(f)}`;
  } else if (!rest && progress >= p.goal.reps) {
    status = 'goal-met';
    statusReason = `Goal met (${progress}/${p.goal.reps})`;
  } else if (rest || shift.name === 'night') {
    status = 'on-track';
    statusReason = rest ? 'Rest goal this shift' : 'Night shift — rest';
  } else {
    const expected = Math.floor(p.goal.reps * shiftElapsed(shift, now));
    const idleFor = lastActivityAt === null ? Infinity : now - lastActivityAt;
    if (progress < expected) {
      status = 'behind';
      statusReason = `${progress}/${p.goal.reps} done, ${expected} expected by now`;
    } else if (idleFor > INACTIVE_AFTER && now - shift.start > INACTIVE_AFTER) {
      status = 'behind';
      statusReason = lastActivityAt === null ? 'No activity logged yet' : `No activity since ${fmtTime(lastActivityAt)}`;
    } else {
      status = 'on-track';
      statusReason = `${progress}/${p.goal.reps} done`;
    }
  }

  return {
    id: p.id,
    room: p.room,
    displayName: `${p.firstName} ${p.lastInitial}.`,
    goal: p.goal,
    clearance: p.clearance,
    language: p.settings.language,
    progress,
    highestLevelThisShift: highestLevel(counted, shift),
    lastActivityAt,
    unconfirmedCount: logs.filter((l) => l.status === 'reported').length,
    openFlagCount: openFlags.length,
    status,
    statusReason,
    mood: petMood(now, lastActivityAt, lastCheer, rest),
    pet: p.pet,
    journeySteps: p.journeySteps,
    openQuestion: p.questionForNurse?.text ?? null,
  };
}

const STATUS_ORDER: Record<PatientStatus, number> = { 'needs-attention': 0, behind: 1, 'on-track': 2, 'goal-met': 3 };

export function sortForBoard(list: PatientSummary[]): PatientSummary[] {
  return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.room.localeCompare(b.room));
}

/** Where a safety flag came from, for the Care Team. */
export function flagSourceLabel(source: SafetyFlag['source']): string {
  return source === 'chat' ? 'Talk to Pip' : source === 'message' ? 'Patient message' : 'Help button';
}

/** Chat flags quote what the patient typed; message flags carry only the matched keyword, never the private text. */
export function flagText(f: Pick<SafetyFlag, 'source' | 'text'>): string {
  return f.source === 'message' ? f.text : `“${f.text}”`;
}
