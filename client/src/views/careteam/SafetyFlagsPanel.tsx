import { BellRing, CheckCircle2, Mail, MessageCircleWarning, ShieldAlert } from 'lucide-react';
import { flagSourceLabel, flagText } from '@shared/derive';
import type { FlagRow } from '../../store/careTeamStore';
import { clock } from './time';

interface Props {
  flags: FlagRow[];
  onAck: (flagId: string) => void;
  onOpen: (patientId: string) => void;
}

export function SafetyFlagsPanel({ flags, onAck, onOpen }: Props) {
  const open = flags.filter((f) => f.acknowledgedAt === null);
  const done = flags.filter((f) => f.acknowledgedAt !== null).slice(0, 5);
  return (
    <section aria-labelledby="flags-title" className="rounded-2xl border border-line bg-paper p-4">
      <h2 id="flags-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
        <ShieldAlert aria-hidden size={20} className="text-alert" /> Safety flags
        <span className={`rounded-full px-2 text-sm ${open.length ? 'bg-alert text-cream' : 'bg-line text-ink'}`}>{open.length} open</span>
      </h2>
      {open.length === 0 && <p className="mt-2 text-sm text-muted">No open safety flags.</p>}
      <ul className="mt-2 space-y-2">
        {[...open, ...done].map((f) => {
          const Src = f.source === 'chat' ? MessageCircleWarning : f.source === 'message' ? Mail : BellRing;
          const acked = f.acknowledgedAt !== null;
          return (
            <li key={f.id} className={`rounded-xl border p-2.5 text-sm ${acked ? 'border-line' : 'border-alert bg-coral/10'}`}>
              <div className="flex flex-wrap items-center gap-x-2">
                <Src aria-hidden size={16} />
                <button onClick={() => onOpen(f.patientId)} className="inline-flex min-h-tap items-center font-bold underline decoration-dotted underline-offset-2">
                  Room {f.room} · {f.name}
                </button>
                <span className="text-muted">{clock(f.at)} · {flagSourceLabel(f.source)}</span>
              </div>
              <p className="mt-1">{flagText(f)}{f.matched && <span className="text-muted"> (matched: {f.matched})</span>}</p>
              {acked ? (
                <p className="mt-1 flex items-center gap-1 text-sage-deep">
                  <CheckCircle2 aria-hidden size={16} /> Acknowledged {clock(f.acknowledgedAt!)}
                </p>
              ) : (
                <button onClick={() => onAck(f.id)} className="mt-2 min-h-tap rounded-full bg-alert px-4 font-bold text-cream">
                  Acknowledge
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
