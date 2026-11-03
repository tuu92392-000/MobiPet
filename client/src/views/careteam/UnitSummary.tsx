// Shift briefing. In AI mode the model rewrites verified facts; every bullet cites facts and shows their data.
// Bullets with numbers that do not appear in the cited facts are dropped on the server before they get here.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, ClipboardList, Clock, FileText, Info, RefreshCw } from 'lucide-react';
import type { UnitFact } from '@shared/unitFacts';
import { api } from '../../api/client';
import { clock } from './time';

interface Summary {
  bullets: { text: string; factIds: string[] }[];
  mode: 'ai' | 'template';
  guardrail: string | null;
  generatedAt: number;
  facts: UnitFact[];
}

const ICON = { high: AlertTriangle, medium: Clock, info: Info } as const;
const SEVERITY_LABEL = { high: 'Urgent', medium: 'Follow up', info: 'FYI' } as const;
const RANK = { high: 0, medium: 1, info: 2 } as const;

interface Props {
  /** Live facts, used to show current data and to notice when the summary is out of date. */
  facts: UnitFact[];
  onOpen: (patientId: string) => void;
}

export function UnitSummary({ facts, onOpen }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async () => {
    setBusy(true);
    try {
      setSummary(await api.post<Summary>('/unit/summary'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void regenerate();
  }, [regenerate]);

  const live = new Map(facts.map((f) => [f.id, f]));
  const snapshot = new Map((summary?.facts ?? []).map((f) => [f.id, f]));
  const changed = summary !== null && (facts.length !== summary.facts.length || facts.some((f) => snapshot.get(f.id)?.text !== f.text));
  const covered = new Set(summary?.bullets.flatMap((b) => b.factIds) ?? []);
  const uncovered = facts.filter((f) => !covered.has(f.id)).length;

  return (
    <section aria-labelledby="summary-title" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="summary-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
          <ClipboardList aria-hidden size={20} /> Unit summary
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {summary && (
            <span className="inline-flex items-center gap-1">
              {summary.mode === 'ai' ? <Bot aria-hidden size={14} /> : <FileText aria-hidden size={14} />}
              {summary.mode === 'ai' ? 'AI-written from unit data' : 'Built from unit data'} · {clock(summary.generatedAt)}
            </span>
          )}
          <button
            onClick={() => void regenerate()}
            disabled={busy}
            className="inline-flex min-h-tap items-center gap-1.5 rounded-full border-2 border-line px-3 font-bold text-ink hover:bg-sky/30 disabled:opacity-60"
          >
            <RefreshCw aria-hidden size={16} className={busy ? 'animate-spin' : ''} /> Regenerate
          </button>
        </div>
      </div>

      {changed && (
        <p className="mt-2 rounded-lg bg-[#FBE3A2]/60 px-3 py-1.5 text-sm text-[#6B4500]">Unit data has changed since this summary. Regenerate for the latest.</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-alert">Couldn’t build the summary: {error}</p>}
      {!summary && !error && <p role="status" className="mt-3 text-muted">Building the summary…</p>}

      {summary && summary.bullets.length === 0 && <p className="mt-3 text-muted">Quiet unit — nothing needs follow-up right now.</p>}
      {summary && summary.bullets.length > 0 && (
        <ul className="mt-3 space-y-2">
          {summary.bullets.map((b) => {
            const cited = b.factIds.map((id) => snapshot.get(id)).filter((f): f is UnitFact => !!f);
            const severity = cited.reduce<UnitFact['severity']>((s, f) => (RANK[f.severity] < RANK[s] ? f.severity : s), 'info');
            const Icon = ICON[severity];
            return (
              <li key={b.text} className={`rounded-xl border p-2.5 ${severity === 'high' ? 'border-alert/60 bg-coral/10' : 'border-line'}`}>
                <div className="flex gap-2">
                  <Icon aria-hidden size={18} className={`mt-0.5 shrink-0 ${severity === 'high' ? 'text-alert' : 'text-muted'}`} />
                  <p>
                    <span className="sr-only">{SEVERITY_LABEL[severity]}: </span>
                    {b.text}
                  </p>
                </div>
                <details className="ml-6 mt-1 text-sm">
                  <summary className="inline-flex min-h-tap cursor-pointer items-center font-bold text-sky-deep">Show data ({cited.reduce((n, f) => n + f.evidence.length, 0)})</summary>
                  {cited.map((f) => {
                    const now = live.get(f.id);
                    return (
                      <div key={f.id} className="mt-1">
                        <p className="text-muted">
                          Source fact: {f.text}
                          {!now && <span className="ml-1 font-bold text-sage-deep">(resolved since this summary)</span>}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {f.evidence.map((e) => (
                            <li key={e.patientId + e.detail} className="flex flex-wrap items-center gap-x-2">
                              <button onClick={() => onOpen(e.patientId)} className="inline-flex min-h-tap items-center font-bold underline decoration-dotted underline-offset-2">
                                Room {e.room} · {e.name}
                              </button>
                              <span className="text-muted">{e.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {summary && uncovered > 0 && <p className="mt-2 text-sm text-muted">+{uncovered} more {uncovered === 1 ? 'item' : 'items'} on the board below.</p>}
    </section>
  );
}
