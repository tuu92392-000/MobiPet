// Care Team "Messages": every conversation this staff member is part of (patients' care team threads,
// the unit thread, and 1:1 threads), with unread counts and full history.
import { useCallback, useEffect, useState } from 'react';
import { Hash, Mail, Tag, User, Users, X } from 'lucide-react';
import type { ThreadSummary } from '@shared/api';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useLiveRefresh } from '../../lib/live';
import { Conversation, formatWhen } from '../../messages/Conversation';

const GROUPS: { kind: ThreadSummary['kind']; title: string }[] = [
  { kind: 'unit', title: 'Unit' },
  { kind: 'staff', title: 'Staff 1:1' },
  { kind: 'careteam', title: 'Patients' },
];

export function useStaffThreads() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const load = useCallback(() => void api.get<ThreadSummary[]>('/messages/threads').then(setThreads).catch(() => undefined), []);
  useEffect(load, [load]);
  useLiveRefresh('*', load);
  return { threads, reload: load };
}

export function StaffMessagesButton({ unread, onOpen }: { unread: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="inline-flex min-h-[3.25rem] items-center gap-2 rounded-full border-2 border-line bg-paper px-5 font-display text-lg font-extrabold hover:bg-sky/20">
      <Mail aria-hidden size={20} /> Messages
      {unread > 0 && <span className="rounded-full bg-alert px-2 text-sm text-cream">{unread} unread</span>}
    </button>
  );
}

export interface PatientOption {
  id: string;
  room: string;
  displayName: string;
}

/** Small chip on a staff message tagged to a patient. */
export function PatientChip({ patient }: { patient?: PatientOption }) {
  if (!patient) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-deep bg-paper px-2 text-xs font-bold text-sky-deep">
      <Tag aria-hidden size={12} /> Room {patient.room} · {patient.displayName}
    </span>
  );
}

interface Props {
  open: boolean;
  patients: PatientOption[];
  onClose: () => void;
  threads: ThreadSummary[];
  reload: () => void;
  /** Open straight to this thread (e.g. from a patient drawer). */
  initialThread?: string | null;
}

export function StaffMessages({ open, onClose, threads, reload, initialThread, patients }: Props) {
  const [tag, setTag] = useState('');
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (open) setActive(initialThread ?? threads.find((t) => t.unread > 0)?.id ?? 'unit');
    // Only when the panel opens; later thread updates keep the current selection.
  }, [open]);
  const current = threads.find((t) => t.id === active);
  const now = Date.now();

  return (
    <Modal open={open} onClose={() => { onClose(); reload(); }} labelledBy="staff-messages-title" drawer className="!w-[min(64rem,100%)]">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="staff-messages-title" className="font-display text-2xl font-extrabold">Messages</h2>
          <button onClick={onClose} aria-label="Close messages" className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-line/50">
            <X aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr]">
          <nav aria-label="Conversations" className="overflow-y-auto border-b border-line md:border-b-0 md:border-r">
            {GROUPS.map((g) => {
              const items = threads.filter((t) => t.kind === g.kind);
              if (items.length === 0) return null;
              return (
                <div key={g.kind} className="py-2">
                  <h3 className="px-4 text-xs font-bold uppercase tracking-wide text-muted">{g.title}</h3>
                  <ul>
                    {items.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => setActive(t.id)}
                          aria-current={active === t.id ? 'true' : undefined}
                          className={`flex min-h-tap w-full items-start gap-2 px-4 py-2 text-left hover:bg-sky/20 ${active === t.id ? 'bg-sage/40' : ''}`}
                        >
                          {t.kind === 'unit' ? <Hash aria-hidden size={18} className="mt-0.5 shrink-0" /> : t.kind === 'staff' ? <User aria-hidden size={18} className="mt-0.5 shrink-0" /> : <Users aria-hidden size={18} className="mt-0.5 shrink-0" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className={`truncate ${t.unread ? 'font-extrabold' : 'font-bold'}`}>{t.title}</span>
                              {t.unread > 0 && <span className="shrink-0 rounded-full bg-alert px-1.5 text-xs font-bold text-cream">{t.unread}<span className="sr-only"> unread</span></span>}
                            </span>
                            {t.lastPreview && (
                              <span className="block truncate text-sm text-muted">
                                {t.lastAt && `${formatWhen(t.lastAt, now)} · `}
                                {t.lastPreview}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          <section aria-label={current?.title ?? 'Conversation'} className="flex min-h-0 flex-col">
            {current ? (
              <>
                <h3 className="border-b border-line px-4 py-2 font-display text-lg font-extrabold">{current.title}</h3>
                <Conversation
                  key={current.id}
                  threadId={current.id}
                  renderTag={(id) => <PatientChip patient={patients.find((p) => p.id === id)} />}
                  extraBody={tag ? { patientTag: tag } : undefined}
                  onSent={() => setTag('')}
                  composerExtra={
                    current.kind === 'careteam' ? undefined : (
                      <div className="mb-2 flex items-center gap-2">
                        <label htmlFor="tag-patient" className="text-sm font-bold">Tag a patient (optional)</label>
                        <select id="tag-patient" value={tag} onChange={(e) => setTag(e.target.value)} className="min-h-tap rounded-lg border-2 border-line bg-paper px-2">
                          <option value="">No patient</option>
                          {patients.map((p) => (
                            <option key={p.id} value={p.id}>Room {p.room} · {p.displayName}</option>
                          ))}
                        </select>
                      </div>
                    )
                  }
                  labels={{
                    history: `Messages: ${current.title}`,
                    empty: current.kind === 'careteam' ? 'No messages with this patient yet.' : 'No messages yet.',
                    you: 'You',
                    placeholder: current.kind === 'careteam' ? 'Write to the patient…' : 'Write a message…',
                    send: 'Send',
                    blocked: 'That message didn’t pass the patient message filter. Please rephrase.',
                    error: 'Could not send. Please try again.',
                    composerNote: 'For urgent issues, use the call system.',
                  }}
                />
              </>
            ) : (
              <p className="p-4 text-muted">Choose a conversation.</p>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
