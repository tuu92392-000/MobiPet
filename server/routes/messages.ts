// Message history for every role. Each route checks thread access in server/messages.ts.
import { Router, type Request, type Response } from 'express';
import { canAccessThread, canSeeMessage, markRead, messageFor, parseThread, sendMessage, threadsFor, type ThreadRef } from '../messages';
import { requireCan } from '../auth/middleware';
import { getDB } from '../store';

export const messages = Router();

function threadOr403(req: Request, res: Response): ThreadRef | null {
  if (!req.actor) {
    res.status(401).json({ error: req.session?.locked ? 'locked' : 'signed-out' });
    return null;
  }
  const thread = parseThread(String(req.params.threadId));
  if (!thread || !canAccessThread(req.actor, thread)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return thread;
}

messages.get('/messages/threads', (req, res) => {
  if (!req.actor) return res.status(401).json({ error: req.session?.locked ? 'locked' : 'signed-out' });
  res.json(threadsFor(req.actor));
});

messages.get('/messages/threads/:threadId', (req, res) => {
  const thread = threadOr403(req, res);
  if (!thread) return;
  const list = getDB()
    .messages.filter((m) => m.threadId === thread.id && !m.blocked)
    .sort((a, b) => a.at - b.at)
    .map((m) => messageFor(req.actor!, m));
  res.json({ id: thread.id, kind: thread.kind, patientId: thread.patientId, messages: list });
});

messages.post('/messages/threads/:threadId', (req, res) => {
  const thread = threadOr403(req, res);
  if (!thread) return;
  sendMessage(req.actor!, thread, req.body ?? {})
    .then((r) => {
      if (!r.ok) return res.status(r.status).json({ error: r.error, reason: r.reason ?? null });
      res.status(201).json({ message: messageFor(req.actor!, r.message), action: r.action });
    })
    .catch(() => res.status(500).json({ error: 'Something went wrong' }));
});

messages.post('/messages/threads/:threadId/read', (req, res) => {
  const thread = threadOr403(req, res);
  if (!thread) return;
  markRead(req.actor!, thread);
  res.json({ ok: true });
});

// "Messages about this patient" in the Care Team drawer: staff messages tagged to the patient that this
// viewer can already see (their own 1:1 threads and the unit thread).
messages.get('/patients/:id/tagged-messages', requireCan('unit.read', () => null), (req, res) => {
  const list = getDB()
    .messages.filter((m) => m.patientTag === req.params.id && canSeeMessage(req.actor, m))
    .sort((a, b) => b.at - a.at)
    .map((m) => ({ ...messageFor(req.actor!, m), threadTitle: m.threadId === 'unit' ? 'Unit thread' : 'Staff 1:1' }));
  res.json(list);
});
