import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Bot, FileText, LogOut, RotateCcw } from 'lucide-react';
import type { Role } from '@shared/types';
import { api } from './api/client';
import { LiveBadge } from './components/LiveBadge';
import { useLiveStatus } from './lib/live';
import { DemoControls } from './views/demo/DemoControls';
import { PetSvg } from './pets/PetSvg';
import { CareTeam } from './views/careteam/CareTeam';
import { useSession, isStaffRole } from './auth/session';
import { SignIn } from './views/auth/SignIn';
import { Bedside } from './views/auth/Bedside';
import { DemoSignInAs, DemoSwitcher } from './views/demo/DemoSwitcher';
import { DEMO_BUILD } from './config/build';
import { FamilyHome } from './family/FamilyHome';
import { FamilyJoin } from './family/FamilyJoin';

/** Where each role lands after signing in. */
function Home() {
  const me = useSession((s) => s.me);
  if (!me) return <Navigate to="/sign-in" replace />;
  if (me.locked || me.role === 'patient') return <Navigate to="/bedside" replace />;
  if (me.role === 'family') return <Navigate to="/family/home" replace />;
  return <Navigate to="/care-team" replace />;
}

/** The UI mirrors server permissions; the server enforces them regardless. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const me = useSession((s) => s.me);
  if (!me || me.locked || !roles.includes(me.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Browser-only demo: put this device back to the starting data and sign out. */
function ResetDemo() {
  const signOut = useSession((s) => s.signOut);
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        if (!window.confirm('Reset the demo? Your changes on this device will be cleared and everyone signed out.')) return;
        void api
          .post('/demo/reset')
          .catch(() => undefined)
          .then(() => signOut())
          .then(() => navigate('/sign-in'));
      }}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-full border-2 border-alert px-3 text-sm font-bold text-alert hover:bg-coral/20"
    >
      <RotateCcw aria-hidden size={16} /> Reset demo
    </button>
  );
}

function Account() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const navigate = useNavigate();
  // The bedside patient never signs out; staff end the session from Care Team.
  if (!me || me.locked || me.role === 'patient') return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm font-bold">{me.label}</span>
      <button
        onClick={() => void signOut().then(() => navigate('/sign-in'))}
        className="inline-flex min-h-tap items-center gap-1.5 rounded-full border-2 border-line px-3 text-sm font-bold hover:bg-line/40"
      >
        <LogOut aria-hidden size={16} /> Sign out
      </button>
    </span>
  );
}

function ModeBadge() {
  const [mode, setMode] = useState<'ai' | 'template' | null>(null);
  const live = useLiveStatus((s) => s.status === 'live');
  // Re-check whenever the live connection (re)opens, e.g. after a server restart.
  useEffect(() => {
    api.get<{ aiMode: 'ai' | 'template' }>('/health').then((h) => setMode(h.aiMode)).catch(() => setMode(null));
  }, [live]);
  if (!mode) return <span className="text-sm text-muted">Server offline</span>;
  const Icon = mode === 'ai' ? Bot : FileText;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-sm">
      <Icon size={16} aria-hidden />
      {mode === 'ai' ? 'AI mode' : 'Template mode'}
    </span>
  );
}

function NotFound() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center p-8 text-center">
      <PetSvg species="nimbus" palette={2} mood="curious" label="" className="h-40 w-40" />
      <h1 className="mt-2 font-display text-3xl font-extrabold">Pip can’t find that page</h1>
      <p className="mt-2 text-lg text-muted">It may have wandered off the path. Let’s head back.</p>
      <Link to="/" className="mt-4 inline-flex min-h-tap items-center rounded-full bg-sage-deep px-8 text-lg font-bold text-cream">
        Back to MobiPet
      </Link>
    </section>
  );
}

export default function App() {
  const { ready, me, config, restore } = useSession();
  useEffect(() => {
    void restore();
  }, [restore]);
  const staff = !!me && !me.locked && isStaffRole(me.role);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-bold focus:text-cream"
      >
        Skip to main content
      </a>
      <header>
        <div role="note" className="bg-ink px-4 py-1 text-center text-sm text-cream">
          {DEMO_BUILD ? 'Interactive demo — fictional data. Your changes stay on your device.' : 'Demo — all patients are fictional.'}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
          <span className="inline-flex items-center gap-1.5 font-display text-xl font-extrabold">
            <PetSvg species="nimbus" palette={0} mood="happy" label="" className="h-9 w-9" />
            MobiPet
          </span>
          {staff && (
            <nav aria-label="Main" className="flex flex-wrap gap-1">
              <NavLink
                to="/care-team"
                className={({ isActive }) =>
                  `inline-flex min-h-tap items-center rounded-full px-4 font-display font-bold ${
                    isActive ? 'bg-sage-deep text-cream' : 'text-ink hover:bg-sage/40'
                  }`
                }
              >
                Care Team
              </NavLink>
            </nav>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {me && <LiveBadge />}
            <ModeBadge />
            <Account />
            {config.demoSwitcher && <DemoSwitcher />}
            {DEMO_BUILD && <ResetDemo />}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        {!ready ? (
          <p role="status" className="p-8 text-center text-xl">Pip is waking up…</p>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/sign-in" element={me && !me.locked ? <Navigate to="/" replace /> : <SignIn />} />
            <Route path="/bedside" element={<Bedside />} />
            <Route path="/care-team" element={<RequireRole roles={['nurse', 'mobility_aid']}><CareTeam /></RequireRole>} />
            <Route path="/family" element={me?.role === 'family' && !me.locked ? <Navigate to="/family/home" replace /> : <FamilyJoin />} />
            <Route path="/family/home" element={<RequireRole roles={['family']}><FamilyHome /></RequireRole>} />
            {config.demoSwitcher && <Route path="/demo" element={<DemoControls />} />}
            {config.demoSwitcher && <Route path="/demo/as/:who" element={<DemoSignInAs />} />}
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
