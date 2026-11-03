// Conversations. One place decides who may see or post in a thread ("only the sender or recipient",
// CLAUDE.md permissions); routes, views and tests all go through it.
//
//   family:<patientId>    the patient and their family account
//   careteam:<patientId>  the patient and the care team, as a group (any nurse or aide)
//   staff:<a>:<b>         two staff members (1:1)
//   unit                  every staff member
import type { Message, Role, ThreadKind } from '../shared/types';
import { checkSymptoms } from '../shared/safety';
import { can, isStaff, type Actor } from './auth/permissions';
import { filterFamilyMessage } from './ai/pipeline';
import { findPatient, getDB, mutate, now } from './store';
import { newId } from './seed';

export interface ThreadRef {
  id: string;
  kind: ThreadKind;
  patientId: string | null;
  /** Staff 1:1 participants. */
  members: [string, string] | null;
}

export function parseThread(id: string): ThreadRef | null {
  const [kind, a, b, extra] = id.split(':');
  if (extra !== undefined) return null;
  if ((kind === 'family' || kind === 'careteam') && a && b === undefined && findPatient(a)) {
    return { id, kind, patientId: a, members: null };
  }
  if (kind === 'staff' && a && b && a < b) return { id, kind, patientId: null, members: [a, b] };
  if (kind === 'unit' && a === undefined) return { id, kind, patientId: null, members: null };
  return null;
}

export const staffThreadId = (a: string, b: string) => `staff:${[a, b].sort().join(':')}`;

/** May this actor read the thread? Reading a message requires exactly this. */
export function canAccessThread(actor: Actor | undefined, thread: ThreadRef): boolean {
  if (!actor) return false;
  switch (thread.kind) {
    case 'family':
      return (actor.role === 'family' || actor.role === 'patient') && actor.patientId === thread.patientId;
    case 'careteam':
      return isStaff(actor.role) || (actor.role === 'patient' && actor.patientId === thread.patientId);
    case 'staff':
      return isStaff(actor.role) && !!thread.members?.includes(actor.accountId);
    case 'unit':
      return isStaff(actor.role);
  }
}

export function canSeeMessage(actor: Actor | undefined, m: Message): boolean {
  const thread = parseThread(m.threadId);
  return !!thread && canAccessThread(actor, thread) && !m.blocked;
}

/** May this actor post here, and with which message kinds? */
function postRule(actor: Actor, thread: ThreadRef): Message['kind'][] | null {
  const pid = thread.patientId;
  if (thread.kind === 'family') {
    if (can(actor, 'message.toPatient', pid) && actor.role === 'family') return ['text', 'preset', 'sticker'];
    if (can(actor, 'message.patientReply', pid)) return ['text', 'preset'];
  }
  if (thread.kind === 'careteam') {
    if (isStaff(actor.role) && can(actor, 'message.toPatient', pid)) return ['text'];
    if (can(actor, 'message.patientReply', pid)) return ['text', 'preset'];
  }
  if (thread.kind === 'staff' && canAccessThread(actor, thread) && can(actor, 'staffMessages.use')) return ['text'];
  if (thread.kind === 'unit' && can(actor, 'unitThread.use')) return ['text'];
  return null;
}

export type SendResult =
  | { ok: true; message: Message; action: 'call-button' | null }
  | { ok: false; status: number; error: string; reason?: string | null };

export async function sendMessage(
  actor: Actor,
  thread: ThreadRef,
  input: { kind?: unknown; body?: unknown; fromName?: unknown; patientTag?: unknown },
): Promise<SendResult> {
  const kinds = postRule(actor, thread);
  if (!kinds) return { ok: false, status: 403, error: 'forbidden' };
  const kind = (input.kind ?? 'text') as Message['kind'];
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!kinds.includes(kind) || !body || body.length > 500) {
    return { ok: false, status: 400, error: 'Messages need to be 1–500 characters.' };
  }
  const tag = typeof input.patientTag === 'string' && findPatient(input.patientTag) ? input.patientTag : null;
  if (tag && thread.kind !== 'staff' && thread.kind !== 'unit') return { ok: false, status: 400, error: 'Only staff messages can be tagged' };

  // Anything written to a patient passes the family content filter; presets and stickers are pre-approved.
  const toPatient = thread.patientId !== null && actor.role !== 'patient';
  const decision = toPatient && kind === 'text' ? await filterFamilyMessage(body) : { ok: true, reason: null };

  // Patient messages get the rule-based symptom scan. The message is still delivered; the care team gets a
  // safety flag with the keyword only, never the private message text.
  const symptom = actor.role === 'patient' && kind === 'text' ? checkSymptoms(body) : null;

  const message = mutate('message', thread.patientId, (db) => {
    const m: Message = {
      id: newId('msg'),
      threadId: thread.id,
      patientId: thread.patientId,
      at: now(),
      fromAccountId: actor.accountId,
      fromRole: actor.role,
      from: displayName(actor, input.fromName),
      kind,
      body,
      blocked: !decision.ok,
      deliveredAt: null,
      readBy: [actor.accountId],
      patientTag: tag,
      symptom: symptom?.triggered ? symptom.matched : null,
    };
    db.messages.push(m);
    if (symptom?.triggered && thread.patientId) {
      db.flags.push({
        id: newId('flag'),
        patientId: thread.patientId,
        at: m.at,
        text: `Mentioned “${symptom.matched}” in a message to ${thread.kind === 'family' ? 'family' : 'the care team'}`,
        source: 'message',
        matched: symptom.matched,
        acknowledgedAt: null,
      });
    }
    return m;
  });
  if (!decision.ok) return { ok: false, status: 422, error: 'blocked', reason: decision.reason };
  return { ok: true, message, action: symptom?.triggered ? 'call-button' : null };
}

