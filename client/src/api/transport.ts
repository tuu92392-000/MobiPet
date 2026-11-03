// How the client reaches the API: over HTTP to the Express server (via the Vite proxy).
// The browser-only demo swaps this file for client/demo/transport.ts, which runs the same routes in the page.
export function transport(url: string, init: RequestInit): Promise<Response> {
  return fetch(`/api${url}`, init);
}
