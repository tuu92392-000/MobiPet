// Impact panel for the pitch. The trend is SYNTHETIC and labeled as such; the ROI calculator is illustrative.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { BedDouble, Calculator, DollarSign, TrendingUp } from 'lucide-react';

// Single series: one hue (sky-deep, ≥3:1 on the white card). Text stays in ink tokens, never the series color.
const SERIES = '#245885';
const INK_MUTED = '#5C5852';
const GRID = '#E7E0D3';

/** Synthetic "% of shifts goal met" for the unit over the last 7 days. Not real data. */
const SYNTHETIC = [41, 44, 43, 50, 54, 57, 61];

function lastSevenDays(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  });
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { day: string; pct: number };
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2 text-sm shadow">
      <p className="font-bold">{p.day}</p>
      <p>{p.pct}% of shifts met goal</p>
      <p className="text-muted">Synthetic data</p>
    </div>
  );
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

function NumberField({ label, hint, value, step, min, max, prefix, onChange }: {
  label: string; hint?: string; value: number; step: number; min: number; max: number; prefix?: string; onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold">{label}</label>
      <div className="mt-1 flex items-center rounded-lg border-2 border-line bg-paper focus-within:border-sky-deep">
        {prefix && <span className="pl-3 text-muted" aria-hidden>{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
          className="min-h-tap w-full rounded-lg bg-transparent px-3 text-lg outline-none"
        />
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream p-3">
      <p className="flex items-center gap-1.5 text-sm text-muted">{icon} {label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
      <p className="text-sm text-muted">{sub}</p>
    </div>
  );
}

export function ImpactPanel() {
  const data = useMemo(() => lastSevenDays().map((day, i) => ({ day, pct: SYNTHETIC[i] })), []);
  const [patients, setPatients] = useState(30);
  const [losDays, setLosDays] = useState(0.5);
  const [costPerDay, setCostPerDay] = useState(3268);

  const bedDaysMonth = patients * losDays;
  const savedMonth = bedDaysMonth * costPerDay;

  return (
    <section aria-labelledby="impact-title" className="rounded-2xl border border-line bg-paper p-4">
      <h2 id="impact-title" className="font-display text-xl font-extrabold">Impact panel</h2>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <figure aria-labelledby="trend-title trend-note">
          <h3 id="trend-title" className="flex items-center gap-2 font-bold">
            <TrendingUp aria-hidden size={18} /> Unit: % of shifts where the mobility goal was met, last 7 days
          </h3>
          <p id="trend-note" className="text-sm text-muted">
            <span className="rounded bg-[#FBE3A2]/70 px-1.5 font-bold text-[#6B4500]">Synthetic data</span> for illustration only — not real patient outcomes.
          </p>
          <div className="mt-2 h-60" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 24, right: 28, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: INK_MUTED, fontSize: 13 }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: INK_MUTED, fontSize: 13 }} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: INK_MUTED, strokeDasharray: '3 3' }} />
                <Line
                  type="linear"
                  dataKey="pct"
                  stroke={SERIES}
                  strokeWidth={2}
                  dot={{ r: 4, fill: SERIES, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: SERIES, stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                >
                  {/* Direct labels on the first and last points only. */}
                  <LabelList
                    dataKey="pct"
                    content={({ x, y, value, index }) =>
                      // First label sits right of its point and last sits left, so neither collides with the axis.
                      index === 0 || index === data.length - 1 ? (
                        <text
                          x={Number(x) + (index === 0 ? 8 : -8)}
                          y={Number(y) - 12}
                          textAnchor={index === 0 ? 'start' : 'end'}
                          fill="#2B2A28"
                          fontSize={13}
                          fontWeight={700}
                        >
                          {value}%
                        </text>
                      ) : null
                    }
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-1 text-sm">
            <summary className="inline-flex min-h-tap cursor-pointer items-center font-bold text-sky-deep">Show as table</summary>
            <table className="mt-2 w-full text-left">
              <caption className="sr-only">Synthetic % of shifts goal met, last 7 days</caption>
              <thead>
                <tr className="border-b border-line"><th scope="col" className="py-1">Day</th><th scope="col">% of shifts goal met</th></tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.day} className="border-b border-line"><td className="py-1">{d.day}</td><td>{d.pct}%</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>

        <div>
          <h3 className="flex items-center gap-2 font-bold">
            <Calculator aria-hidden size={18} /> What a shorter stay could mean
          </h3>
          <p className="text-sm text-muted">Edit the assumptions. Results are an illustrative estimate, not a forecast.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <NumberField label="Patients per month" value={patients} step={1} min={0} max={5000} onChange={setPatients} />
            <NumberField label="Length-of-stay reduction (days)" value={losDays} step={0.1} min={0} max={10} onChange={setLosDays} />
            <NumberField
              label="Cost per inpatient day"
              hint="Default $3,268: 2024 average for Pennsylvania nonprofit hospitals (illustrative)."
              prefix="$"
              value={costPerDay}
              step={50}
              min={0}
              max={20000}
              onChange={setCostPerDay}
            />
          </div>
          <div aria-live="polite" className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile icon={<BedDouble aria-hidden size={16} />} label="Bed-days freed" value={num(bedDaysMonth * 12)} sub={`per year · ${num(bedDaysMonth)} per month`} />
            <Tile icon={<DollarSign aria-hidden size={16} />} label="Estimated expense avoided" value={money(savedMonth * 12)} sub={`per year · ${money(savedMonth)} per month`} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Bed-days freed = patients per month × days saved. Expense avoided = bed-days freed × cost per day. Assumes the reduction applies to every patient; real effects need a controlled pilot to measure.
          </p>
        </div>
      </div>
    </section>
  );
}
