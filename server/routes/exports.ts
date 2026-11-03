// Exports: staff only, every one logged (append-only; there is no route to change or delete the log).
import { Router } from 'express';
import type { ExportLogEntry, StaffRole } from '../../shared/types';
import { requireCan } from '../auth/middleware';
import { buildTables, dateTag, rowCount, toCsv, toXlsx, type ExportFormat } from '../exports';
import { findPatient, getDB, mutate, now } from '../store';
import { newId } from '../seed';

export const exportRoutes = Router();

exportRoutes.post('/exports', requireCan('export.create', () => null), (req, res) => {
  const format = req.body?.format as ExportFormat;
  const scope = String(req.body?.scope ?? '');
  if (format !== 'csv' && format !== 'xlsx') return res.status(400).json({ error: 'format must be csv or xlsx' });
  const patient = scope === 'unit' ? null : findPatient(scope);
  if (scope !== 'unit' && !patient) return res.status(400).json({ error: 'scope must be "unit" or a patient id' });

  const ids = patient ? [patient.id] : getDB().patients.map((p) => p.id);
  const tables = buildTables(ids);
  const scopeLabel = patient ? `Room ${patient.room}` : 'Unit';
  const filename = `mobipet_${patient ? `room${patient.room}` : 'unit'}_${dateTag(now())}.${format}`;
  const actor = req.actor!;

  (format === 'csv' ? Promise.resolve(Buffer.from(toCsv(tables), 'utf8')) : toXlsx(tables, scopeLabel))
    .then((file) => {
      const entry: ExportLogEntry = {
        id: newId('exp'), at: now(), accountId: actor.accountId, label: actor.label, role: actor.role as StaffRole,
        scope: patient ? patient.id : 'unit', scopeLabel, format, rowCount: rowCount(tables), filename,
      };
      mutate('export', null, (db) => db.exportLog.push(entry));
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Export-Rows', String(entry.rowCount));
      res.send(file);
    })
    .catch(() => res.status(500).json({ error: 'Could not build the export' }));
});

exportRoutes.get('/exports/log', requireCan('export.log.read', () => null), (_req, res) => {
  res.json([...getDB().exportLog].sort((a, b) => b.at - a.at));
});
