// Presenter drawer: one tap signs in as any seeded account, plus a link to the demo controls.
// Turned off with MOBIPET_DEMO_SWITCHER=false, as a real deployment would be.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FlaskConical, Heart, Stethoscope, X } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { PetSvg } from '../../pets/PetSvg';
import { loadDemoAccounts, switchTo, type DemoAccounts } from './switcher';

export function DemoSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccounts | null>(null);
  const [stopAtLock, setStopAtLock] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) loadDemoAccounts().then(setAccounts).catch(() => setError('Demo accounts are unavailable.'));
  }, [open]);

  async function go(who: string) {
    setBusy(who);
    setError('');
    try {
      const to = await switchTo(who, { stopAtLock });
      setOpen(false);
      navigate(to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch');
    } finally {
      setBusy(null);
    }
  }

  const tile = 'flex min-h-tap items-center gap-2 rounded-xl border-2 border-line bg-cream px-3 py-2 text-left font-bold hover:bg-sky/30 disabled:opacity-50';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-tap items-center gap-1.5 rounded-full border-2 border-dashed border-sky-deep px-4 font-bold text-sky-deep hover:bg-sky/20"
      >
        <FlaskConical aria-hidden size={18} /> Demo
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="demo-switcher-title" drawer>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div>
              <h2 id="demo-switcher-title" className="font-display text-2xl font-extrabold">Demo switcher</h2>
              <p className="text-sm text-muted">Presenter tool. Signs in through the real sign-in with the seeded demo credentials.</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close demo switcher" className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-line/50">
              <X aria-hidden />
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {error && <p role="alert" className="rounded-lg bg-coral/20 p-2 text-alert">{error}</p>}
            {!accounts ? (
              !error && <p role="status" className="text-muted">Loading accounts…</p>
            ) : (
              <>
                <section aria-labelledby="sw-staff">
                  <h3 id="sw-staff" className="flex items-center gap-2 font-display text-lg font-extrabold"><Stethoscope aria-hidden size={20} /> Care team</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {accounts.staff.map((s) => (
                      <button key={s.username} disabled={!!busy} onClick={() => void go(s.username)} className={tile}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-muted">Password for all staff: <code>{accounts.staffPassword}</code></p>
                </section>

                <section aria-labelledby="sw-patients">
                  <h3 id="sw-patients" className="font-display text-lg font-extrabold">Bedside tablets</h3>
                  <label className="mt-1 flex min-h-tap items-center gap-3">
                    <input type="checkbox" checked={stopAtLock} onChange={(e) => setStopAtLock(e.target.checked)} className="h-5 w-5" />
                    Stop at the PIN lock screen (type the PIN yourself)
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {accounts.patients.map((p) => (
                      <button key={p.patientId} disabled={!!busy} onClick={() => void go(`patient-${p.patientId}`)} className={tile}>
                        {p.pet ? <PetSvg species={p.pet.species} palette={p.pet.palette} mood="happy" label="" className="h-9 w-9 shrink-0" /> : null}
                        <span>
                          Room {p.room}
                          <span className="block text-sm font-normal text-muted">{p.name} · PIN {p.pin}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="sw-family">
                  <h3 id="sw-family" className="flex items-center gap-2 font-display text-lg font-extrabold"><Heart aria-hidden size={20} /> Family</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {accounts.family.map((f) => (
                      <button key={f.patientId} disabled={!!busy} onClick={() => void go(`family-${f.patientId}`)} className={tile}>
                        <span>
                          {f.label}
                          <span className="block text-sm font-normal text-muted">Code {f.code}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="sw-tools" className="border-t border-line pt-4">
                  <h3 id="sw-tools" className="font-display text-lg font-extrabold">Presenter tools</h3>
                  <button onClick={() => { setOpen(false); navigate('/demo'); }} className={`${tile} mt-2`}>
                    Clock, scenarios, reset and Impact panel
                  </button>
                </section>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

/** `/demo/as/:who` signs this browser tab in as a demo account, for "open side by side" links. */
export function DemoSignInAs() {
  const { who = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    // Strict mode runs effects twice in development; sign in only once.
    if (started.current) return;
    started.current = true;
    switchTo(who)
      .then((to) => navigate(to, { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [who, navigate]);
  return <p role={error ? 'alert' : 'status'} className="p-6 text-center text-lg">{error || 'Signing in…'}</p>;
}
