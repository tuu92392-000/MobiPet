// Care Team patient detail: set the goal (nurses only), review logs, read the AI conversation, and adjust coaching.
import { useEffect, useState, type ReactNode } from 'react';
import { BellRing, Check, Download, HelpCircle, Lock, Mail, MessageCircleWarning, Minus, NotebookPen, Plus, ShieldAlert, Sparkles, Tablet, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Clearance, Level } from '@shared/types';
import type { MessageView, PatientView } from '@shared/api';
import { goalText, isRestGoal, JHHLM, LEVELS } from '@shared/jhhlm';
import { flagSourceLabel, flagText } from '@shared/derive';
import { HOUR } from '@shared/shifts';
import { api } from '../../api/client';
import { useLiveRefresh } from '../../lib/live';
import { useSession } from '../../auth/session';
import { NotesList } from './MyNotes';
import { Modal } from '../../components/Modal';
import { StatusBadge } from './StatusBadge';
import { clock } from './time';

interface Props {
  patientId: string | null;
  onClose: () => void;
  /** Called after any change so the board refreshes. */
  onChanged: () => void;
  /** Open the care team conversation with this patient. */
  onMessage: (patientId: string) => void;
  onExport: (patientId: string, room: string) => void;
}

export function PatientDrawer({ patientId, onClose, onChanged, onMessage, onExport }: Props) {
  const [view, setView] = useState<PatientView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setView(null);
    if (!patientId) return;
    api.get<PatientView>(`/patients/${patientId}`).then(setView).catch((e: Error) => setError(e.message));
  }, [patientId]);

  // Keep the open drawer current when the patient logs activity or chats.
  useLiveRefresh(patientId, () => {
    api.get<PatientView>(`/patients/${patientId}`).then(setView).catch(() => undefined);
  });

  async function act(run: () => Promise<unknown>) {
    try {
      await run();
      setView(await api.get<PatientView>(`/patients/${patientId}`));
      setError(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal open={patientId !== null} onClose={onClose} labelledBy="drawer-title" drawer>
      <div className="flex h-full flex-col text-sm">
        <div className="flex items-start justify-between gap-3 border-b border-line bg-cream px-5 py-3">
          <div>
            <h2 id="drawer-title" className="font-display text-xl font-extrabold">
              {view ? `Room ${view.patient.room} · ${view.summary.displayName}` : 'Loading…'}
            </h2>
            {view && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={view.summary.status} />
                <span className="text-muted">{view.summary.statusReason}</span>
              </div>
            )}
          </div>
          {view && (
            <button
              onClick={() => onMessage(view.patient.id)}
              className="inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-full border-2 border-sky-deep px-3 font-bold text-sky-deep hover:bg-sky/20"
            >
              <Mail aria-hidden size={16} /> Message {view.patient.firstName}
            </button>
          )}
          {view && (
            <button
              onClick={() => onExport(view.patient.id, view.patient.room)}
              className="inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-full border-2 border-sage-deep px-3 font-bold text-sage-deep hover:bg-sage/30"
            >
              <Download aria-hidden size={16} /> Export
            </button>
          )}
          <button onClick={onClose} aria-label="Close patient details" className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-line/60">
            <X aria-hidden />
          </button>
        </div>
        {error && <p role="alert" className="mx-5 mt-3 rounded-lg bg-coral/20 p-2 text-alert">{error}</p>}
        {view && (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <BedsideSection view={view} />
            <TaggedMessages view={view} />
            <section aria-labelledby="drawer-notes-title" className="rounded-xl border border-line p-3">
              <h3 id="drawer-notes-title" className="flex items-center gap-1.5 font-display text-base font-extrabold">
                <NotebookPen aria-hidden size={18} /> My notes about {view.patient.firstName}
              </h3>
              <div className="mt-2">
                <NotesList key={view.patient.id} patients={[]} patientId={view.patient.id} />
              </div>
            </section>
            <FlagsSection view={view} act={act} />
            {view.patient.questionForNurse && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-sky-deep bg-sky/30 p-3">
                <p>
                  <span className="flex items-center gap-1.5 font-bold text-sky-deep">
                    <HelpCircle aria-hidden size={16} /> Question for you · {clock(view.patient.questionForNurse.at)}
                  </span>
                  “{view.patient.questionForNurse.text}”
                </p>
                <button onClick={() => act(() => api.post(`/patients/${view.patient.id}/question/answered`))} className="min-h-tap rounded-full bg-sky-deep px-4 font-bold text-cream">
                  Mark answered
                </button>
              </div>
            )}
            <GoalEditor key={`${view.patient.id}-${view.patient.goal.setAt}`} view={view} act={act} />
            <LogsSection view={view} act={act} />
            <ControlsSection key={view.patient.nurseNote?.at ?? 'none'} view={view} act={act} />
            <ChatSection view={view} />
          </div>
        )}
      </div>
    </Modal>
  );
}