function displayName(actor: Actor, fromName: unknown): string {
  if (actor.role === 'family') {
    const name = typeof fromName === 'string' ? fromName.trim().slice(0, 40) : '';
    return name || 'Family';
  }
  if (actor.role === 'patient') return findPatient(actor.patientId ?? '')?.firstName ?? 'Patient';
  return actor.label;
}

/** What a viewer may see of a message: patient tags are dropped unless the viewer may see that patient's data. */
export function messageFor(actor: Actor, m: Message) {
  const { readBy, ...rest } = m;
  return { ...rest, mine: m.fromAccountId === actor.accountId, read: readBy.includes(actor.accountId), fromRole: m.fromRole as Role };
}

export interface ThreadSummary {
  id: string;
  kind: ThreadKind;
  patientId: string | null;
  title: string;
  lastAt: number | null;
  lastPreview: string | null;
  unread: number;
}

/** Every thread this actor is part of, most recent first. Staff see every patient's care team thread. */
export function threadsFor(actor: Actor): ThreadSummary[] {
  const db = getDB();
  const ids: string[] = [];
  if (actor.role === 'patient' && actor.patientId) ids.push(`careteam:${actor.patientId}`, `family:${actor.patientId}`);
  if (actor.role === 'family' && actor.patientId) ids.push(`family:${actor.patientId}`);
  if (isStaff(actor.role)) {
    ids.push('unit');
    for (const a of db.accounts) if (isStaff(a.role) && a.id !== actor.accountId) ids.push(staffThreadId(actor.accountId, a.id));
    for (const p of db.patients) ids.push(`careteam:${p.id}`);
  }
  return ids
    .map((id) => parseThread(id))
    .filter((t): t is ThreadRef => !!t && canAccessThread(actor, t))
    .map((t) => {
      const msgs = db.messages.filter((m) => m.threadId === t.id && !m.blocked);
      const last = msgs.reduce<Message | null>((a, m) => (!a || m.at > a.at ? m : a), null);
      return {
        id: t.id,
        kind: t.kind,
        patientId: t.patientId,
        title: threadTitle(actor, t),
        lastAt: last?.at ?? null,
        lastPreview: last ? `${last.from}: ${last.kind === 'sticker' ? 'sent a sticker' : last.body.slice(0, 80)}` : null,
        unread: msgs.filter((m) => !m.readBy.includes(actor.accountId)).length,
      };
    })
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));
}

function threadTitle(actor: Actor, t: ThreadRef): string {
  const db = getDB();
  const p = t.patientId ? findPatient(t.patientId) : undefined;
  switch (t.kind) {
    case 'family':
      return actor.role === 'patient' ? 'Family' : (p?.firstName ?? 'Patient');
    case 'careteam':
      return actor.role === 'patient' ? 'Care team' : `Room ${p?.room} · ${p?.firstName} ${p?.lastInitial}.`;
    case 'staff': {
      const other = t.members?.find((id) => id !== actor.accountId);
      return db.accounts.find((a) => a.id === other)?.label ?? 'Staff';
    }
    case 'unit':
      return 'Unit thread';
  }
}

export function markRead(actor: Actor, thread: ThreadRef) {
  const unread = getDB().messages.filter((m) => m.threadId === thread.id && !m.readBy.includes(actor.accountId));
  if (unread.length === 0) return;
  mutate('message', thread.patientId, () => {
    unread.forEach((m) => m.readBy.push(actor.accountId));
  });
}
