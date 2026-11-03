import { EventEmitter } from 'node:events';

export interface ChangeEvent {
  kind: string;
  patientId: string | null;
  at: number;
}

/** In-process change bus. Server-Sent Events (phase 5) subscribe to it. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);
