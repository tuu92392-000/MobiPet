// Exports for the Nurse view: unit or one patient, CSV or Excel. Mobility data only, and every
// export is recorded in the append-only export history.
import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, History, X } from 'lucide-react';
import type { ExportLogEntry } from '@shared/types';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useLiveRefresh } from '../../lib/live';
import { formatWhen } from '../../messages/Conversation';

export interface ExportTarget {
  scope: string;
  label: string;
}

export function ExportButton({ label, onClick, small }: { label: string; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-tap items-center gap-1.5 rounded-full border-2 border-sage-deep font-bold text-sage-deep hover:bg-sage/30 ${small ? 'px-3 text-sm' : 'px-4'}`}
    >
      <Download aria-hidden size={16} /> {label}
    </button>
  );
}

/** Choose CSV or Excel, then download. */
export function ExportDialog({ target, onClose }: { target: ExportTarget | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => setResult(''), [target]);

  async function run(format: 'csv' | 'xlsx') {
    if (!target) return;
    setBusy(true);
    setResult('');
    try {
      const r = await api.download('/exports', { scope: target.scope, format });
      setResult(`Downloaded ${r.filename} (${r.rows} rows). Logged in Export history.`);
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const option = 'flex min-h-[4rem] flex-1 items-center justify-center gap-2 rounded-2xl border-4 border-line bg-paper px-4 text-lg font-bold hover:border-sage-deep disabled:opacity-50';

  return (
    <Modal open={target !== null} onClose={onClose} labelledBy="export-title" describedBy="export-desc">
      {target && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-2">
            <h2 id="export-title" className="font-display text-2xl font-extrabold">Export {target.label} mobility data</h2>
            <button onClick={onClose} aria-label="Close" className="flex min-h-tap min-w-tap items-center justify-center rounded-full hover:bg-line/50">
              <X aria-hidden />
            </button>
          </div>
          <p id="export-desc" className="mt-2 text-muted">
            Activity logs (self-reported or confirmed, and by whom), goals over time and shift results. Messages, notes, AI chat and safety-flag text are never included. Files are labeled synthetic demo data, and this export is recorded with your name and role.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => void run('csv')} className={option}>
              <FileText aria-hidden /> CSV
            </button>
            <button disabled={busy} onClick={() => void run('xlsx')} className={option}>
              <FileSpreadsheet aria-hidden /> Excel (.xlsx)
            </button>
          </div>
          <p role="status" className="mt-3 min-h-[1.5rem] font-bold text-sage-deep">{busy ? 'Preparing file…' : result}</p>
        </div>
      )}
    </Modal>
  );
}

/** Append-only: the UI has no way to change or remove an entry, and neither does the server. */
export function ExportHistory() {
  const [log, setLog] = useState<ExportLogEntry[] | null>(null);
  const load = useCallback(() => void api.get<ExportLogEntry[]>('/exports/log').then(setLog).catch(() => undefined), []);
  useEffect(load, [load]);
  useLiveRefresh('*', load);
  const now = Date.now();
  return (
    <section aria-labelledby="export-history-title" className="rounded-2xl border border-line bg-paper p-4">
      <h2 id="export-history-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
        <History aria-hidden size={20} /> Export history
      </h2>
      {!log ? (
        <p className="text-muted">Loading…</p>
      ) : log.length === 0 ? (
        <p className="text-muted">No exports yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-1 pr-2">When</th>
                <th scope="col" className="py-1 pr-2">Who</th>
                <th scope="col" className="py-1 pr-2">Scope</th>
                <th scope="col" className="py-1 pr-2">Format</th>
                <th scope="col" className="py-1 pr-2">Rows</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 12).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1.5 pr-2">{formatWhen(e.at, now)}</td>
                  <td className="py-1.5 pr-2">{e.label} <span className="text-muted">({e.role === 'nurse' ? 'Nurse' : 'Mobility aid'})</span></td>
                  <td className="py-1.5 pr-2">{e.scopeLabel}</td>
                  <td className="py-1.5 pr-2">{e.format === 'xlsx' ? 'Excel' : 'CSV'}</td>
                  <td className="py-1.5 pr-2">{e.rowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
