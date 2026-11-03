// Staff sign-in. Patients never sign in here: a nurse or aide starts their bedside tablet from Care Team.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useSession } from '../../auth/session';
import { PetSvg } from '../../pets/PetSvg';

export function SignIn() {
  const navigate = useNavigate();
  const signInStaff = useSession((s) => s.signInStaff);
  const demo = useSession((s) => s.config.demoSwitcher);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInStaff(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
      setBusy(false);
    }
  }

  const field = 'min-h-[3.25rem] w-full rounded-2xl border-4 border-line bg-paper px-4 text-xl focus:border-sky-deep';

  return (
    <section className="mx-auto flex max-w-md flex-col items-center p-6 text-center">
      <PetSvg species="nimbus" palette={0} mood="happy" label="" className="h-28 w-28" />
      <h1 className="mt-2 font-display text-3xl font-extrabold">Sign in to MobiPet</h1>
      <p className="mt-1 text-lg text-muted">Care team sign-in</p>
      <p role="note" className="mt-3 rounded-xl border-2 border-coral-deep bg-coral/20 px-4 py-2 font-bold">Demo only — don’t enter real passwords.</p>
      <form onSubmit={submit} className="mt-6 flex w-full flex-col gap-4 text-left">
        <div>
          <label htmlFor="username" className="text-lg font-bold">Username</label>
          <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" className={field} />
        </div>
        <div>
          <label htmlFor="password" className="text-lg font-bold">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={field} />
        </div>
        {error && <p role="alert" className="text-lg font-bold text-alert">{error}</p>}
        <button type="submit" disabled={busy || !username || !password} className="min-h-[3.5rem] rounded-full bg-sage-deep text-xl font-bold text-cream disabled:opacity-50">
          Sign in
        </button>
      </form>
      {demo && <p className="mt-3 text-base text-muted">Demo: use the <strong>Demo</strong> button at the top to sign in as any account.</p>}
      <div className="mt-8 w-full space-y-3 border-t border-line pt-6 text-lg">
        <p>
          Family member?{' '}
          <Link to="/family" className="font-bold text-sky-deep underline underline-offset-4">Enter your invite code</Link>
        </p>
        <p className="text-muted">Patients: your nurse or mobility aide starts the bedside tablet for you.</p>
      </div>
    </section>
  );
}
