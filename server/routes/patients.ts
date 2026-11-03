import { Router, type Response } from 'express';
import type { AccessoryId, Level, Patient, PatientSettings, PetChoice } from '../../shared/types';
import { allowedActivityLevels, requiresAssistGate } from '../../shared/jhhlm';
import { ACCESSORIES } from '../../shared/progression';
import { recordActivity } from '../activity';
import { findPatient, getDB, mutate, now } from '../store';
import { newId } from '../seed';
import { benchmarksView, boardView, patientView, unitView } from '../views';
import { requireCan } from '../auth/middleware';
import { staffRef } from '../auth/permissions';

export const patients = Router();

function withPatient(id: string, res: Response): Patient | null {
  const p = findPatient(id);
  if (!p) {
    res.status(404).json({ error: 'Patient not found' });
    return null;
  }
  return p;
}

const isLevel = (n: unknown): n is Level => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 8;

patients.get('/board', requireCan('unit.read'), (_req, res) => res.json(boardView()));
patients.get('/unit', requireCan('unit.read'), (_req, res) => res.json(unitView()));
patients.get('/unit/benchmarks', requireCan('unit.read'), (_req, res) => res.json(benchmarksView()));

patients.get('/patients/:id', requireCan('patient.read'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (p) res.json(patientView(p));
});

// Nurse only: set goal level, reps, clearance.
patients.put('/patients/:id/goal', requireCan('goal.set'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const { level, reps, clearance } = req.body ?? {};
  if (!isLevel(level) || !Number.isInteger(reps) || reps < 1 || reps > 6) {
    return res.status(400).json({ error: 'level must be 1–8 and reps 1–6' });
  }
  if (clearance !== undefined && clearance !== 'independent' && clearance !== 'needs-assist') {
    return res.status(400).json({ error: 'invalid clearance' });
  }
  mutate('patient', p.id, () => {
    p.goal = { level, reps, setBy: req.actor!.label, setAt: now() };
    p.goalHistory.push(p.goal);
    if (clearance) p.clearance = clearance;
  });
  res.json(patientView(p));
});

// Nurse controls: mute coaching, pause nudges, note to patient.
patients.patch('/patients/:id/controls', requireCan('patient.controls'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const { aiCoachingMuted, nudgesPausedUntil, nurseNote, buddiesBlockedByStaff } = req.body ?? {};
  mutate('patient', p.id, () => {
    if (typeof aiCoachingMuted === 'boolean') p.aiCoachingMuted = aiCoachingMuted;
    if (typeof buddiesBlockedByStaff === 'boolean') p.buddiesBlockedByStaff = buddiesBlockedByStaff;
    if (nudgesPausedUntil === null || typeof nudgesPausedUntil === 'number') p.nudgesPausedUntil = nudgesPausedUntil;
    if (nurseNote === null || nurseNote === '') p.nurseNote = null;
    else if (typeof nurseNote === 'string') p.nurseNote = { text: nurseNote.slice(0, 140), at: now() };
  });
  res.json(patientView(p));
});

patients.patch('/patients/:id/settings', requireCan('patient.settings'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const b = (req.body ?? {}) as Partial<PatientSettings>;
  mutate('patient', p.id, () => {
    if (b.language === 'en' || b.language === 'es') p.settings.language = b.language;
    if (b.textSize === 1 || b.textSize === 2 || b.textSize === 3) p.settings.textSize = b.textSize;
    if (typeof b.highContrast === 'boolean') p.settings.highContrast = b.highContrast;
    if (typeof b.readAloud === 'boolean') p.settings.readAloud = b.readAloud;
    if (typeof b.sound === 'boolean') p.settings.sound = b.sound;
    // Opting in to walking buddies is the patient's own choice; staff can only turn it off (controls).
    if (typeof b.buddies === 'boolean' && req.actor?.role === 'patient') p.settings.buddies = b.buddies;
    if (typeof b.volume === 'number' && b.volume >= 0 && b.volume <= 1) p.settings.volume = Math.round(b.volume * 100) / 100;
  });
  res.json(patientView(p));
});

