// The live "something changed" stream. Here: Server-Sent Events from the API.
// The browser-only demo swaps this file for client/demo/stream.ts (in-page events).
export interface Stream {
  close: () => void;
}

export interface StreamHandlers {
  onHello: () => void;
  onPing: () => void;
  onChange: (data: string) => void;
  onError: () => void;
}

export function openStream(token: string, h: StreamHandlers): Stream | null {
  if (typeof EventSource === 'undefined') return null;
  const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  source.addEventListener('hello', h.onHello);
  source.addEventListener('ping', h.onPing);
  source.addEventListener('change', (ev) => h.onChange((ev as MessageEvent).data));
  source.onerror = h.onError;
  return source;
}
