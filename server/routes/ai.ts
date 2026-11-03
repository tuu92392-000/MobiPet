import { Router, type Request, type Response } from 'express';
import { HOUR } from '../../shared/shifts';
import { aiLogFor } from '../ai/log';
import { coachReply, makeNudge, summarizeUnit, type NudgeTrigger } from '../ai/pipeline';
import { aiMode } from '../ai/client';
import { findPatient, mutate, now } from '../store';
import { unitView } from '../views';
import { requireCan } from '../auth/middleware';

export const ai = Router();

type Handler = (req: Request, res: Response) => Promise<unknown>;
const safe = (fn: Handler) => (req: Request, res: Response) => {
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong' });
  });
};

ai.post(
  '/patients/:id/chat',
  requireCan('patient.tablet'),
  safe(async (req, res) => {
    const p = findPatient(req.params.id);
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'text required' });
    res.json(await coachReply(p, text));
  }),
);

ai.post(
  '/patients/:id/nudge',
  requireCan('patient.tablet'),
  safe(async (req, res) => {
    const p = findPatient(req.params.id);
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    const trigger: NudgeTrigger = req.body?.trigger === 'meal' ? 'meal' : 'idle';
    res.json(await makeNudge(p, trigger));
  }),
);

// Patient dismisses the nudge, optionally snoozing nudges for an hour.
ai.post('/patients/:id/nudge/dismiss', requireCan('patient.tablet'), (req, res) => {
  const p = findPatient(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  mutate('patient', p.id, () => {
    p.activeNudge = null;
    if (req.body?.snooze) p.nudgeSnoozedUntil = now() + HOUR;
  });
  res.json({ ok: true });
});

// Nurse marks the patient's question as answered.
ai.post('/patients/:id/question/answered', requireCan('flags.manage'), (req, res) => {
  const p = findPatient(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  mutate('patient', p.id, () => {
    p.questionForNurse = null;
  });
  res.json({ ok: true });
});

ai.get('/patients/:id/ai-log', requireCan('ailog.read'), (req, res) => res.json(aiLogFor(req.params.id)));

ai.post(
  '/unit/summary',
  requireCan('unit.read'),
  safe(async (_req, res) => {
    const unit = unitView();
    const summary = await summarizeUnit(unit.facts);
    res.json({ ...summary, generatedAt: unit.now, facts: unit.facts, aiMode: aiMode() });
  }),
);