patients.patch('/patients/:id/pet', requireCan('patient.pet'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const b = (req.body ?? {}) as Partial<PetChoice>;
  const species = ['nimbus', 'mossback', 'glimkit'];
  mutate('patient', p.id, () => {
    const pet: PetChoice = p.pet ?? { species: 'nimbus', palette: 0, name: 'Pip', accessory: null };
    if (b.species && species.includes(b.species)) pet.species = b.species;
    if (b.palette === 0 || b.palette === 1 || b.palette === 2 || b.palette === 3) pet.palette = b.palette;
    if (typeof b.name === 'string') pet.name = b.name.trim().slice(0, 16) || 'Pip';
    if (b.accessory === null || ACCESSORIES.includes(b.accessory as AccessoryId)) {
      pet.accessory = b.accessory ?? null;
    }
    p.pet = pet;
    p.petSetupRequested = false;
  });
  res.json(patientView(p));
});

// "Help set up pet": staff open the setup flow on this patient's bedside tablet; the tablet closes it when done.
patients.post('/patients/:id/pet/setup', requireCan('patient.pet'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const open = req.body?.open === true;
  if (open && req.actor?.role === 'patient') return res.status(403).json({ error: 'forbidden' });
  mutate('patient', p.id, () => {
    p.petSetupRequested = open;
  });
  res.json(patientView(p));
});

// Patient (or family visit) reports an activity. Marked "reported" until a nurse confirms.
patients.post('/patients/:id/logs', requireCan('activity.selfReport'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const { level, assistConfirmed = false } = req.body ?? {};
  if (!isLevel(level) || !allowedActivityLevels(p.goal).includes(level)) {
    return res.status(400).json({ error: 'That activity is not part of the current goal' });
  }
  if (requiresAssistGate(level, p.clearance) && !assistConfirmed) {
    return res.status(409).json({ error: 'assist-required', message: 'Call your nurse before standing' });
  }

  const result = recordActivity(p, level, 'patient');
  res.status(201).json({ ...result, view: patientView(p) });
});

// Care team checks off an activity they saw or helped with: confirmed at once, with who logged it.
patients.post('/patients/:id/logs/staff', requireCan('activity.staffLog'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const { level } = req.body ?? {};
  if (!isLevel(level) || !allowedActivityLevels(p.goal).includes(level)) {
    return res.status(400).json({ error: 'That activity is not part of the current goal' });
  }
  const result = recordActivity(p, level, 'staff', staffRef(req.actor!));
  res.status(201).json(result);
});

// Staff confirm or reject a patient-reported log. Journey steps are never taken back.
for (const action of ['confirm', 'reject'] as const) {
  patients.post(`/logs/:logId/${action}`, requireCan('activity.confirm'), (req, res) => {
    const log = getDB().logs.find((l) => l.id === req.params.logId);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    mutate('log', log.patientId, () => {
      log.status = action === 'confirm' ? 'confirmed' : 'rejected';
      log.reviewedAt = now();
      log.reviewedBy = staffRef(req.actor!);
    });
    res.json(log);
  });
}

// "I need help" button: flag for the nurse.
patients.post('/patients/:id/help', requireCan('patient.tablet'), (req, res) => {
  const p = withPatient(req.params.id, res);
  if (!p) return;
  const flag = mutate('flag', p.id, (db) => {
    const f = { id: newId('flag'), patientId: p.id, at: now(), text: 'Pressed "I need help"', source: 'help-button' as const, matched: null, acknowledgedAt: null };
    db.flags.push(f);
    return f;
  });
  res.status(201).json(flag);
});

patients.get('/flags', requireCan('unit.read'), (_req, res) => {
  const db = getDB();
  const rooms = new Map(db.patients.map((p) => [p.id, { room: p.room, name: `${p.firstName} ${p.lastInitial}.` }]));
  res.json(db.flags.map((f) => ({ ...f, ...rooms.get(f.patientId) })).sort((a, b) => b.at - a.at));
});

patients.post('/flags/:flagId/ack', requireCan('flags.manage'), (req, res) => {
  const flag = getDB().flags.find((f) => f.id === req.params.flagId);
  if (!flag) return res.status(404).json({ error: 'Flag not found' });
  mutate('flag', flag.patientId, () => {
    flag.acknowledgedAt = now();
  });
  res.json(flag);
});

patients.post('/patients/:id/messages/:messageId/delivered', requireCan('patient.tablet'), (req, res) => {
  const msg = getDB().messages.find((m) => m.id === req.params.messageId && m.patientId === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  mutate('message', msg.patientId, () => {
    msg.deliveredAt = msg.deliveredAt ?? now();
  });
  res.json(msg);
});
