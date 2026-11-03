// Server-Sent Events: push a small "something changed" notice; views refetch what they need.
import { Router } from 'express';
import { bus, type ChangeEvent } from '../events';
import { isStaff } from '../auth/permissions';
import { findSession } from '../auth/sessions';

export const events = Router();

/** Clients treat ~12 s of silence as a dropped connection, so ping well inside that. */
const HEARTBEAT_MS = 5_000;

// EventSource can't send headers, so the stream takes the session token in its URL. Events carry no
// content ("patient X changed"), and patient and family streams only hear about their own patient.
events.get('/events', (req, res) => {
  const found = findSession(typeof req.query.token === 'string' ? req.query.token : undefined);
  if (!found) return res.status(401).json({ error: 'signed-out' });
  const { account } = found;
  const visible = (e: ChangeEvent) => isStaff(account.role) || e.patientId === null || e.patientId === account.patientId;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Ask the browser to reconnect quickly if the server restarts.
  res.write('retry: 2000\n\n');
  res.write('event: hello\ndata: {}\n\n');

  const send = (e: ChangeEvent) => visible(e) && res.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
  const heartbeat = setInterval(() => res.write('event: ping\ndata: {}\n\n'), HEARTBEAT_MS);
  bus.on('change', send);

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('change', send);
  });
});
