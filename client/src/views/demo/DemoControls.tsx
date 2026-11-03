// Presenter controls: simulated clock, one-click scenarios, reset, and the Impact panel.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Baby, BellRing, Clock, Download, ExternalLink, Footprints, Heart, Lock, Mail, RotateCcw, ThumbsUp, Trophy, Utensils } from 'lucide-react';
import type { ShiftInfo } from '@shared/types';
import { api, ApiError } from '../../api/client';
import { useLiveRefresh } from '../../lib/live';
import { ImpactPanel } from './ImpactPanel';
import { loadDemoAccounts, switchTo, type DemoAccounts } from './switcher';

const SHIFT_LABEL = { day: 'Day (7 AM–3 PM)', evening: 'Evening (3–11 PM)', night: 'Night (11 PM–7 AM)' } as const;

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const id = `demo-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-paper p-4">
      <h2 id={id} className="flex items-center gap-2 font-display text-lg font-extrabold">
        {icon} {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DemoControls() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<DemoAccounts | null>(null);
  const [clockNow, setClockNow] = useState<{ now: number; shift: ShiftInfo } | null>(null);
  const [patientId, setPatientId] = useState('p410');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    loadDemoAccounts().then(setAccounts).catch(() => undefined);
    api.get<{ now: number; shift: ShiftInfo }>('/clock').then(setClockNow).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useLiveRefresh('*', load);

  async function run(label: string, fn: () => Promise<{ message?: string; ok?: boolean } | unknown>) {
    setBusy(true);
    setStatus(null);
    try {
      const r = (await fn()) as { message?: string; ok?: boolean } | undefined;
      setStatus({ ok: r?.ok !== false, text: r?.message ?? `${label}: done` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof ApiError ? e.message : `${label} failed` });
    } finally {
      setBusy(false);
    }
  }

  const scenario = (path: string, label: string) => run(label, () => api.post(`/demo/scenarios/${path}`, { patientId }));
  const advance = (minutes: number) => run(`+${minutes} min`, async () => {
    const r = await api.post<{ now: number; shift: ShiftInfo }>('/demo/clock', { advanceMinutes: minutes });
    return { message: `Clock moved to ${new Date(r.now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (${r.shift.name} shift)` };
  });
  const jump = (shift: ShiftInfo['name']) => run(`Jump to ${shift}`, async () => {
    const r = await api.post<{ now: number; shift: ShiftInfo }>('/demo/clock', { shift });
    return { message: `Jumped to the start of the ${r.shift.name} shift — goals reset, journeys kept` };
  });

  const rooms = accounts ? [...accounts.patients].sort((a, b) => a.room.localeCompare(b.room)) : [];
  const selected = rooms.find((p) => p.patientId === patientId);
  const btn = 'inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-line bg-cream px-4 font-bold hover:bg-sky/30 disabled:opacity-50';

  return (
    <div className="mx-auto max-w-[90rem] p-4">
      <h1 className="font-display text-2xl font-extrabold">Demo controls</h1>
      <p className="text-muted">For presenting. Every action goes through the same API and guardrails as the real screens.</p>

      <p aria-live="polite" className={`mt-3 min-h-[2.5rem] rounded-lg px-3 py-2 ${status ? (status.ok ? 'bg-sage/40' : 'bg-coral/20 text-alert') : ''}`}>
        {status?.text}
      </p>

      <div className="mt-2 grid gap-4 lg:grid-cols-3">
        <Card title="Simulated clock" icon={<Clock aria-hidden size={20} />}>
          {clockNow && (
            <p className="text-2xl font-display font-extrabold">
              {new Date(clockNow.now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              <span className="ml-2 font-body text-base font-normal text-muted">{SHIFT_LABEL[clockNow.shift.name]}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {[15, 60, 120].map((m) => (
              <button key={m} disabled={busy} onClick={() => void advance(m)} className={btn}>
                +{m < 60 ? `${m} min` : `${m / 60} h`}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm font-bold">Jump to the next shift start</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['day', 'evening', 'night'] as const).map((s) => (
              <button key={s} disabled={busy} onClick={() => void jump(s)} className={btn}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Time only moves forward. Use Reset to return to 1:30 PM.</p>
        </Card>

        <Card title="Scenarios" icon={<Trophy aria-hidden size={20} />}>
          <label htmlFor="scenario-patient" className="text-sm font-bold">Patient</label>
          <select
            id="scenario-patient"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border-2 border-line bg-paper px-2"
          >
            {rooms.map((p) => (
              <option key={p.patientId} value={p.patientId}>
                Room {p.room} · {p.name}{p.pet ? ` · ${p.pet.name}` : ' · new admission'}
              </option>
            ))}
          </select>
          <div className="mt-3 grid gap-2">
            <button disabled={busy} onClick={() => void scenario('meet-goal', 'Meet goal')} className={btn}>
              <Trophy aria-hidden size={18} /> Patient meets goal
            </button>
            <button disabled={busy} onClick={() => void scenario('dizziness', 'Dizziness')} className={btn}>
              <BellRing aria-hidden size={18} /> Patient reports dizziness
            </button>
            <button disabled={busy} onClick={() => void scenario('family-cheer', 'Family cheer')} className={btn}>
              <Heart aria-hidden size={18} /> Family sends cheer
            </button>
            <button disabled={busy} onClick={() => void scenario('aid-check-off', 'Aide check-off')} className={btn}>
              <Footprints aria-hidden size={18} /> Aide checks off a walk
            </button>
            <button disabled={busy} onClick={() => void scenario('dizzy-message', 'Dizzy message')} className={btn}>
              <Mail aria-hidden size={18} /> Patient tells family they feel dizzy (flag)
            </button>
            <button disabled={busy} onClick={() => void scenario('buddy-cheer', 'Buddy cheer')} className={btn}>
              <ThumbsUp aria-hidden size={18} /> Buddy cheer
            </button>
            <button disabled={busy} onClick={() => void scenario('nurse-export', 'Export')} className={btn}>
              <Download aria-hidden size={18} /> Nurse exports unit data
            </button>
            <button disabled={busy} onClick={() => void scenario('lock-tablet', 'Lock tablet')} className={btn}>
              <Lock aria-hidden size={18} /> Welcome back after lock
            </button>
            <button disabled={busy} onClick={() => void scenario('meal', 'Meal nudge')} className={btn}>
              <Utensils aria-hidden size={18} /> Lunch tray collected (nudge)
            </button>
            <button
              disabled={busy}
              onClick={() => void run('New admission', async () => {
                await api.post('/demo/scenarios/new-admission');
                navigate(await switchTo('patient-p420'));
                return { message: 'Room 420 admitted — pick a companion' };
              })}
              className={btn}
            >
              <Baby aria-hidden size={18} /> New admission picks a pet
            </button>
          </div>
        </Card>

        <Card title="Open views" icon={<ExternalLink aria-hidden size={20} />}>
          <p className="text-sm text-muted">Open side by side to show live updates.</p>
          <ul className="mt-2 grid gap-2">
            <li>
              <Link to={`/demo/as/patient-${patientId}`} target="_blank" rel="noreferrer" className={btn}>
                <ExternalLink aria-hidden size={16} /> {selected ? `Room ${selected.room} tablet` : 'Patient tablet'}
                <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </li>
            <li>
              <Link to="/demo/as/nurse1" target="_blank" rel="noreferrer" className={btn}>
                <ExternalLink aria-hidden size={16} /> Care Team (Nurse 1) <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </li>
            <li>
              <Link to={`/demo/as/family-${patientId}`} target="_blank" rel="noreferrer" className={btn}>
                <ExternalLink aria-hidden size={16} /> Family view <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </li>
          </ul>
          <div className="mt-4 border-t border-line pt-3">
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm('Reset all demo data to the starting seed? This clears every change, chat, and the AI log.')) {
                  void run('Reset', async () => {
                    await api.post('/demo/reset');
                    return { message: 'Demo reset to 1:30 PM with the original 10 patients' };
                  });
                }
              }}
              className="inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-alert px-4 font-bold text-alert disabled:opacity-50"
            >
              <RotateCcw aria-hidden size={18} /> Reset demo data
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <ImpactPanel />
      </div>
    </div>
  );
}