type Act = (run: () => Promise<unknown>) => Promise<void>;

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = `sec-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={id} className="font-display text-base font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FlagsSection({ view, act }: { view: PatientView; act: Act }) {
  const open = view.flags.filter((f) => f.acknowledgedAt === null);
  if (open.length === 0) return null;
  return (
    <div className="rounded-xl border-2 border-alert bg-coral/10 p-3">
      <h3 className="flex items-center gap-2 font-bold text-alert">
        <ShieldAlert aria-hidden size={18} /> {open.length} open safety {open.length === 1 ? 'flag' : 'flags'}
      </h3>
      <ul className="mt-2 space-y-2">
        {open.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {clock(f.at)} · {flagSourceLabel(f.source)} · {flagText(f)}
            </span>
            <button onClick={() => act(() => api.post(`/flags/${f.id}/ack`))} className="min-h-tap rounded-full bg-alert px-4 font-bold text-cream">
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoalEditor({ view, act }: { view: PatientView; act: Act }) {
  const { patient } = view;
  const [level, setLevel] = useState<Level>(patient.goal.level);
  const [reps, setReps] = useState(patient.goal.reps);
  const [clearance, setClearance] = useState<Clearance>(patient.clearance);
  const changed = level !== patient.goal.level || reps !== patient.goal.reps || clearance !== patient.clearance;
  // Clinicians control goals: only nurses may change them (the server enforces this too).
  const isNurse = useSession((s) => s.me?.role === 'nurse');
  const onlyNurses = 'Only nurses can change goals';

  return (
    <Section title="Mobility goal (JH-HLM)" aside={<span className="text-xs text-muted">Set by {patient.goal.setBy} at {clock(patient.goal.setAt)}</span>}>
      {!isNurse && (
        <p id="goal-locked" className="mb-2 flex items-center gap-1.5 rounded-lg bg-cream p-2 font-bold">
          <Lock aria-hidden size={16} /> {onlyNurses}. Ask a nurse to update this patient’s goal or clearance.
        </p>
      )}
      <fieldset disabled={!isNurse} title={isNurse ? undefined : onlyNurses} aria-describedby={isNurse ? undefined : 'goal-locked'} className="disabled:opacity-60">
      <fieldset>
        <legend className="sr-only">Goal level</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {LEVELS.map((l) => (
            <label
              key={l}
              className={`flex min-h-tap cursor-pointer items-center gap-2 rounded-lg border-2 px-2 ${level === l ? 'border-sage-deep bg-sage/40' : 'border-line'}`}
            >
              <input type="radio" name="goal-level" value={l} checked={level === l} onChange={() => setLevel(l)} className="h-4 w-4 accent-[rgb(var(--sage-deep))]" />
              <span>
                <span className="font-bold">{l}</span> · {JHHLM[l].nurse}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2" role="group" aria-labelledby="reps-label">
          <span id="reps-label" className="font-bold">Times this shift</span>
          <button onClick={() => setReps(Math.max(1, reps - 1))} disabled={isRestGoal({ level }) || reps <= 1} aria-label="Fewer times" className="flex min-h-tap min-w-tap items-center justify-center rounded-full border-2 border-line disabled:opacity-50">
            <Minus aria-hidden size={16} />
          </button>
          <output aria-live="polite" className="w-6 text-center text-base font-bold">{reps}</output>
          <button onClick={() => setReps(Math.min(6, reps + 1))} disabled={isRestGoal({ level }) || reps >= 6} aria-label="More times" className="flex min-h-tap min-w-tap items-center justify-center rounded-full border-2 border-line disabled:opacity-50">
            <Plus aria-hidden size={16} />
          </button>
        </div>
        <fieldset className="flex items-center gap-2">
          <legend className="float-left mr-2 font-bold">Clearance</legend>
          {(['independent', 'needs-assist'] as const).map((c) => (
            <label key={c} className={`flex min-h-tap cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 ${clearance === c ? 'border-sage-deep bg-sage/40' : 'border-line'}`}>
              <input type="radio" name="clearance" checked={clearance === c} onChange={() => setClearance(c)} className="h-4 w-4" />
              {c === 'independent' ? 'Independent' : 'Needs assist'}
            </label>
          ))}
        </fieldset>
      </div>

      <p className="mt-3 rounded-lg bg-cream p-2">
        <span className="font-bold">Patient will see: </span>“{goalText({ level, reps }, 'en', patient.pet?.name)}”
        {patient.settings.language === 'es' && <span className="block text-muted">(Shown in Spanish: “{goalText({ level, reps }, 'es', patient.pet?.name)}”)</span>}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          disabled={!changed}
          onClick={() => act(() => api.put(`/patients/${patient.id}/goal`, { level, reps, clearance }))}
          className="min-h-tap rounded-full bg-sage-deep px-5 font-bold text-cream disabled:opacity-50"
        >
          Save goal
        </button>
        {changed && (
          <button
            onClick={() => {
              setLevel(patient.goal.level);
              setReps(patient.goal.reps);
              setClearance(patient.clearance);
            }}
            className="min-h-tap rounded-full border-2 border-line px-4 font-bold"
          >
            Undo changes
          </button>
        )}
      </div>
      </fieldset>
    </Section>
  );
}

function LogsSection({ view, act }: { view: PatientView; act: Act }) {
  const recent = view.logs.filter((l) => l.at >= view.now - 24 * HOUR);
  const pending = view.logs.filter((l) => l.status === 'reported');
  return (
    <Section
      title="Activity logs (last 24 h)"
      aside={
        pending.length > 1 && (
          <button
            onClick={() => act(() => Promise.all(pending.map((l) => api.post(`/logs/${l.id}/confirm`))))}
            className="min-h-tap rounded-full border-2 border-sage-deep px-3 font-bold text-sage-deep"
          >
            Confirm all {pending.length}
          </button>
        )
      }
    >
      {recent.length === 0 ? (
        <p className="text-muted">No activity in the last 24 hours.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {recent.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              <span className="w-16 text-muted">{clock(l.at)}</span>
              <span className="flex-1">
                L{l.level} {JHHLM[l.level].nurse}
                {l.source === 'family-visit' && <span className="text-muted"> · family visit walk</span>}
                {l.loggedBy && <span className="text-muted"> · logged by {l.loggedBy.label}</span>}
                {!l.loggedBy && l.reviewedBy && <span className="text-muted"> · {l.status === 'rejected' ? 'rejected' : 'confirmed'} by {l.reviewedBy.label}</span>}
                {l.at < view.shift.start && <span className="text-muted"> · prior shift</span>}
              </span>
              {l.status === 'reported' ? (
                <span className="flex gap-1">
                  <span className="sr-only">Patient-reported.</span>
                  <button onClick={() => act(() => api.post(`/logs/${l.id}/confirm`))} className="inline-flex min-h-tap items-center gap-1 rounded-full bg-sage-deep px-3 font-bold text-cream">
                    <Check aria-hidden size={14} /> Confirm
                  </button>
                  <button onClick={() => act(() => api.post(`/logs/${l.id}/reject`))} className="inline-flex min-h-tap items-center gap-1 rounded-full border-2 border-line px-3 font-bold">
                    <X aria-hidden size={14} /> Reject
                  </button>
                </span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.status === 'confirmed' ? 'bg-sage/50 text-sage-deep' : 'bg-line text-ink'}`}>
                  {l.status === 'confirmed' ? 'Confirmed' : 'Rejected'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ControlsSection({ view, act }: { view: PatientView; act: Act }) {
  const { patient } = view;
  const [note, setNote] = useState(patient.nurseNote?.text ?? '');
  const paused = patient.nudgesPausedUntil !== null && patient.nudgesPausedUntil > view.now;
  const patch = (body: object) => act(() => api.patch(`/patients/${patient.id}/controls`, body));

  return (
    <Section title="Coaching controls">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-bold">AI coaching</span>
          <button
            aria-pressed={!patient.aiCoachingMuted}
            onClick={() => patch({ aiCoachingMuted: !patient.aiCoachingMuted })}
            className={`min-h-tap rounded-full border-2 px-4 font-bold ${patient.aiCoachingMuted ? 'border-alert text-alert' : 'border-sage-deep bg-sage/40 text-sage-deep'}`}
          >
            {patient.aiCoachingMuted ? 'Muted — tap to turn on' : 'On — tap to mute'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-bold">Walking buddies</span>
          <span className="text-muted">{patient.settings.buddies ? 'Patient opted in' : 'Patient has not opted in'} ·</span>
          <button
            aria-pressed={!patient.buddiesBlockedByStaff}
            onClick={() => patch({ buddiesBlockedByStaff: !patient.buddiesBlockedByStaff })}
            className={`min-h-tap rounded-full border-2 px-4 font-bold ${patient.buddiesBlockedByStaff ? 'border-alert text-alert' : 'border-sage-deep bg-sage/40 text-sage-deep'}`}
          >
            {patient.buddiesBlockedByStaff ? 'Turned off by care team — tap to allow' : 'Allowed — tap to turn off'}
          </button>
        </div>
        {patient.activeNudge && (
          <p className="rounded-lg bg-cream px-3 py-1.5">
            <span className="font-bold">Showing on tablet now ({clock(patient.activeNudge.at)}): </span>“{patient.activeNudge.text}”
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-bold">Nudges</span>
          {patient.nudgeSnoozedUntil && patient.nudgeSnoozedUntil > view.now && !paused && (
            <span className="text-muted">Patient snoozed until {clock(patient.nudgeSnoozedUntil)} ·</span>
          )}
          {paused ? (
            <>
              <span>Paused until {clock(patient.nudgesPausedUntil!)}</span>
              <button onClick={() => patch({ nudgesPausedUntil: null })} className="min-h-tap rounded-full border-2 border-line px-3 font-bold">Resume</button>
            </>
          ) : (
            <>
              <span className="text-muted">Active</span>
              <button onClick={() => patch({ nudgesPausedUntil: view.now + HOUR })} className="min-h-tap rounded-full border-2 border-line px-3 font-bold">Pause 1 h</button>
              <button onClick={() => patch({ nudgesPausedUntil: view.shift.end })} className="min-h-tap rounded-full border-2 border-line px-3 font-bold">Pause rest of shift</button>
            </>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ nurseNote: note.trim() || null });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor="nurse-note" className="w-40 font-bold">Note to patient</label>
          <input
            id="nurse-note"
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. PT coming at 2 PM!"
            className="min-h-tap min-w-[14rem] flex-1 rounded-lg border-2 border-line px-3"
          />
          <button type="submit" className="min-h-tap rounded-full bg-sage-deep px-4 font-bold text-cream">Save note</button>
          {patient.nurseNote && (
            <button type="button" onClick={() => patch({ nurseNote: null })} className="min-h-tap rounded-full border-2 border-line px-3 font-bold">Clear</button>
          )}
        </form>
      </div>
    </Section>
  );
}

function ChatSection({ view }: { view: PatientView }) {
  const turns = view.chat;
  const flaggedAt = new Set(view.flags.filter((f) => f.source === 'chat').map((f) => f.at));
  const [log, setLog] = useState<Map<string, AiLogEntry>>(new Map());
  useEffect(() => {
    api
      .get<AiLogEntry[]>(`/patients/${view.patient.id}/ai-log`)
      .then((entries) => setLog(new Map(entries.map((e) => [e.id, e]))))
      .catch(() => undefined);
  }, [view.patient.id, turns.length]);

  return (
    <Section title="Talk to Pip conversation and nudges" aside={<span className="text-xs text-muted">Safety triggers highlighted · AI log per reply</span>}>
      {turns.length === 0 ? (
        <p className="text-muted">No conversation yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {turns.map((c) => {
            const triggered = c.role === 'patient' && flaggedAt.has(c.at);
            const flagged = triggered || c.mode === 'safety' || (c.guardrail ?? null) !== null;
            return (
              <li
                key={c.id}
                className={`rounded-lg border px-3 py-1.5 ${flagged ? 'border-alert bg-coral/10' : 'border-line'} ${c.role === 'pet' ? 'ml-6' : 'mr-6'}`}
              >
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-bold text-ink">{c.role === 'patient' ? view.patient.firstName : view.patient.pet?.name ?? 'Pip'}</span>
                  <span>{clock(c.at)}</span>
                  {triggered && (
                    <span className="inline-flex items-center gap-1 font-bold text-alert">
                      <ShieldAlert aria-hidden size={12} /> Safety flag raised
                    </span>
                  )}
                  {c.kind === 'nudge' && <span className="font-bold">· Nudge</span>}
                  {c.mode && <span>· {c.mode === 'ai' ? 'AI' : c.mode === 'template' ? 'Template' : 'Safety response (no AI call)'}</span>}
                  {c.guardrail && (
                    <span className="inline-flex items-center gap-1 font-bold text-alert">
                      {c.mode === 'safety' ? <BellRing aria-hidden size={12} /> : <MessageCircleWarning aria-hidden size={12} />}
                      Guardrail: {c.guardrail}
                    </span>
                  )}
                </div>
                <p>{c.text}</p>
                {c.aiLogId && log.get(c.aiLogId) && <AiLogDetails entry={log.get(c.aiLogId)!} />}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

interface AiLogEntry {
  id: string;
  at: number;
  fn: string;
  mode: 'ai' | 'template' | 'safety';
  guardrail: string | null;
  input: unknown;
  rawOutput: string | null;
  output: string;
  latencyMs: number;
}

/** What the AI was given and returned for one reply, from server/data/ai-log.json. */
function AiLogDetails({ entry }: { entry: AiLogEntry }) {
  const replaced = entry.rawOutput !== null && entry.rawOutput.trim() !== entry.output.trim();
  return (
    <details className="mt-1 text-xs">
      <summary className="inline-flex min-h-tap cursor-pointer items-center font-bold text-sky-deep">What the AI saw</summary>
      <dl className="mt-1 grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-muted">Function</dt>
        <dd>{entry.fn} · {entry.mode}{entry.latencyMs ? ` · ${entry.latencyMs} ms` : ''}</dd>
        <dt className="text-muted">Guardrail</dt>
        <dd>{entry.guardrail ?? 'none fired'}</dd>
        <dt className="text-muted">Input</dt>
        <dd>
          <pre tabIndex={0} className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-cream p-1.5">{JSON.stringify(entry.input, null, 2)}</pre>
        </dd>
        {replaced && (
          <>
            <dt className="text-muted">Model said</dt>
            <dd className="text-alert">{entry.rawOutput} <span className="text-muted">(replaced with a safe template)</span></dd>
          </>
        )}
      </dl>
    </details>
  );
}

/** Start this patient's session on the bedside tablet (this device), or end it at discharge. */
function BedsideSection({ view }: { view: PatientView }) {
  const navigate = useNavigate();
  const startBedside = useSession((s) => s.startBedside);
  const [state, setState] = useState<{ active: boolean; locked?: boolean; since?: number } | null>(null);
  const [message, setMessage] = useState('');
  const id = view.patient.id;

  const load = () => void api.get<{ active: boolean; locked?: boolean; since?: number }>(`/patients/${id}/bedside`).then(setState).catch(() => undefined);
  useEffect(load, [id]);
  useLiveRefresh(id, load);

  async function start() {
    const ok = window.confirm(
      `Hand this tablet to Room ${view.patient.room}? You will be signed out here, and the tablet will show ${view.patient.firstName}'s PIN lock screen.`,
    );
    if (!ok) return;
    await startBedside(id);
    navigate('/bedside');
  }

  async function helpSetUpPet() {
    await api.post(`/patients/${id}/pet/setup`, { open: true });
    setMessage(state?.active ? 'Pet setup is now open on the bedside tablet.' : 'Pet setup will open the next time the bedside tablet is unlocked.');
  }

  async function end() {
    await api.post(`/patients/${id}/bedside/end`);
    setMessage('Bedside session ended. The tablet is back at the sign-in screen.');
    load();
  }

  return (
    <section aria-labelledby="bedside-title" className="rounded-xl border border-line p-3">
      <h3 id="bedside-title" className="flex items-center gap-1.5 font-display text-base font-extrabold">
        <Tablet aria-hidden size={18} /> Bedside tablet
      </h3>
      <p className="mt-1 text-muted">
        {state?.active ? `Session active since ${clock(state.since ?? 0)}${state.locked ? ' (locked)' : ''}.` : 'No active bedside session.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => void start()} className="inline-flex min-h-tap items-center gap-2 rounded-full bg-sage-deep px-4 font-bold text-cream">
          <Tablet aria-hidden size={16} /> Start on bedside tablet
        </button>
        <button onClick={() => void helpSetUpPet()} className="inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-sage-deep px-4 font-bold text-sage-deep">
          <Sparkles aria-hidden size={16} /> Help set up pet
        </button>
        {state?.active && (
          <button onClick={() => void end()} className="inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-alert px-4 font-bold text-alert">
            End bedside session
          </button>
        )}
      </div>
      <p aria-live="polite" className="mt-1 text-muted">{message}</p>
    </section>
  );
}

/** Staff messages tagged to this patient that the viewer can already see. */
function TaggedMessages({ view }: { view: PatientView }) {
  const [items, setItems] = useState<(MessageView & { threadTitle: string })[] | null>(null);
  const id = view.patient.id;
  const load = () => void api.get<(MessageView & { threadTitle: string })[]>(`/patients/${id}/tagged-messages`).then(setItems).catch(() => undefined);
  useEffect(load, [id]);
  useLiveRefresh('*', load);
  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="tagged-title" className="rounded-xl border border-line p-3">
      <h3 id="tagged-title" className="flex items-center gap-1.5 font-display text-base font-extrabold">
        <Mail aria-hidden size={18} /> Messages about this patient
      </h3>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 6).map((m) => (
          <li key={m.id} className="rounded-lg bg-cream p-2">
            <p className="text-muted">
              <span className="font-bold text-ink">{m.mine ? 'You' : m.from}</span> · {m.threadTitle} · {clock(m.at)}
            </p>
            <p>{m.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
