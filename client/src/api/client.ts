// Thin fetch wrapper over the API transport (HTTP in the full app, in-page in the browser-only demo).
import { transport } from './transport';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

let authToken: string | null = null;
let onAuthLost: ((reason: 'locked' | 'signed-out') => void) | null = null;

/** Set by the session store; every request carries the token. */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called when the server says the tablet locked or the session ended, so the app can show the right screen. */
export function onAuthLostHandler(fn: (reason: 'locked' | 'signed-out') => void) {
  onAuthLost = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await transport(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && (data.error === 'locked' || data.error === 'signed-out') && !url.startsWith('/auth/') && !url.startsWith('/bedside/')) {
    onAuthLost?.(data.error);
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? data.error ?? res.statusText, data);
  return data as T;
}

/** POST that returns a file (exports). Saves it in the browser under the server's filename. */
async function download(url: string, body: unknown): Promise<{ filename: string; rows: number }> {
  const res = await transport(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? 'error', data.error ?? res.statusText, data);
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'mobipet_export';
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return { filename, rows: Number(res.headers.get('x-export-rows') ?? 0) };
}

export const api = {
  download,
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};
