// Walking buddies: preset cheers between opted-in patients. Anonymous by design: other patients are
// shown only as their pet (name, species, picture) and an opaque handle — never a name, room or id.
import { Router } from 'express';
import { BUDDY_PRESETS, BUDDY_STICKERS, type BuddyCheerBody, type Patient } from '../../shared/types';
import { requireCan } from '../auth/middleware';
import { findPatient, getDB, mutate, now } from '../store';
import { newId } from '../seed';

export const buddies = Router();

export const MAX_SENDS_PER_DAY = 5;
export const MAX_RECEIVED_PER_DAY = 10;

const SPECIES_WORD = { nimbus: 'cloud', mossback: 'turtle', glimkit: 'fox' } as const;
const COLOR_WORD = ['peach', 'green', 'blue', 'purple'] as const;

const active = (p: Patient) => p.settings.buddies && !p.buddiesBlockedByStaff && !!p.pet;
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const cheersToday = (pred: (c: { fromPatientId: string; toPatientId: string; at: number }) => boolean) =>
  getDB().buddyCheers.filter((c) => c.at >= startOfDay(now()) && pred(c)).length;

/** What another patient may know about a buddy. A color word is added only when two buddies would look alike. */
function buddyCard(p: Patient, everyone: Patient[]) {
  const pet = p.pet!;
  const twin = everyone.some((o) => o.id !== p.id && o.pet?.name === pet.name && o.pet?.species === pet.species);
  return {
    handle: p.buddyHandle,
    name: pet.name,
    species: pet.species,
    speciesWord: SPECIES_WORD[pet.species],
    colorWord: twin ? COLOR_WORD[pet.palette] : null,
    palette: pet.palette,
    accessory: pet.accessory,
  };
}

buddies.get('/patients/:id/buddies', requireCan('buddies.use'), (req, res) => {
  const me = findPatient(req.params.id)!;
  const all = getDB().patients.filter(active);
  const cardOf = (id: string) => {
    const p = all.find((x) => x.id === id) ?? findPatient(id);
    return p?.pet ? buddyCard(p, all) : null;
  };
  const mine = getDB().buddyCheers.filter((c) => c.toPatientId === me.id || c.fromPatientId === me.id).sort((a, b) => b.at - a.at).slice(0, 30);
  res.json({
    optedIn: me.settings.buddies,
    blockedByStaff: me.buddiesBlockedByStaff,
    // Patients see whether they can still send today, never a count.
    canSendToday: cheersToday((c) => c.fromPatientId === me.id) < MAX_SENDS_PER_DAY,
    buddies: active(me) ? all.filter((p) => p.id !== me.id).map((p) => buddyCard(p, all)) : [],
    history: active(me)
      ? mine.map((c) => ({ id: c.id, at: c.at, body: c.body, direction: c.toPatientId === me.id ? 'received' : 'sent', buddy: cardOf(c.toPatientId === me.id ? c.fromPatientId : c.toPatientId) }))
      : [],
  });
});

buddies.post('/patients/:id/buddies/cheer', requireCan('buddies.use'), (req, res) => {
  const me = findPatient(req.params.id)!;
  const body = req.body?.body as BuddyCheerBody;
  if (![...BUDDY_PRESETS, ...BUDDY_STICKERS].includes(body)) return res.status(400).json({ error: 'preset-only' });
  if (!active(me)) return res.status(403).json({ error: 'not-opted-in' });
  const to = getDB().patients.find((p) => p.buddyHandle === req.body?.to);
  if (!to || to.id === me.id || !active(to)) return res.status(404).json({ error: 'buddy-not-found' });
  if (cheersToday((c) => c.fromPatientId === me.id) >= MAX_SENDS_PER_DAY) return res.status(429).json({ error: 'send-limit' });
  if (cheersToday((c) => c.toPatientId === to.id) >= MAX_RECEIVED_PER_DAY) return res.status(429).json({ error: 'receive-limit' });
  mutate('buddy', to.id, (db) => db.buddyCheers.push({ id: newId('cheer'), at: now(), fromPatientId: me.id, toPatientId: to.id, body }));
  res.status(201).json({ ok: true });
});
