// Mobility Aid view: a hands-on worklist. Patients who need a walk now come first, then those behind,
// then those on track or done. Big check-off buttons record staff-confirmed activity in one tap.
import { useState } from 'react';
import { Check, CheckCheck, ChevronRight, Footprints, ShieldAlert, UserRound } from 'lucide-react';
import type { ActivityLog, Level } from '@shared/types';
import type { BoardPatient, BoardView } from '@shared/api';
import { allowedActivityLevels, isRestGoal, JHHLM } from '@shared/jhhlm';
import { HOUR } from '@shared/shifts';
import { api } from '../../api/client';
import { clock } from './time';

type Bucket = 'walk-now' | 'behind' | 'on-track' | 'met' | 'rest';

const BUCKETS: { id: Bucket; title: string; hint: string }[] = [
  { id: 'walk-now', title: 'Needs a walk now', hint: 'No activity this shift, or none in the last 2 hours' },
  { id: 'behind', title: 'Behind on goal', hint: 'Moving, but fewer times than expected by now' },
  { id: 'on-track', title: 'On track', hint: '' },
  { id: 'met', title: 'Goal met', hint: '' },
  { id: 'rest', title: 'Resting this shift', hint: 'Rest goal or night shift: no walks planned' },
];

/** Idle this long (or nothing yet this shift) puts a patient at the top of the worklist. */
const WALK_NOW_AFTER = 2 * HOUR;

export function bucketFor(p: BoardPatient, board: BoardView): Bucket {
  if (isRestGoal(p.goal) || board.shift.name === 'night') return 'rest';
  if (p.progress >= p.goal.reps) return 'met';
  const idle = p.lastActivityAt === null || board.now - p.lastActivityAt > WALK_NOW_AFTER;
  if (p.shiftLogs.length === 0 || idle) return 'walk-now';
  return p.status === 'behind' ? 'behind' : 'on-track';
}

/** Plain words for the card, e.g. "Walk 25+ feet, 2 times this shift". */
function goalWords(p: BoardPatient): string {
  if (isRestGoal(p.goal)) return 'Rest goal this shift';
  const phrase = JHHLM[p.goal.level].goal.en;
  return `${phrase[0].toUpperCase()}${phrase.slice(1)}, ${p.goal.reps === 1 ? 'once' : `${p.goal.reps} times`} this shift`;
}

function logLine(l: ActivityLog): string {
  const what = JHHLM[l.level].done?.en ?? JHHLM[l.level].nurse;
  if (l.status === 'reported') return `${clock(l.at)} · ${what} · self-reported`;
  const by = l.loggedBy?.label ?? l.reviewedBy?.label;
  return `${clock(l.at)} · ${what} · ${l.loggedBy ? `logged by ${by}` : by ? `confirmed by ${by}` : 'confirmed'}`;
}

