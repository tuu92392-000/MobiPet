// Nurse view: unit metrics and the per-patient benchmark table. Every number here is computed on the
// server from logs and goal history (shared/benchmarks.ts), using the counting rules shown in the footnote.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { BenchmarksView } from '@shared/api';
import type { PatientBenchmark, Trend } from '@shared/benchmarks';
import { JHHLM } from '@shared/jhhlm';
import { clock } from './time';

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream p-3">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="font-display text-3xl font-extrabold">{value}</p>
      {detail && <p className="text-sm text-muted">{detail}</p>}
    </div>
  );
}

const pctText = (v: number | null) => (v === null ? '—' : `${v}%`);

export function UnitMetrics({ view }: { view: BenchmarksView }) {
  const m = view.metrics;
  return (
    <section aria-labelledby="metrics-title" className="rounded-2xl border border-line bg-paper p-4">
      <h2 id="metrics-title" className="font-display text-lg font-extrabold">Unit metrics</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Metric label="Goal met today" value={pctText(m.pctMetToday)} detail={`of ${m.shiftsToday} patient-shifts counted`} />
        <Metric label="Goal met, last 7 days" value={pctText(m.pctMet7d)} detail={`of ${m.shifts7d} patient-shifts`} />
        <Metric label="Patients behind" value={m.patientsBehind} detail="on this shift’s goal" />
        <Metric label="Open safety flags" value={m.openFlags} />
        <Metric label="Unconfirmed self-reports" value={m.unconfirmedReports} />
        <Metric label="Unit average" value={pctText(m.pctMetUnit)} detail="goal met, since admission" />
      </div>
    </section>
  );
}

const TREND: Record<Trend, { label: string; Icon: typeof TrendingUp }> = {
  improving: { label: 'Improving', Icon: TrendingUp },
  steady: { label: 'Steady', Icon: Minus },
  declining: { label: 'Declining', Icon: TrendingDown },
  'too-early': { label: 'Too early to tell', Icon: Minus },
};

/** Highest JH-HLM level per day since admission. Always paired with a text label. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const w = 84;
  const h = 26;
  const pts = values.map((v, i) => (v === null ? null : [values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 6) + 3, h - 3 - ((v - 1) / 7) * (h - 6)] as const));
  const path = pts.reduce((d, p, i) => (p ? `${d}${d && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} ` : d), '');
  const last = [...pts].reverse().find(Boolean);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="currentColor" strokeOpacity="0.15" />
      <path d={path} fill="none" stroke="rgb(var(--sky-deep))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="rgb(var(--sky-deep))" />}
    </svg>
  );
}

type SortKey = 'room' | 'goal' | 'highest' | 'pctMet' | 'trend' | 'vsUnit' | 'days' | 'last';

const TREND_RANK: Record<Trend, number> = { declining: 0, steady: 1, 'too-early': 2, improving: 3 };
const UNIT_RANK = { below: 0, at: 1, above: 2 } as const;

function sortValue(p: PatientBenchmark, key: SortKey): number | string {
  switch (key) {
    case 'room': return p.room;
    case 'goal': return p.goal.level * 10 + p.goal.reps;
    case 'highest': return p.highestThisShift ?? 0;
    case 'pctMet': return p.pctMet ?? -1;
    case 'trend': return TREND_RANK[p.trend];
    case 'vsUnit': return p.vsUnit ? UNIT_RANK[p.vsUnit] : -1;
    case 'days': return p.daysSinceAdmission;
    case 'last': return p.lastActivityAt ?? 0;
  }
}

interface TableProps {
  view: BenchmarksView;
  /** Patients to show (the Care Team filter). */
  ids: Set<string>;
  onOpen: (id: string) => void;
  /** Per-row action, e.g. export. */
  rowAction?: (p: PatientBenchmark) => ReactNode;
}

export function BenchmarkTable({ view, ids, onOpen, rowAction }: TableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'room', dir: 1 });
  const unit = view.metrics.pctMetUnit;
  const rows = view.patients
    .filter((p) => ids.has(p.id))
    .sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.room.localeCompare(b.room);
    });

  const header = (key: SortKey, label: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className="px-2 py-1">
        <button
          onClick={() => setSort({ key, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })}
          className="inline-flex min-h-tap items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-ink"
        >
          {label} <Icon aria-hidden size={14} />
        </button>
      </th>
    );
  };

  return (
    <section aria-labelledby="bench-title" className="rounded-2xl border border-line bg-paper">
      <h2 id="bench-title" className="px-4 pt-3 font-display text-lg font-extrabold">
        Patient benchmarks <span className="font-body text-sm font-normal text-muted">· select a column to sort</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[64rem] border-collapse text-left text-sm">
          <thead className="border-y border-line bg-cream text-xs text-muted">
            <tr>
              {header('room', 'Room')}
              {header('goal', 'JH-HLM goal')}
              {header('highest', 'Highest this shift')}
              {header('pctMet', 'Shifts goal met')}
              {header('trend', 'Trend since admission')}
              {header('vsUnit', 'Vs. unit average')}
              {header('days', 'Days in')}
              {header('last', 'Last activity')}
              <th scope="col" className="px-2 py-1"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const tr = TREND[p.trend];
              return (
                <tr key={p.id} className="border-b border-line">
                  <th scope="row" className="whitespace-nowrap px-2 py-2 text-left">
                    <button onClick={() => onOpen(p.id)} className="inline-flex min-h-tap items-center gap-1 font-bold underline decoration-dotted underline-offset-2">
                      <span className="font-display text-base font-extrabold">{p.room}</span> · {p.displayName}
                    </button>
                  </th>
                  <td className="px-2 py-2">{p.restGoal ? 'Rest' : `L${p.goal.level} ${JHHLM[p.goal.level].nurse} × ${p.goal.reps}`}</td>
                  <td className="px-2 py-2">{p.highestThisShift ? `L${p.highestThisShift} ${JHHLM[p.highestThisShift].nurse}` : <span className="text-muted">None yet</span>}</td>
                  <td className="px-2 py-2">
                    {p.pctMet === null ? <span className="text-muted">{p.restGoal ? 'Rest goal' : 'None counted yet'}</span> : (
                      <>
                        <span className="font-bold">{p.pctMet}%</span> <span className="text-muted">of {p.shiftsCounted}</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2" title={`Highest level by day: ${p.dailyHighest.map((v) => v ?? '–').join(', ')}`}>
                      <Sparkline values={p.dailyHighest} />
                      <span className="inline-flex items-center gap-1 font-bold">
                        <tr.Icon aria-hidden size={14} /> {tr.label}
                      </span>
                      <span className="sr-only">. Highest level by day: {p.dailyHighest.map((v) => v ?? 'none').join(', ')}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {p.vsUnit === null ? <span className="text-muted">—</span> : (
                      <>
                        <span className="font-bold capitalize">{p.vsUnit}</span> <span className="text-muted">({p.pctMet}% vs {unit}%)</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2">{p.daysSinceAdmission}</td>
                  <td className="px-2 py-2">{p.lastActivityAt ? clock(p.lastActivityAt) : <span className="text-muted">None</span>}</td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1">
                      {rowAction?.(p)}
                      <button onClick={() => onOpen(p.id)} aria-label={`Open details for Room ${p.room}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-sky/20">
                        <ChevronRight aria-hidden size={18} />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-xs text-muted">
        Counted: day and evening shifts since admission with a mobility goal (rest goals and nights are not counted). The current shift counts once its goal is met. Trend uses each completed day’s highest JH-HLM level, then the goal-met rate.
      </p>
    </section>
  );
}
