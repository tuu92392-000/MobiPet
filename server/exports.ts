// Mobility data exports (CSV and Excel), built on the server after a permission check.
// Mobility data only: never messages, notes, AI chat logs, or safety-flag text.
import ExcelJS from 'exceljs';
import type { ActivityLog, Patient } from '../shared/types';
import { shiftResults } from '../shared/benchmarks';
import { JHHLM } from '../shared/jhhlm';
import { getDB, now } from './store';

export const SYNTHETIC_LABEL = 'SYNTHETIC DEMO DATA — MobiPet';

export type ExportFormat = 'csv' | 'xlsx';

interface Tables {
  patients: (string | number)[][];
  activity: (string | number)[][];
  goals: (string | number)[][];
  shifts: (string | number)[][];
}

const HEADERS = {
  patients: ['patient_id', 'room', 'patient', 'admission_date'],
  activity: ['patient_id', 'room', 'patient', 'timestamp', 'jhhlm_level', 'activity', 'self_reported_or_confirmed', 'logged_by_role', 'logged_by', 'confirmed_by_role', 'confirmed_by'],
  goals: ['patient_id', 'room', 'patient', 'set_at', 'jhhlm_goal_level', 'goal', 'times_per_shift', 'set_by'],
  shifts: ['patient_id', 'room', 'patient', 'shift', 'shift_start', 'goal_level', 'times_per_shift', 'times_done', 'goal_met'],
} as const;

const ROLE = { nurse: 'Nurse', mobility_aid: 'Mobility aid' } as const;

/** Local date and time, unambiguous and sortable. */
function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function dateTag(t: number): string {
  return stamp(t).slice(0, 10);
}

function status(l: ActivityLog): string {
  if (l.status === 'rejected') return 'Rejected by staff';
  if (l.source === 'staff') return 'Confirmed (logged by staff)';
  return l.status === 'confirmed' ? 'Confirmed' : 'Self-reported (not yet confirmed)';
}

export function buildTables(patientIds: string[]): Tables {
  const db = getDB();
  const t = now();
  const chosen = db.patients.filter((p) => patientIds.includes(p.id)).sort((a, b) => a.room.localeCompare(b.room));
  const who = (p: Patient) => [p.id, p.room, `${p.firstName} ${p.lastInitial}.`];
  return {
    patients: chosen.map((p) => [...who(p), dateTag(p.admittedAt)]),
    activity: chosen.flatMap((p) =>
      db.logs
        .filter((l) => l.patientId === p.id && l.at <= t)
        .sort((a, b) => a.at - b.at)
        .map((l) => [
          ...who(p),
          stamp(l.at),
          l.level,
          JHHLM[l.level].nurse,
          status(l),
          l.loggedBy ? ROLE[l.loggedBy.role] : l.source === 'patient' ? 'Patient' : l.source === 'family-visit' ? 'Family (visit)' : '',
          l.loggedBy?.label ?? '',
          l.reviewedBy ? ROLE[l.reviewedBy.role] : '',
          l.reviewedBy?.label ?? '',
        ]),
    ),
    goals: chosen.flatMap((p) =>
      (p.goalHistory?.length ? p.goalHistory : [p.goal]).map((g) => [...who(p), stamp(g.setAt), g.level, JHHLM[g.level].nurse, g.reps, g.setBy]),
    ),
    shifts: chosen.flatMap((p) =>
      shiftResults(p, db.logs, t).map((r) => [...who(p), r.shiftId, stamp(r.start), r.goal.level, r.goal.reps, r.done, r.met ? 'Yes' : 'No']),
    ),
  };
}

export const rowCount = (tables: Tables) => tables.patients.length + tables.activity.length + tables.goals.length + tables.shifts.length;

function csvCell(v: string | number): string {
  const s = String(v);
  // Quote anything with a delimiter, and neutralize spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One table with a record_type column, under a first row that labels the data as synthetic. */
export function toCsv(tables: Tables): string {
  const columns = ['record_type', 'patient_id', 'room', 'patient', 'admission_date', 'timestamp', 'jhhlm_level', 'activity_or_goal', 'self_reported_or_confirmed', 'logged_by_role', 'logged_by', 'confirmed_by_role', 'confirmed_by', 'times_per_shift', 'set_by', 'shift', 'times_done', 'goal_met'];
  const row = (values: Partial<Record<(typeof columns)[number], string | number>>) => columns.map((c) => csvCell(values[c] ?? '')).join(',');
  const lines = [csvCell(SYNTHETIC_LABEL), columns.join(',')];
  for (const [id, room, patient, admission] of tables.patients) lines.push(row({ record_type: 'patient', patient_id: id, room, patient, admission_date: admission }));
  for (const [id, room, patient, ts, level, activity, st, lr, lb, cr, cb] of tables.activity) {
    lines.push(row({ record_type: 'activity', patient_id: id, room, patient, timestamp: ts, jhhlm_level: level, activity_or_goal: activity, self_reported_or_confirmed: st, logged_by_role: lr, logged_by: lb, confirmed_by_role: cr, confirmed_by: cb }));
  }
  for (const [id, room, patient, ts, level, goal, reps, by] of tables.goals) {
    lines.push(row({ record_type: 'goal', patient_id: id, room, patient, timestamp: ts, jhhlm_level: level, activity_or_goal: goal, times_per_shift: reps, set_by: by }));
  }
  for (const [id, room, patient, shift, start, level, reps, done, met] of tables.shifts) {
    lines.push(row({ record_type: 'shift_result', patient_id: id, room, patient, timestamp: start, jhhlm_level: level, times_per_shift: reps, shift, times_done: done, goal_met: met }));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function toXlsx(tables: Tables, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MobiPet (synthetic demo)';
  wb.title = `${SYNTHETIC_LABEL} — ${title}`;
  const sheets: [string, keyof Tables][] = [['Patients', 'patients'], ['Activity log', 'activity'], ['Goals over time', 'goals'], ['Shift results', 'shifts']];
  for (const [name, key] of sheets) {
    const ws = wb.addWorksheet(name);
    const headers = HEADERS[key];
    // Header note on every sheet, so a copied sheet still says the data is synthetic.
    ws.addRow([`${SYNTHETIC_LABEL} · ${title} · exported ${stamp(now())}`]);
    ws.mergeCells(1, 1, 1, headers.length);
    ws.getRow(1).font = { bold: true, color: { argb: 'FF8A1C00' } };
    ws.addRow([...headers]).font = { bold: true };
    tables[key].forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 18));
    ws.views = [{ state: 'frozen', ySplit: 2 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