interface Props {
  board: BoardView;
  patients: BoardPatient[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}

export function AidWorklist({ board, patients, onOpen, onChanged }: Props) {
  const grouped = BUCKETS.map((b) => ({ ...b, items: patients.filter((p) => bucketFor(p, board) === b.id) })).filter((b) => b.items.length > 0);
  return (
    <section aria-labelledby="worklist-title" className="rounded-2xl border border-line bg-paper p-4">
      <h2 id="worklist-title" className="flex items-center gap-2 font-display text-xl font-extrabold">
        <Footprints aria-hidden size={22} /> My worklist
      </h2>
      {patients.length === 0 && <p className="mt-2 text-muted">No patients match the filter.</p>}
      {grouped.map((group) => (
        <div key={group.id} className="mt-4">
          <h3 className="font-display text-lg font-extrabold">
            {group.title} <span className="font-body text-base font-normal text-muted">({group.items.length})</span>
          </h3>
          {group.hint && <p className="text-sm text-muted">{group.hint}</p>}
          <ul className="mt-2 grid gap-3 xl:grid-cols-2">
            {group.items.map((p) => (
              <li key={p.id}>
                <WorkCard patient={p} onOpen={onOpen} onChanged={onChanged} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function WorkCard({ patient: p, onOpen, onChanged }: { patient: BoardPatient; onOpen: (id: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const levels = allowedActivityLevels(p.goal);
  const pending = p.shiftLogs.filter((l) => l.status === 'reported');

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      setNote(done);
      onChanged();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const checkOff = (level: Level) =>
    run(() => api.post(`/patients/${p.id}/logs/staff`, { level }), `Logged: ${JHHLM[level].done?.en ?? JHHLM[level].nurse}.`);
  const confirm = (ids: string[]) =>
    run(() => Promise.all(ids.map((id) => api.post(`/logs/${id}/confirm`))), ids.length === 1 ? 'Self-report confirmed.' : 'Self-reports confirmed.');

  return (
    <article aria-labelledby={`wc-${p.id}`} className={`rounded-xl border-2 p-3 ${p.openFlagCount ? 'border-alert' : 'border-line'} bg-cream`}>
      <div className="flex items-start justify-between gap-2">
        <h4 id={`wc-${p.id}`} className="font-display text-xl font-extrabold">
          <span className="mr-2 rounded-lg bg-ink px-2 text-cream">{p.room}</span>
          {p.displayName}
        </h4>
        <button
          onClick={() => onOpen(p.id)}
          className="inline-flex min-h-tap shrink-0 items-center gap-1 rounded-full border-2 border-line bg-paper px-3 font-bold hover:bg-sky/20"
          aria-label={`Open details for Room ${p.room}, ${p.displayName}`}
        >
          Details <ChevronRight aria-hidden size={16} />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {p.openFlagCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-alert px-2 text-sm font-bold text-cream">
            <ShieldAlert aria-hidden size={14} /> Safety flag: check before walking
          </span>
        )}
        {p.clearance === 'needs-assist' && (
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink px-2 text-sm font-bold">
            <UserRound aria-hidden size={14} /> Needs assist to stand
          </span>
        )}
      </div>
      <p className="mt-2 text-lg">
        <span className="font-bold">Goal:</span> {goalWords(p)}
      </p>

      <div className="mt-2">
        <p className="font-bold">Done this shift</p>
        {p.shiftLogs.length === 0 ? (
          <p className="text-muted">Nothing yet.</p>
        ) : (
          <ul className="text-base">
            {p.shiftLogs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-0.5">
                <span>{logLine(l)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pending.map((l) => (
            <button key={l.id} disabled={busy} onClick={() => void confirm([l.id])} className="inline-flex min-h-[3.25rem] items-center gap-2 rounded-full border-4 border-sky-deep bg-paper px-4 font-bold text-sky-deep disabled:opacity-50">
              <CheckCheck aria-hidden size={20} /> Confirm {clock(l.at)} {JHHLM[l.level].done?.en ?? JHHLM[l.level].nurse}
            </button>
          ))}
        </div>
      )}

      {levels.length > 0 && (
        <div className="mt-3">
          <p className="font-bold" id={`co-${p.id}`}>Check off</p>
          <div role="group" aria-labelledby={`co-${p.id}`} className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {levels.map((l) => (
              <button
                key={l}
                disabled={busy}
                onClick={() => void checkOff(l)}
                className={`flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl px-3 text-center font-bold disabled:opacity-50 ${
                  l === p.goal.level ? 'bg-sage-deep text-cream' : 'border-4 border-sage-deep bg-paper text-sage-deep'
                }`}
              >
                <Check aria-hidden size={20} className="shrink-0" />
                <span>
                  {JHHLM[l].done?.en}
                  <span className="sr-only">, Room {p.room}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p aria-live="polite" className="mt-1 min-h-[1.5rem] text-sm font-bold text-sage-deep">{note}</p>
    </article>
  );
}
