// Browser-only demo: live updates from the in-page change bus instead of Server-Sent Events, with the
// same per-viewer filter as server/routes/events.ts. Replaces client/src/lib/stream.ts.
import { bus, type ChangeEvent } from '../../server/events';
import { findSession } from '../../server/auth/sessions';
import { isStaff } from '../../server/auth/permissions';
import type { Stream, StreamHandlers } from '../src/lib/stream';

export type { Stream, StreamHandlers };

export function openStream(token: string, h: StreamHandlers): Stream | null {
  const found = findSession(token);
  if (!found) {
    queueMicrotask(h.onError);
    return { close: () => undefined };
  }
  const { account } = found;
  const visible = (e: ChangeEvent) => isStaff(account.role) || e.patientId === null || e.patientId === account.patientId;
  const send = (e: ChangeEvent) => visible(e) && h.onChange(JSON.stringify(e));
  bus.on('change', send);
  queueMicrotask(h.onHello);
  // Keep the live watchdog satisfied, as the server's heartbeat does.
  const ping = window.setInterval(h.onPing, 5_000);
  return {
    close: () => {
      bus.off('change', send);
      window.clearInterval(ping);
    },
  };
}
