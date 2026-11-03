// Care Team tab, for nurses and mobility aides. The toggle only changes the layout: both roles can use
// both views, and every view keeps the board, drawer, flags, AI logs, mute AI and notes to the patient.
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Footprints, Search } from 'lucide-react';
import { api } from '../../api/client';
import { useSession } from '../../auth/session';
import { useLiveRefresh } from '../../lib/live';
import { useCareTeamStore } from '../../store/careTeamStore';
import { AidWorklist } from './AidWorklist';
import { BenchmarkTable, UnitMetrics } from './Benchmarks';
import { MyNotes, MyNotesButton } from './MyNotes';
import { ExportButton, ExportDialog, ExportHistory, type ExportTarget } from './Exports';
import { PatientDrawer } from './PatientDrawer';
import { StaffMessages, StaffMessagesButton, useStaffThreads } from './StaffMessages';
import { SafetyFlagsPanel } from './SafetyFlagsPanel';
import { UnitBoard } from './UnitBoard';
import { UnitSummary } from './UnitSummary';
import { clock } from './time';

type Layout = 'aid' | 'nurse';

/** Remember the last-used view per user on this device. */
function useLayout(accountId: string, role: string): [Layout, (l: Layout) => void] {
  const key = `mobipet.careTeamView.${accountId}`;
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === 'aid' || saved === 'nurse') return saved;
    } catch {
      // Storage blocked: fall back to the role's natural view.
    }
    return role === 'mobility_aid' ? 'aid' : 'nurse';
  });
  const choose = (l: Layout) => {
    setLayout(l);
    try {
      window.localStorage.setItem(key, l);
    } catch {
      // Not remembered, still works.
    }
  };
  return [layout, choose];
}

export function CareTeam() {
  const me = useSession((s) => s.me);
  const accountId = me && !me.locked ? me.accountId : 'unknown';
  const [layout, setLayout] = useLayout(accountId, me?.role ?? 'nurse');
  const { board, unit, flags, benchmarks, error, refresh } = useCareTeamStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { threads, reload: reloadThreads } = useStaffThreads();
  const [messagesOpen, setMessagesOpen] = useState<string | null | false>(false);
  const unread = threads.reduce((n, t) => n + t.unread, 0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const patientOptions = (board?.patients ?? []).map(({ id, room, displayName }) => ({ id, room, displayName })).sort((x, y) => x.room.localeCompare(y.room));

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useLiveRefresh('*', () => void refresh());

  async function ack(flagId: string) {
    await api.post(`/flags/${flagId}/ack`);
    await refresh();
  }

  // Patient filter: room number or name, on both views.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!board) return new Set<string>();
    return new Set(board.patients.filter((p) => !q || p.room.includes(q) || p.displayName.toLowerCase().includes(q)).map((p) => p.id));
  }, [board, q]);
  const filteredBoard = board && { ...board, patients: board.patients.filter((p) => matches.has(p.id)) };
  const filteredFlags = flags.filter((f) => matches.has(f.patientId));

  const toggle = (l: Layout, label: string, Icon: typeof Footprints) => (
    <button
      aria-pressed={layout === l}
      onClick={() => setLayout(l)}
      className={`inline-flex min-h-[3.25rem] items-center gap-2 rounded-full px-5 font-display text-lg font-extrabold ${
        layout === l ? 'bg-sage-deep text-cream' : 'text-ink hover:bg-sage/30'
      }`}
    >
      <Icon aria-hidden size={20} /> {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[90rem] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Care Team · 4 West Step-Down</h1>
          {board && (
            <p className="text-sm text-muted">
              {clock(board.now)} · {board.shift.name} shift (ends {clock(board.shift.end)}) · {board.patients.length} patients
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StaffMessagesButton unread={unread} onOpen={() => setMessagesOpen(null)} />
          <MyNotesButton onOpen={() => setNotesOpen(true)} />
          <div role="group" aria-label="Care Team layout" className="flex rounded-full border-2 border-line bg-paper p-1">
            {toggle('aid', 'Mobility Aide view', Footprints)}
            {toggle('nurse', 'Nurse view', ClipboardList)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex max-w-md items-center gap-2 rounded-full border-2 border-line bg-paper px-4 focus-within:border-sky-deep">
        <Search aria-hidden size={18} className="text-muted" />
        <label htmlFor="patient-filter" className="sr-only">Filter patients by room or name</label>
        <input
          id="patient-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by room or name"
          className="min-h-tap w-full bg-transparent outline-none"
        />
      </div>

      {error && <p role="alert" className="mt-2 rounded-lg bg-coral/20 p-2 text-alert">Pip can’t reach the server: {error}</p>}
      {!board || !unit || !filteredBoard ? (
        !error && <p role="status" className="mt-4 text-muted">Loading the unit…</p>
      ) : layout === 'aid' ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <AidWorklist board={board} patients={filteredBoard.patients} onOpen={setOpenId} onChanged={refresh} />
          <div className="flex flex-col gap-4">
            <SafetyFlagsPanel flags={filteredFlags} onAck={ack} onOpen={setOpenId} />
            <UnitSummary facts={unit.facts} onOpen={setOpenId} />
          </div>
          <div className="lg:col-span-2">
            <UnitBoard board={filteredBoard} onOpen={setOpenId} />
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[3fr_2fr]">
          {/* Unit summary section: the AI summary (with data beside each claim) and the unit metrics. */}
          <UnitSummary facts={unit.facts} onOpen={setOpenId} />
          <div className="flex flex-col gap-4">
            {benchmarks && <UnitMetrics view={benchmarks} />}
            <SafetyFlagsPanel flags={filteredFlags} onAck={ack} onOpen={setOpenId} />
          </div>
          {benchmarks && (
            <div className="flex flex-col gap-2 lg:col-span-2">
              <div className="flex justify-end">
                <ExportButton label="Export unit data" onClick={() => setExporting({ scope: 'unit', label: 'unit' })} />
              </div>
              <BenchmarkTable
                view={benchmarks}
                ids={matches}
                onOpen={setOpenId}
                rowAction={(p) => <ExportButton small label="Export" onClick={() => setExporting({ scope: p.id, label: `Room ${p.room}` })} />}
              />
            </div>
          )}
          <div className="lg:col-span-2">
            <ExportHistory />
          </div>
          <div className="lg:col-span-2">
            <UnitBoard board={filteredBoard} onOpen={setOpenId} />
          </div>
        </div>
      )}
      <PatientDrawer
        patientId={openId}
        onClose={() => setOpenId(null)}
        onChanged={refresh}
        onMessage={(id) => {
          setOpenId(null);
          setMessagesOpen(`careteam:${id}`);
        }}
        onExport={(id, room) => setExporting({ scope: id, label: `Room ${room}` })}
      />
      <ExportDialog target={exporting} onClose={() => setExporting(null)} />
      <StaffMessages
        open={messagesOpen !== false}
        initialThread={messagesOpen || null}
        onClose={() => setMessagesOpen(false)}
        threads={threads}
        reload={reloadThreads}
        patients={patientOptions}
      />
      <MyNotes open={notesOpen} onClose={() => setNotesOpen(false)} patients={patientOptions} />
    </div>
  );
}
