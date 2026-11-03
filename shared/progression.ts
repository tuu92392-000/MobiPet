// Journey Home progression. Progress is only ever added, never taken away.
import type { AccessoryId, ActivityLog, Goal, Level, PetMood, ShiftInfo } from './types';
import { HOUR, MINUTE } from './shifts';

export const HOME_STEPS = 120;

/** Journey steps earned per activity, by JH-HLM level. */
export const POINTS: Record<Level, number> = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2, 6: 3, 7: 4, 8: 6 };

export type RegionId = 'room' | 'garden' | 'meadow' | 'river' | 'hilltop' | 'home';

export const REGIONS: { id: RegionId; start: number }[] = [
  { id: 'room', start: 0 },
  { id: 'garden', start: 5 },
  { id: 'meadow', start: 30 },
  { id: 'river', start: 60 },
  { id: 'hilltop', start: 90 },
  { id: 'home', start: HOME_STEPS },
];

/** Growth stage thresholds (stage 1..4). */
export const STAGES = [0, 25, 60, 100];

/** Every accessory is available from the start; customizing the pet is never a reward to earn. */
export const ACCESSORIES: AccessoryId[] = ['scarf', 'backpack', 'stick', 'hat'];

export type KeepsakeId =
  | 'leaf' | 'snail-shell' | 'seed'
  | 'feather' | 'clover' | 'butterfly'
  | 'shell' | 'pebble' | 'reed'
  | 'star' | 'pinecone' | 'kite'
  | 'key';

export const KEEPSAKES: { id: KeepsakeId; region: RegionId; at: number }[] = [
  { id: 'leaf', region: 'garden', at: 8 },
  { id: 'snail-shell', region: 'garden', at: 15 },
  { id: 'seed', region: 'garden', at: 23 },
  { id: 'feather', region: 'meadow', at: 34 },
  { id: 'clover', region: 'meadow', at: 44 },
  { id: 'butterfly', region: 'meadow', at: 53 },
  { id: 'shell', region: 'river', at: 64 },
  { id: 'pebble', region: 'river', at: 74 },
  { id: 'reed', region: 'river', at: 84 },
  { id: 'star', region: 'hilltop', at: 95 },
  { id: 'pinecone', region: 'hilltop', at: 104 },
  { id: 'kite', region: 'hilltop', at: 113 },
  { id: 'key', region: 'home', at: HOME_STEPS },
];

export function regionAt(steps: number): RegionId {
  let r: RegionId = 'room';
  for (const region of REGIONS) if (steps >= region.start) r = region.id;
  return r;
}

/** Share of the map's path each region occupies, so every region gets equal room on screen. */
export const REGION_SPAN: Record<RegionId, [number, number]> = {
  room: [0, 0.06],
  garden: [0.06, 0.28],
  meadow: [0.28, 0.5],
  river: [0.5, 0.72],
  hilltop: [0.72, 0.94],
  home: [0.97, 0.97],
};

/** Position along the map path, 0..1, for a step count. */
export function journeyFraction(steps: number): number {
  if (steps >= HOME_STEPS) return REGION_SPAN.home[0];
  const s = Math.max(0, steps);
  for (let i = 0; i < REGIONS.length - 1; i++) {
    const { id, start } = REGIONS[i];
    const end = REGIONS[i + 1].start;
    if (s < end) {
      const [a, b] = REGION_SPAN[id];
      return a + ((s - start) / (end - start)) * (b - a);
    }
  }
  return REGION_SPAN.home[0];
}

/** The next region ahead (the map's "Next stop"); null once home. Distances are never shown to patients. */
export function nextRegion(steps: number): RegionId | null {
  return REGIONS.find((r) => r.start > steps)?.id ?? null;
}

export function stageFor(steps: number): 1 | 2 | 3 | 4 {
  let s = 1;
  STAGES.forEach((t, i) => {
    if (steps >= t) s = i + 1;
  });
  return s as 1 | 2 | 3 | 4;
}

export function keepsakesFor(steps: number): KeepsakeId[] {
  return KEEPSAKES.filter((k) => steps >= k.at).map((k) => k.id);
}

export interface ProgressResult {
  before: number;
  after: number;
  gained: number;
  newKeepsakes: KeepsakeId[];
  stageUp: boolean;
  newRegion: RegionId | null;
  reachedHome: boolean;
}

/** Apply one activity to journey steps. Never decreases; caps at Home. */
export function applyActivity(before: number, level: Level): ProgressResult {
  const after = Math.min(HOME_STEPS, before + POINTS[level]);
  const was = new Set(keepsakesFor(before));
  return {
    before,
    after,
    gained: after - before,
    newKeepsakes: keepsakesFor(after).filter((k) => !was.has(k)),
    stageUp: stageFor(after) > stageFor(before),
    newRegion: regionAt(after) !== regionAt(before) ? regionAt(after) : null,
    reachedHome: before < HOME_STEPS && after >= HOME_STEPS,
  };
}

/** Progress in words, for anything a patient sees or hears. Patients are never shown counts or percentages. */
export type ProgressWords = 'not-started' | 'partway' | 'met';

export function progressWords(done: number, total: number): ProgressWords {
  if (done >= total) return 'met';
  return done > 0 ? 'partway' : 'not-started';
}

/** Logs in the shift that count toward the goal (not rejected, at or above goal level). */
export function goalProgress(logs: ActivityLog[], goal: Pick<Goal, 'level' | 'reps'>, shift: ShiftInfo): number {
  const n = logs.filter(
    (l) => l.status !== 'rejected' && l.at >= shift.start && l.at < shift.end && l.level >= goal.level,
  ).length;
  return Math.min(goal.reps, n);
}

export function highestLevel(logs: ActivityLog[], shift: ShiftInfo): Level | null {
  let best: Level | null = null;
  for (const l of logs) {
    if (l.status === 'rejected' || l.at < shift.start || l.at >= shift.end) continue;
    if (best === null || l.level > best) best = l.level;
  }
  return best;
}

/**
 * Pet mood is driven by recent movement and encouragement, never by failure.
 * Long quiet stretches make the pet sleepy and cozy — never sad.
 */
export function petMood(
  now: number,
  lastActivityAt: number | null,
  lastEncouragementAt: number | null,
  restGoal: boolean,
): PetMood {
  if (restGoal) return 'sleepy';
  if (lastActivityAt === null && lastEncouragementAt === null) return 'curious';
  const since = (t: number | null) => (t === null ? Infinity : now - t);
  if (since(lastActivityAt) <= 30 * MINUTE) return 'excited';
  if (since(lastActivityAt) <= 2 * HOUR || since(lastEncouragementAt) <= 2 * HOUR) return 'happy';
  if (since(lastActivityAt) <= 4 * HOUR) return 'curious';
  return 'sleepy';
}
