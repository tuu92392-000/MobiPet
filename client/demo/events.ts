// In-page change bus for the browser-only demo. Replaces server/events.ts (node:events).
export interface ChangeEvent {
  kind: string;
  patientId: string | null;
  at: number;
}

type Listener = (e: ChangeEvent) => void;
const listeners = new Set<Listener>();

export const bus = {
  on: (_name: 'change', fn: Listener) => void listeners.add(fn),
  off: (_name: 'change', fn: Listener) => void listeners.delete(fn),
  emit: (_name: 'change', e: ChangeEvent) => {
    // Async, like a network event: views refetch after the current request has finished.
    queueMicrotask(() => listeners.forEach((fn) => fn(e)));
    return true;
  },
  setMaxListeners: () => bus,
};
