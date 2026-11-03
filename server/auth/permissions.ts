// Every permission rule in one place (CLAUDE.md, "Roles and permissions"). Routes ask `can()` through
// middleware; the UI only mirrors these rules. "own" means the actor's own patient (patient: self,
// family: the patient they follow). Row-level rules (own notes, own threads) are checked in the routes.
import type { Role, StaffRef } from '../../shared/types';

export type Scope = 'any' | 'own';

export interface Actor {
  accountId: string;
  role: Role;
  label: string;
  /** Bound patient for patient and family accounts. */
  patientId: string | null;
}

export const RULES = {
  /** Care Team tab, both Aide and Nurse views. */
  'careTeam.view': { nurse: 'any', mobility_aid: 'any' },
  /** All unit patients' mobility data: board, unit facts, flags. */
  'unit.read': { nurse: 'any', mobility_aid: 'any' },
  /** One patient's full tablet record. */
  'patient.read': { nurse: 'any', mobility_aid: 'any', patient: 'own' },
  /** The family view of a patient (no clinical details). */
  'family.read': { family: 'own' },
  /** Set or change the JH-HLM goal and clearance level. Nurses only. */
  'goal.set': { nurse: 'any' },
  /** Patient reports their own activity. */
  'activity.selfReport': { patient: 'own' },
  /** Staff log (check off) or confirm/reject activity. */
  'activity.staffLog': { nurse: 'any', mobility_aid: 'any' },
  'activity.confirm': { nurse: 'any', mobility_aid: 'any' },
  'export.create': { nurse: 'any', mobility_aid: 'any' },
  'export.log.read': { nurse: 'any', mobility_aid: 'any' },
  /** Private notes; the route also restricts every note to its author. */
  'notes.use': { nurse: 'any', mobility_aid: 'any' },
  /** Staff 1:1 threads; the route also restricts to the two participants. */
  'staffMessages.use': { nurse: 'any', mobility_aid: 'any' },
  'unitThread.use': { nurse: 'any', mobility_aid: 'any' },
  /** Free-text message to a patient. */
  'message.toPatient': { nurse: 'any', mobility_aid: 'any', family: 'own' },
  /** Patient replies to family and care team. */
  'message.patientReply': { patient: 'own' },
  /** Walking buddies: preset cheers between opted-in patients. */
  'buddies.use': { patient: 'own' },
  'buddies.staffControl': { nurse: 'any', mobility_aid: 'any' },
  'bedside.start': { nurse: 'any', mobility_aid: 'any' },
  'bedside.end': { nurse: 'any', mobility_aid: 'any' },
  /** Mute AI coaching, pause nudges, short note shown on the tablet. */
  'patient.controls': { nurse: 'any', mobility_aid: 'any' },
  /** Tablet settings and pet: the patient, or staff helping at the bedside. */
  'patient.settings': { nurse: 'any', mobility_aid: 'any', patient: 'own' },
  'patient.pet': { nurse: 'any', mobility_aid: 'any', patient: 'own' },
  /** Tablet-only actions: I need help, chat with the pet, nudges, message delivery. */
  'patient.tablet': { patient: 'own' },
  /** Acknowledge safety flags, clear redirected questions, read the AI log. */
  'flags.manage': { nurse: 'any', mobility_aid: 'any' },
  'ailog.read': { nurse: 'any', mobility_aid: 'any' },
} as const satisfies Record<string, Partial<Record<Role, Scope>>>;

export type Action = keyof typeof RULES;

export const isStaff = (role: Role) => role === 'nurse' || role === 'mobility_aid';

/** How a staff actor is recorded on logs, goals and exports. */
export function staffRef(actor: Actor): StaffRef {
  if (!isStaff(actor.role)) throw new Error('Not a staff member');
  return { accountId: actor.accountId, role: actor.role as StaffRef['role'], label: actor.label };
}

/** Can this actor do `action` (for `patientId`, when the rule is scoped to "own")? */
export function can(actor: Actor | null | undefined, action: Action, patientId?: string | null): boolean {
  if (!actor) return false;
  const scope = (RULES[action] as Partial<Record<Role, Scope>>)[actor.role];
  if (scope === 'any') return true;
  if (scope === 'own') return !!patientId && actor.patientId === patientId;
  return false;
}
