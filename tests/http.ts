// Shared helpers for tests that drive the real Express app over HTTP (in memory, random port).
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { expect } from 'vitest';
import { createApp } from '../server/app';
import { demoPin, STAFF_PASSWORD } from '../server/auth/accounts';
import { resetToSeed } from '../server/store';

let server: Server | null = null;
let base = '';

export function start() {
  resetToSeed();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export function stop() {
  server?.close();
}

export async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

/** For non-JSON responses (file downloads). */
export async function raw(method: string, path: string, token?: string, body?: unknown) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function staff(username: string) {
  const r = await call('POST', '/auth/login', undefined, { username, password: STAFF_PASSWORD });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

export async function bedside(patientId: string) {
  const nurse = await staff('nurse1');
  const started = await call('POST', '/bedside/start', nurse, { patientId });
  expect(started.status).toBe(201);
  const token = started.body.token as string;
  expect((await call('POST', '/bedside/unlock', token, { pin: demoPin(patientId.slice(1)) })).status).toBe(200);
  return token;
}

export async function family(patientId: string) {
  const r = await call('POST', '/auth/family', undefined, { code: `PIP-${patientId.slice(1)}` });
  expect(r.status).toBe(200);
  return r.body.token as string;
}
