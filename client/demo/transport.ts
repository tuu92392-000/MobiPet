// Browser-only demo transport: instead of HTTP, run the real API routes (server/routes/*.ts) inside
// the page, with the same authentication and permission middleware. Replaces client/src/api/transport.ts.
import { dispatch, type DemoRequest } from './express';
import { authenticate } from '../../server/auth/middleware';
import { auth } from '../../server/routes/auth';
import { patients } from '../../server/routes/patients';
import { ai } from '../../server/routes/ai';
import { family } from '../../server/routes/family';
import { messages } from '../../server/routes/messages';
import { notes } from '../../server/routes/notes';
import { exportRoutes } from '../../server/routes/exports';
import { buddies } from '../../server/routes/buddies';
import { demo } from '../../server/routes/demo';
import { Router } from './express';
import { now } from '../../server/store';

// Exports build files with Buffer.from(...); in the page a Uint8Array does the same job.
const g = globalThis as unknown as { Buffer?: { from: (x: unknown, enc?: string) => unknown } };
g.Buffer ??= {
  from: (x: unknown) => (typeof x === 'string' ? new TextEncoder().encode(x) : x instanceof ArrayBuffer ? new Uint8Array(x) : x),
};

const health = Router();
health.get('/health', (_req, res) => res.json({ ok: true, now: now(), aiMode: 'template', model: null, demo: true }));

const base = Router();
base.use(authenticate as never);

const routers = [base, health, auth, patients, ai, family, messages, notes, exportRoutes, buddies, demo] as unknown as Parameters<typeof dispatch>[0];

export async function transport(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url, 'http://demo.local');
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
  const req: DemoRequest = {
    method: (init.method ?? 'GET').toUpperCase(),
    path: parsed.pathname,
    params: {},
    query: Object.fromEntries(parsed.searchParams),
    body: typeof init.body === 'string' ? JSON.parse(init.body) : {},
    headers,
    get: (name) => headers[name.toLowerCase()],
  };
  const r = await dispatch(routers, req);
  const body = r.json ? JSON.stringify(r.body) : (r.body as BodyInit);
  return new Response(r.status === 204 ? null : body, { status: r.status, headers: r.headers });
}
