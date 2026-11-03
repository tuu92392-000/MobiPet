// One shared live stream for the whole app (stream.ts). Views subscribe and refetch on relevant changes.
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { openStream, type Stream } from './stream';

export interface ChangeEvent {
  /** 'resync' is synthesized locally after a reconnect, since events may have been missed. */
  kind: string;
  patientId: string | null;
  at: number;
}

type Listener = (e: ChangeEvent) => void;

export const useLiveStatus = create<{ status: 'connecting' | 'live' | 'reconnecting' }>(() => ({ status: 'connecting' }));

const listeners = new Set<Listener>();
let source: Stream | null = null;
let everConnected = false;
let lastSeen = 0;
let streamToken: string | null = null;

/** Reopen the stream as a different signed-in user (or close it when signed out). */
export function setLiveToken(token: string | null) {
  if (token === streamToken) return;
  streamToken = token;
  source?.close();
  source = null;
  everConnected = false;
  if (token) ensureSource();
}

/** The server pings every 5 s; this long without anything means the stream silently died. */
const STALE_MS = 12_000;

export function ensureSource() {
  if (source || !streamToken) return;
  lastSeen = Date.now();
  const seen = () => {
    lastSeen = Date.now();
  };
  source = openStream(streamToken, {
    onHello: () => {
      seen();
      useLiveStatus.setState({ status: 'live' });
      if (everConnected) emit({ kind: 'resync', patientId: null, at: Date.now() });
      everConnected = true;
    },
    onPing: seen,
    onChange: (data) => {
      seen();
      emit(JSON.parse(data));
    },
    onError: () => useLiveStatus.setState({ status: 'reconnecting' }),
  });
}

// Watchdog: replace a stream that has gone quiet (proxy kept it open, Wi-Fi dropped, laptop slept).
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (streamToken && (!source || Date.now() - lastSeen > STALE_MS)) {
      source?.close();
      source = null;
      useLiveStatus.setState({ status: 'reconnecting' });
      ensureSource();
    }
  }, 3_000);
}

function emit(e: ChangeEvent) {
  listeners.forEach((l) => l(e));
}

/**
 * Run `onChange` (debounced) when a change touches `patientId`, or any change when `patientId` is '*'.
 * Unit-wide events (clock, reset, resync) always match. Also refreshes every minute so
 * time-based statuses ("not moved in 3 hours") stay current between events.
 */
export function useLiveRefresh(patientId: string | '*' | null, onChange: () => void, debounceMs = 150) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (patientId === null) return;
    ensureSource();
    let timer: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => cb.current(), debounceMs);
    };
    const listener: Listener = (e) => {
      if (patientId === '*' || e.patientId === null || e.patientId === patientId) fire();
    };
    listeners.add(listener);
    const tick = window.setInterval(fire, 60_000);
    return () => {
      listeners.delete(listener);
      window.clearTimeout(timer);
      window.clearInterval(tick);
    };
  }, [patientId, debounceMs]);
}
