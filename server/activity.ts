// One place that records an activity: the log and journey progress (only ever added).
import type { ActivityLog, Level, LogSource, Patient, StaffRef } from '../shared/types';
import { applyActivity, goalProgress, type ProgressResult } from '../shared/progression';
import { shiftAt } from '../shared/shifts';
import { mutate, now } from './store';
import { newId } from './seed';

export interface RecordResult {
  log: ActivityLog;
  progression: ProgressResult;
  goalJustMet: boolean;
}

/** A staff check-off (`by`) is confirmed at once; a patient report waits for staff to confirm it. */
export function recordActivity(p: Patient, level: Level, source: LogSource, by: StaffRef | null = null): RecordResult {
  return mutate('log', p.id, (db) => {
    const t = now();
    const shift = shiftAt(t);
    const mine = () => db.logs.filter((l) => l.patientId === p.id);
    const metBefore = goalProgress(mine(), p.goal, shift) >= p.goal.reps;
    const log: ActivityLog = by
      ? { id: newId('log'), patientId: p.id, level, at: t, source, status: 'confirmed', reviewedAt: t, loggedBy: by, reviewedBy: by }
      : { id: newId('log'), patientId: p.id, level, at: t, source, status: 'reported', reviewedAt: null };
    db.logs.push(log);
    const progression = applyActivity(p.journeySteps, level);
    p.journeySteps = progression.after;
    const goalJustMet = !metBefore && goalProgress(mine(), p.goal, shift) >= p.goal.reps;
    return { log, progression, goalJustMet };
  });
}
