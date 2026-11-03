// Private notes: personal reminders for staff. Every note is visible only to its author; anyone else
// gets a 404, as if the note did not exist. Notes are never exported.
import { Router, type Request, type Response } from 'express';
import type { Note } from '../../shared/types';
import { requireCan } from '../auth/middleware';
import { findPatient, getDB, mutateQuiet, now } from '../store';
import { newId } from '../seed';

export const notes = Router();

notes.use('/notes', requireCan('notes.use', () => null));

const MAX = 1000;

function ownNote(req: Request, res: Response): Note | null {
  const note = getDB().notes.find((n) => n.id === req.params.noteId && n.authorId === req.actor!.accountId);
  if (!note) res.status(404).json({ error: 'Note not found' });
  return note ?? null;
}

notes.get('/notes', (req, res) => {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  res.json(
    getDB()
      .notes.filter((n) => n.authorId === req.actor!.accountId && (patientId === undefined || n.patientId === patientId))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
});

notes.post('/notes', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const patientId = req.body?.patientId ?? null;
  if (!text || text.length > MAX) return res.status(400).json({ error: `Notes need to be 1–${MAX} characters.` });
  if (patientId !== null && !findPatient(String(patientId))) return res.status(400).json({ error: 'Unknown patient' });
  const t = now();
  const note: Note = { id: newId('note'), authorId: req.actor!.accountId, patientId, text, createdAt: t, updatedAt: t };
  mutateQuiet((db) => db.notes.push(note));
  res.status(201).json(note);
});

notes.patch('/notes/:noteId', (req, res) => {
  const note = ownNote(req, res);
  if (!note) return;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > MAX) return res.status(400).json({ error: `Notes need to be 1–${MAX} characters.` });
  mutateQuiet(() => {
    note.text = text;
    note.updatedAt = now();
  });
  res.json(note);
});

notes.delete('/notes/:noteId', (req, res) => {
  const note = ownNote(req, res);
  if (!note) return;
  mutateQuiet((db) => {
    db.notes = db.notes.filter((n) => n.id !== note.id);
  });
  res.json({ ok: true });
});
