// The bedside tablet: the lock screen until the PIN is entered, then the patient's own screen.
// Re-locks after the configured minutes without a touch.
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useSession } from '../../auth/session';
import { useLiveRefresh } from '../../lib/live';
import { PatientScreen } from '../patient/PatientScreen';
import { LockScreen } from './LockScreen';

/** Report a touch to the server at most this often; the server lock uses the same idle limit. */
const ACTIVITY_PING_MS = 30_000;

export function Bedside() {
  const me = useSession((s) => s.me);
  const idleMinutes = useSession((s) => s.config.bedsideIdleMinutes);
  const lock = useSession((s) => s.lock);
  const refreshMe = useSession((s) => s.refreshMe);
  const unlocked = me && !me.locked && me.role === 'patient' ? me : null;
  const lastTouch = useRef(Date.now());
  const lastPing = useRef(0);
  // Each unlock (PIN entry, including after the inactivity lock) is a wake: the pet says welcome back.
  const [wokeAt, setWokeAt] = useState<number | null>(null);
  const isUnlocked = !!unlocked;
  useEffect(() => {
    if (isUnlocked) setWokeAt(Date.now());
  }, [isUnlocked]);

  // Staff ending the session (or starting it on another tablet) arrives as a live event.
  useLiveRefresh(unlocked?.patientId ?? (me?.locked ? '*' : null), () => void refreshMe());

  // Depends on the unlocked flag only, so a refreshed session object never resets the idle timer.
  useEffect(() => {
    if (!isUnlocked) return;
    lastTouch.current = Date.now();
    const onTouch = () => {
      lastTouch.current = Date.now();
      if (Date.now() - lastPing.current > ACTIVITY_PING_MS) {
        lastPing.current = Date.now();
        void api.post('/auth/activity').catch(() => undefined);
      }
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onTouch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastTouch.current > idleMinutes * 60_000) void lock();
    }, 5_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onTouch));
      window.clearInterval(timer);
    };
  }, [isUnlocked, idleMinutes, lock]);

  if (!me) return <Navigate to="/sign-in" replace />;
  if (me.locked) return <LockScreen me={me} />;
  if (!unlocked?.patientId) return <Navigate to="/" replace />;
  return <PatientScreen patientId={unlocked.patientId} wokeAt={wokeAt} />;
}
