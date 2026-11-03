// Bedside lock screen: the patient's pet asleep and a large PIN pad. Shows nothing else about the patient.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { ApiError } from '../../api/client';
import { useSession, type Me } from '../../auth/session';
import { makeT } from '../../i18n';
import { PetSvg } from '../../pets/PetSvg';

type Locked = Extract<Me, { locked: true }>;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function LockScreen({ me }: { me: Locked }) {
  const unlock = useSession((s) => s.unlock);
  const lang = me.lockScreen?.language ?? 'en';
  const t = useMemo(() => makeT(lang), [lang]);
  const pet = me.lockScreen?.pet ?? null;
  const petName = pet?.name ?? 'Pip';
  const [pin, setPinState] = useState('');
  // Kept in a ref too, so fast taps or typing never read a stale value.
  const pinRef = useRef('');
  const setPin = (next: string) => {
    pinRef.current = next;
    setPinState(next);
  };
  const busyRef = useRef(false);
  const [error, setError] = useState<'wrong' | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(me.pinBlockedUntil);
  const [busy, setBusy] = useState(false);
  const blocked = blockedUntil !== null && blockedUntil > Date.now();

  // Re-open the pad when the one-minute block ends.
  useEffect(() => {
    if (!blockedUntil) return;
    const timer = window.setTimeout(() => setBlockedUntil(null), Math.max(0, blockedUntil - Date.now()) + 250);
    return () => window.clearTimeout(timer);
  }, [blockedUntil]);

  async function submit(full: string) {
    busyRef.current = true;
    setBusy(true);
    try {
      await unlock(full);
    } catch (e) {
      setPin('');
      if (e instanceof ApiError && e.code === 'pin-blocked') setBlockedUntil(Number(e.data.pinBlockedUntil) || Date.now() + 60_000);
      else setError('wrong');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busyRef.current || blocked || pinRef.current.length >= 4) return;
    setError(null);
    const next = pinRef.current + digit;
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  // A hardware keyboard works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin(pinRef.current.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = 'en';
    };
  }, [lang]);

  const key = 'flex min-h-[4.5rem] items-center justify-center rounded-2xl border-4 border-line bg-paper font-display text-3xl font-extrabold hover:bg-sage/30 disabled:opacity-40';

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-6 text-center" lang={lang}>
      {pet ? (
        <PetSvg species={pet.species} palette={pet.palette} accessory={pet.accessory} mood="sleepy" label={t('lock.title', { name: me.lockScreen?.firstName ?? '', pet: petName })} className="h-44 w-44" />
      ) : (
        <PetSvg species="nimbus" palette={0} mood="sleepy" label="" className="h-44 w-44" />
      )}
      <h1 className="mt-2 font-display text-3xl font-extrabold">{t('lock.title', { name: me.lockScreen?.firstName ?? '', pet: petName })}</h1>

      {blocked ? (
        <div role="alert" className="mt-6 rounded-blob border-4 border-coral-deep bg-paper p-6">
          <p className="font-display text-2xl font-extrabold">{t('lock.blocked')}</p>
          <p className="mt-2 text-lg text-muted">{t('lock.blockedWait')}</p>
        </div>
      ) : (
        <>
          <p id="pin-prompt" className="mt-1 text-xl">{t('lock.prompt', { pet: petName })}</p>
          <div className="mt-4 flex gap-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-6 w-6 rounded-full border-4 border-ink ${i < pin.length ? 'bg-ink' : 'bg-paper'}`} />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">{busy ? t('lock.checking') : t('lock.entered', { n: pin.length })}</p>
          <p role="alert" className="mt-3 min-h-[1.75rem] text-lg font-bold text-alert">{error === 'wrong' ? t('lock.wrong') : ''}</p>
          <div role="group" aria-label={t('lock.pad')} aria-describedby="pin-prompt" className="mt-2 grid w-full max-w-xs grid-cols-3 gap-3">
            {KEYS.map((d) => (
              <button key={d} onClick={() => press(d)} disabled={busy} className={key}>{d}</button>
            ))}
            <button onClick={() => { setPin(''); setError(null); }} disabled={busy} className={`${key} text-lg`}>{t('lock.clear')}</button>
            <button onClick={() => press('0')} disabled={busy} className={key}>0</button>
            <button onClick={() => setPin(pinRef.current.slice(0, -1))} disabled={busy} className={key} aria-label={t('lock.delete')}>
              <Delete aria-hidden size={32} />
            </button>
          </div>
        </>
      )}
      <p className="mt-6 text-base text-muted">{t('lock.private')}</p>
      <p role="note" className="mt-2 text-base font-bold">{t('lock.demoOnly')}</p>
    </section>
  );
}
