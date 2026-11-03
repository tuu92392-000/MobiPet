import { ChevronRight, HelpCircle, Languages, UserRound } from 'lucide-react';
import type { BoardView } from '@shared/api';
import { isRestGoal, JHHLM } from '@shared/jhhlm';
import { StatusBadge } from './StatusBadge';
import { ago, clock } from './time';

export function UnitBoard({ board, onOpen }: { board: BoardView; onOpen: (id: string) => void }) {
  return (
    <section aria-labelledby="board-title" className="rounded-2xl border border-line bg-paper">
      <h2 id="board-title" className="px-4 pt-3 font-display text-lg font-extrabold">
        Unit board <span className="font-body text-sm font-normal text-muted">· sorted by who needs you first</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead className="border-y border-line bg-cream text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-2">Room</th>
              <th scope="col" className="px-2 py-2">Patient</th>
              <th scope="col" className="px-2 py-2">JH-HLM goal</th>
              <th scope="col" className="px-2 py-2">Highest this shift</th>
              <th scope="col" className="px-2 py-2">Progress</th>
              <th scope="col" className="px-2 py-2">Status</th>
              <th scope="col" className="px-2 py-2">Last activity</th>
              <th scope="col" className="px-2 py-2">Unconfirmed</th>
              <th scope="col" className="px-2 py-2"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {board.patients.map((p) => (
              <tr
                key={p.id}
                onClick={() => onOpen(p.id)}
                className={`cursor-pointer border-b border-line hover:bg-sky/20 ${p.status === 'needs-attention' ? 'bg-coral/10' : ''}`}
              >
                <td className="px-4 py-2.5 font-display text-base font-extrabold">{p.room}</td>
                <td className="px-2 py-2.5">
                  <span className="font-bold">{p.displayName}</span>
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {p.language === 'es' && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-line px-1 text-xs" title="Spanish">
                        <Languages aria-hidden size={12} /> ES
                      </span>
                    )}
                    {p.openQuestion && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-sky-deep px-1 text-xs text-sky-deep" title={p.openQuestion}>
                        <HelpCircle aria-hidden size={12} /> Question
                      </span>
                    )}
                    {p.clearance === 'needs-assist' && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-line px-1 text-xs">
                        <UserRound aria-hidden size={12} /> Assist
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  L{p.goal.level} {JHHLM[p.goal.level].nurse}
                  {!isRestGoal(p.goal) && <span className="text-muted"> × {p.goal.reps}</span>}
                </td>
                <td className="px-2 py-2.5">{p.highestLevelThisShift ? `L${p.highestLevelThisShift}` : <span className="text-muted">—</span>}</td>
                <td className="px-2 py-2.5">{isRestGoal(p.goal) ? <span className="text-muted">Rest</span> : `${p.progress}/${p.goal.reps}`}</td>
                <td className="px-2 py-2.5">
                  <StatusBadge status={p.status} />
                  <div className="mt-0.5 max-w-[16rem] truncate text-xs text-muted" title={p.statusReason}>{p.statusReason}</div>
                </td>
                <td className="px-2 py-2.5">
                  {p.lastActivityAt ? (
                    <>
                      {clock(p.lastActivityAt)}
                      <div className="text-xs text-muted">{ago(p.lastActivityAt, board.now)}</div>
                    </>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  {p.unconfirmedCount > 0 ? <span className="rounded-full bg-sky/50 px-2 py-0.5 font-bold">{p.unconfirmedCount}</span> : <span className="text-muted">0</span>}
                </td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p.id);
                    }}
                    aria-label={`Open details for Room ${p.room}, ${p.displayName}`}
                    className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-sky/40"
                  >
                    <ChevronRight aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
