// "My notes": personal reminders, visible only to the author (enforced on the server). Used as a
// panel in Care Team (all notes) and inside a patient's drawer (notes about that patient).
import { useCallback, useEffect, useState } from 'react';
import { NotebookPen, Pencil, Trash2, X } from 'lucide-react';
import type { Note } from '@shared/types';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PatientChip, type PatientOption } from './StaffMessages';
import { clock } from './time';

const LABEL = 'Personal reminders only — clinical information belongs in the medical record.';

interface ListProps {
  patients: PatientOption[];
  /** Fixed to one patient (drawer); otherwise all notes with an optional patient picker. */
  patientId?: string;
}

export function NotesList({ patients, patientId }: ListProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [attach, setAttach] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get<Note[]>(patientId ? `/notes?patientId=${encodeURIComponent(patientId)}` : '/notes').then(setNotes).catch((e: Error) => setError(e.message));
  }, [patientId]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const add = () =>
    run(async () => {
      await api.post('/notes', { text, patientId: patientId ?? (attach || null) });
      setText('');
      setAttach('');
    });

  const field = 'w-full rounded-xl border-2 border-line bg-paper px-3 py-2 focus:border-sky-deep';

  return (
    <div>
      <p className="rounded-lg bg-cream p-2 text-sm font-bold">{LABEL}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="mt-2 space-y-2"
      >
        <label htmlFor={`note-new-${patientId ?? 'all'}`} className="sr-only">New note</label>
        <textarea id={`note-new-${patientId ?? 'all'}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="Write a reminder for yourself…" className={field} />
        <div className="flex flex-wrap items-center gap-2">
          {!patientId && (
            <>
              <label htmlFor="note-patient" className="text-sm font-bold">About</label>
              <select id="note-patient" value={attach} onChange={(e) => setAttach(e.target.value)} className="min-h-tap rounded-lg border-2 border-line bg-paper px-2">
                <option value="">General (no patient)</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>Room {p.room} · {p.displayName}</option>
                ))}
              </select>
            </>
          )}
          <button type="submit" disabled={!text.trim()} className="ml-auto min-h-tap rounded-full bg-sage-deep px-4 font-bold text-cream disabled:opacity-50">
            Save note
          </button>
        </div>
      </form>
      {error && <p role="alert" className="mt-2 text-alert">{error}</p>}
      <ul className="mt-3 space-y-2">
        {notes.length === 0 && <li className="text-muted">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-line p-2">
            {editing?.id === n.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api.patch(`/notes/${n.id}`, { text: editing.text });
                    setEditing(null);
                  });
                }}
                className="space-y-2"
              >
                <label htmlFor={`note-edit-${n.id}`} className="sr-only">Edit note</label>
                <textarea id={`note-edit-${n.id}`} value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} rows={2} className={field} />
                <div className="flex gap-2">
                  <button type="submit" className="min-h-tap rounded-full bg-sage-deep px-4 font-bold text-cream">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-tap rounded-full border-2 border-line px-4 font-bold">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap">{n.text}</p>
                  <span className="flex shrink-0 gap-1">
                    <button onClick={() => setEditing({ id: n.id, text: n.text })} aria-label="Edit note" className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-sky/20">
                      <Pencil aria-hidden size={16} />
                    </button>
                    <button
                      onClick={() => window.confirm('Delete this note?') && void run(() => api.delete(`/notes/${n.id}`))}
                      aria-label="Delete note"
                      className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-alert hover:bg-coral/20"
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {!patientId && n.patientId && <PatientChip patient={patients.find((p) => p.id === n.patientId)} />}
                  {n.updatedAt > n.createdAt ? `Edited ${clock(n.updatedAt)}` : `Written ${clock(n.createdAt)}`}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MyNotesButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="inline-flex min-h-[3.25rem] items-center gap-2 rounded-full border-2 border-line bg-paper px-5 font-display text-lg font-extrabold hover:bg-sky/20">
      <NotebookPen aria-hidden size={20} /> My notes
    </button>
  );
}

export function MyNotes({ open, onClose, patients }: { open: boolean; onClose: () => void; patients: PatientOption[] }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="notes-title" drawer>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="notes-title" className="font-display text-2xl font-extrabold">My notes</h2>
          <button onClick={onClose} aria-label="Close my notes" className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-line/50">
            <X aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <NotesList patients={patients} />
        </div>
      </div>
    </Modal>
  );
}
