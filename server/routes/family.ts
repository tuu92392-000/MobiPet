import { Router } from 'express';
import { findPatient } from '../store';
import { familyView } from '../views';
import { parseThread, sendMessage } from '../messages';
import { requireCan } from '../auth/middleware';

export const family = Router();

// Joining with an invite code is a sign-in: see POST /auth/family.

family.get('/family/:patientId', requireCan('family.read'), (req, res) => {
  const p = findPatient(req.params.patientId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(familyView(p));
});

// Family members can't log activity (CLAUDE.md permissions); a walk together is reported from the tablet.

// Every family message passes the content filter. Blocked messages are kept (for audit) but never shown.
// Same rules as POST /messages/threads/family:<id>, kept as the family view's send route.
family.post('/family/:patientId/messages', requireCan('message.toPatient'), (req, res) => {
  const thread = parseThread(`family:${req.params.patientId}`);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  sendMessage(req.actor!, thread, { kind: req.body?.kind, body: req.body?.body, fromName: req.body?.from })
    .then((r) => {
      if (!r.ok) return res.status(r.status).json({ error: r.error, reason: r.reason ?? null });
      res.status(201).json(r.message);
    })
    .catch(() => res.status(500).json({ error: 'Something went wrong' }));
});
