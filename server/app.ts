// The Express app, separate from listen() so tests can run it on a random port.
import express from 'express';
import cors from 'cors';
import { patients } from './routes/patients';
import { family } from './routes/family';
import { demo } from './routes/demo';
import { events } from './routes/events';
import { ai } from './routes/ai';
import { auth } from './routes/auth';
import { messages } from './routes/messages';
import { notes } from './routes/notes';
import { exportRoutes } from './routes/exports';
import { buddies } from './routes/buddies';
import { authenticate } from './auth/middleware';
import { aiMode, MODEL } from './ai/client';
import { now } from './store';

export function createApp() {
  const app = express();
  app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, now: now(), aiMode: aiMode(), model: aiMode() === 'ai' ? MODEL : null });
  });

  // Every route below knows who is asking; each one then checks permissions itself (server/auth/permissions.ts).
  app.use('/api', authenticate, events, auth, patients, ai, family, messages, notes, exportRoutes, buddies, demo);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}
