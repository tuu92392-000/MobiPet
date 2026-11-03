// Synthetic seed data. Every patient, name, and event here is fictional.
import type {
  AccessoryId, ActivityLog, BuddyCheerBody, ChatTurn, Clearance, DB, Goal, Lang, Level, Message,
  Palette, Patient, SafetyFlag, Species,
} from '../shared/types';
import { HOUR, MINUTE } from '../shared/shifts';
import { HOME_STEPS, POINTS } from '../shared/progression';
import { demoPin, patientAccounts, staffAccounts } from './auth/accounts';

/** Patients who turned on "Cheer on other walkers" in the seed. */
const BUDDIES_ON = ['410', '411', '413', '416', '417'];

const staffThreadIdFor = (a: string, b: string) => `staff:${[a, b].sort().join(':')}`;

/** Seeded demo always opens at 1:30 PM on the current day, mid day-shift. */
export const DEMO_START = { hour: 13, minute: 30 };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type TodayLog = [hour: number, minute: number, level: Level, status: 'reported' | 'confirmed'];

interface Spec {
  first: string;
  lastInitial: string;
  room: string;
  cohort: Patient['cohort'];
  language?: Lang;
  clearance?: Clearance;
  goal: [Level, number];
  pet: [Species, Palette, string, AccessoryId | null];
  daysIn: number;
  today: TodayLog[];
  textSize?: 1 | 2 | 3;
  readAloud?: boolean;
  highContrast?: boolean;
  motivators: string[];
  note?: string;
  /** Shape of the synthetic history since admission, for the Nurse view benchmarks. */
  trend?: 'improving' | 'steady' | 'declining';
}

const SPECS: Spec[] = [
  {
    first: 'Marigold', lastInitial: 'T', room: '410', cohort: 'lung-transplant',
    goal: [7, 2], pet: ['nimbus', 0, 'Pip', 'scarf'], daysIn: 6,
    today: [[8, 40, 7, 'confirmed']],
    trend: 'improving',
    motivators: ['getting back to her garden', "her grandson's soccer games"],
  },
  {
    first: 'Barnaby', lastInitial: 'Q', room: '411', cohort: 'lung-transplant',
    goal: [6, 3], pet: ['mossback', 1, 'Clover', null], daysIn: 4,
    today: [[9, 15, 6, 'confirmed'], [12, 5, 6, 'reported']],
    motivators: ['fishing at the shore', 'beating his own record'],
    note: 'PT coming at 2 PM!',
  },
  {
    first: 'Odessa', lastInitial: 'P', room: '412', cohort: 'med-surg',
    goal: [5, 2], pet: ['glimkit', 2, 'Ember', null], daysIn: 3,
    today: [[9, 0, 4, 'confirmed']],
    trend: 'declining',
    motivators: ['her book club', 'sitting by the window'],
  },
  {
    first: 'Ignacio', lastInitial: 'V', room: '413', cohort: 'med-surg', language: 'es',
    goal: [7, 2], pet: ['mossback', 0, 'Tito', 'scarf'], daysIn: 5,
    today: [[10, 30, 7, 'reported']],
    motivators: ['cocinar para su familia', 'su perro Canelo'],
  },
  {
    first: 'Winifred', lastInitial: 'L', room: '414', cohort: 'med-surg',
    goal: [6, 2], pet: ['nimbus', 3, 'Pip', null], daysIn: 2,
    today: [[11, 20, 6, 'confirmed']], textSize: 3, readAloud: true,
    motivators: ['her radio programs', 'her cat Biscuit'],
  },
  {
    first: 'Cornelius', lastInitial: 'D', room: '415', cohort: 'med-surg', clearance: 'needs-assist',
    goal: [5, 2], pet: ['glimkit', 0, 'Lumen', null], daysIn: 3,
    today: [[10, 0, 4, 'confirmed']],
    motivators: ['woodworking', 'his weekly card game'],
  },
  {
    first: 'Juniper', lastInitial: 'K', room: '416', cohort: 'med-surg',
    goal: [7, 2], pet: ['nimbus', 1, 'Pip', 'backpack'], daysIn: 7,
    today: [[8, 10, 7, 'confirmed'], [11, 45, 8, 'confirmed']],
    trend: 'improving',
    motivators: ['her choir', 'walking her dog'],
  },
  {
    first: 'Delphine', lastInitial: 'R', room: '417', cohort: 'med-surg',
    goal: [8, 1], pet: ['mossback', 2, 'Sprout', 'scarf'], daysIn: 8,
    today: [[12, 50, 6, 'reported']],
    trend: 'improving',
    motivators: ['her pottery class'],
  },
  {
    first: 'Percival', lastInitial: 'H', room: '418', cohort: 'lung-transplant',
    goal: [6, 2], pet: ['glimkit', 3, 'Pip', null], daysIn: 5,
    today: [[9, 50, 6, 'confirmed']],
    trend: 'declining',
    motivators: ['his model trains', 'his granddaughter'],
  },
  {
    first: 'Augustin', lastInitial: 'B', room: '419', cohort: 'med-surg',
    goal: [2, 1], pet: ['nimbus', 2, 'Pip', null], daysIn: 1,
    today: [],
    motivators: ['crossword puzzles'],
  },
];

function atToday(now: number, hour: number, minute: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export function demoStartTime(realNow: number): number {
  return atToday(realNow, DEMO_START.hour, DEMO_START.minute);
}

export function buildSeed(realNow = Date.now()): DB {
  const now = demoStartTime(realNow);
  const rand = mulberry32(410);
  const patients: Patient[] = [];
  const logs: ActivityLog[] = [];
  const flags: SafetyFlag[] = [];
  const messages: Message[] = [];
  const chats: ChatTurn[] = [];

  for (const s of SPECS) {
    const id = `p${s.room}`;
    const admittedAt = atToday(now - s.daysIn * 24 * HOUR, 10, 0);
    const goal: Goal = { level: s.goal[0], reps: s.goal[1], setBy: 'Nurse 1', setAt: atToday(now, 7, 15) };
    // Improving patients started one level lower; their nurse raised the goal halfway through the stay.
    const raisedDaysAgo = Math.floor(s.daysIn / 2);
    const raised = s.trend === 'improving' && s.daysIn >= 3 && goal.level >= 4;
    const goalHistory: Goal[] = raised
      ? [
          { level: (goal.level - 1) as Level, reps: goal.reps, setBy: 'Nurse 2', setAt: admittedAt + 2 * HOUR },
          { level: goal.level, reps: goal.reps, setBy: 'Nurse 1', setAt: atToday(now - raisedDaysAgo * 24 * HOUR, 7, 15) },
          goal,
        ]
      : [{ ...goal, setBy: 'Nurse 2', setAt: admittedAt + 2 * HOUR }, goal];
    const goalOn = (t: number) => [...goalHistory].reverse().find((g) => g.setAt <= t) ?? goalHistory[0];
    const patientLogs: ActivityLog[] = [];
    const log = (at: number, level: Level, status: ActivityLog['status']) => {
      patientLogs.push({ id: newId('log'), patientId: id, level, at, source: 'patient', status, reviewedAt: status === 'confirmed' ? at + 20 * MINUTE : null });
    };

    // Day and evening shift history for the whole stay, shaped by the patient's trend.
    for (let daysAgo = s.daysIn; daysAgo >= 1; daysAgo--) {
      const progress = (s.daysIn - daysAgo) / Math.max(1, s.daysIn - 1);
      const chance = s.trend === 'improving' ? 0.3 + 0.6 * progress : s.trend === 'declining' ? 0.85 - 0.6 * progress : 0.6;
      for (const startHour of [7, 15]) {
        const shiftStart = atToday(now - daysAgo * 24 * HOUR, startHour, 0);
        if (shiftStart < admittedAt) continue;
        const g = goalOn(shiftStart + 4 * HOUR);
        if (g.level <= 2) continue;
        const met = rand() < chance;
        const count = met ? g.reps : Math.floor(rand() * g.reps);
        for (let i = 0; i < count; i++) {
          const at = shiftStart + Math.floor((0.1 + 0.8 * rand()) * 8 * HOUR);
          log(at, g.level, 'confirmed');
        }
        // Missed shifts still show some movement, a level lower.
        if (!met && rand() < 0.7) log(shiftStart + Math.floor((0.2 + 0.6 * rand()) * 8 * HOUR), Math.max(3, g.level - 1) as Level, 'confirmed');
      }
    }

    for (const [h, m, level, status] of s.today) log(atToday(now, h, m), level, status);

    const steps = Math.min(HOME_STEPS - 5, patientLogs.reduce((sum, l) => sum + POINTS[l.level], 0));

    patients.push({
      id,
      firstName: s.first,
      lastInitial: s.lastInitial,
      room: s.room,
      cohort: s.cohort,
      admittedAt,
      clearance: s.clearance ?? 'independent',
      goal,
      goalHistory,
      pet: { species: s.pet[0], palette: s.pet[1], name: s.pet[2], accessory: s.pet[3] },
      journeySteps: steps,
      settings: {
        language: s.language ?? 'en',
        textSize: s.textSize ?? 1,
        highContrast: s.highContrast ?? false,
        readAloud: s.readAloud ?? false,
        sound: true,
        volume: 0.6,
        buddies: BUDDIES_ON.includes(s.room),
      },
      motivators: s.motivators,
      aiCoachingMuted: false,
      nudgesPausedUntil: null,
      nudgeSnoozedUntil: null,
      lastNudgeAt: null,
      nurseNote: s.note ? { text: s.note, at: atToday(now, 11, 0) } : null,
      familyCode: `PIP-${s.room}`,
      buddyHandle: `buddy_${Math.floor(rand() * 1e9).toString(36)}`,
      buddiesBlockedByStaff: false,
    });
    logs.push(...patientLogs);
  }

  // Room 418: unacknowledged safety flag from Talk to Pip.
  const flagAt = atToday(now, 13, 15);
  chats.push(
    { id: newId('chat'), patientId: 'p418', at: flagAt, role: 'patient', text: 'I feel a little dizzy after standing up', mode: undefined },
    {
      id: newId('chat'), patientId: 'p418', at: flagAt + 1000, role: 'pet', mode: 'safety', guardrail: 'symptom:dizzy',
      text: 'Please press your call button now so your nurse can help you. I let your nurse know too.',
    },
  );
  flags.push({ id: newId('flag'), patientId: 'p418', at: flagAt, text: 'I feel a little dizzy after standing up', source: 'chat', matched: 'dizzy', acknowledgedAt: null });

  // Conversations. Messages to the patient were delivered by the pet unless noted; replies come from the tablet.
  const msg = (
    threadId: string, patientId: string | null, at: number, fromAccountId: string, fromRole: Message['fromRole'], from: string,
    body: string, extra: Partial<Message> = {},
  ): Message => ({
    id: newId('msg'), threadId, patientId, at, fromAccountId, fromRole, from, kind: 'text', body, blocked: false,
    deliveredAt: fromRole === 'patient' ? null : at + MINUTE, readBy: [fromAccountId], ...extra,
  });
  const read = (...ids: string[]) => ({ readBy: ids });
  messages.push(
    // Room 410: granddaughter and a reply.
    msg('family:p410', 'p410', atToday(now, 9, 30), 'acct_fam_p410', 'family', 'Rosie (granddaughter)', 'Go Grandma go! We miss you at dinner.', read('acct_fam_p410', 'acct_p410')),
    msg('family:p410', 'p410', atToday(now, 9, 45), 'acct_p410', 'patient', 'Marigold', 'Thank you sweetheart! Pip and I walked to the hallway garden today.', read('acct_p410', 'acct_fam_p410')),
    // Room 413 and 416: waiting for the pet to deliver.
    msg('family:p413', 'p413', atToday(now, 12, 0), 'acct_fam_p413', 'family', 'Lucía', '¡Tú puedes!', { kind: 'preset', deliveredAt: null }),
    msg('family:p416', 'p416', atToday(now, 12, 10), 'acct_fam_p416', 'family', 'Sam', 'sunflower', { kind: 'sticker', deliveredAt: null }),
    // Room 411: a mobility aide and the patient.
    msg('careteam:p411', 'p411', atToday(now, 10, 5), 'acct_aid1', 'mobility_aid', 'Mobility Aid 1', 'Nice walk this morning, Barnaby! I’ll stop by after lunch for another lap.', read('acct_aid1', 'acct_p411')),
    msg('careteam:p411', 'p411', atToday(now, 10, 20), 'acct_p411', 'patient', 'Barnaby', 'Sounds good. Clover and I will be ready.', read('acct_p411', 'acct_aid1')),
    // Staff: the unit thread, 1:1 threads, and messages tagged to a patient. Staff messages are never delivered to a tablet.
    msg('unit', null, atToday(now, 7, 20), 'acct_nurse1', 'nurse', 'Nurse 1', 'Morning, team. Two new goals today: 410 is up to hallway walks and 417 to 250 feet.', { deliveredAt: null, readBy: ['acct_nurse1', 'acct_nurse2', 'acct_aid1'] }),
    msg('unit', null, atToday(now, 7, 32), 'acct_aid1', 'mobility_aid', 'Mobility Aid 1', 'Got it. I’ll start with 410, 411 and 413.', { deliveredAt: null, readBy: ['acct_aid1', 'acct_nurse1', 'acct_nurse2'] }),
    msg('unit', null, atToday(now, 13, 18), 'acct_nurse2', 'nurse', 'Nurse 2', 'Holding walks for 418 until I’ve checked in about the dizziness flag.', { deliveredAt: null, patientTag: 'p418', readBy: ['acct_nurse2'] }),
    msg(staffThreadIdFor('acct_aid1', 'acct_nurse1'), null, atToday(now, 11, 50), 'acct_aid1', 'mobility_aid', 'Mobility Aid 1', '412 hasn’t been up since 9. Okay to try a stand after lunch?', { deliveredAt: null, patientTag: 'p412', readBy: ['acct_aid1', 'acct_nurse1'] }),
    msg(staffThreadIdFor('acct_aid1', 'acct_nurse1'), null, atToday(now, 12, 2), 'acct_nurse1', 'nurse', 'Nurse 1', 'Yes, standing for a minute is her goal. Chair first if she’s tired.', { deliveredAt: null, patientTag: 'p412', readBy: ['acct_nurse1', 'acct_aid1'] }),
    msg(staffThreadIdFor('acct_aid2', 'acct_nurse2'), null, atToday(now, 12, 30), 'acct_nurse2', 'nurse', 'Nurse 2', 'Can you help 415 with the chair transfer at 2? Needs assist.', { deliveredAt: null, patientTag: 'p415', readBy: ['acct_nurse2'] }),
    // Room 414: a nurse note thread the patient hasn't seen yet.
    msg('careteam:p414', 'p414', atToday(now, 12, 40), 'acct_nurse1', 'nurse', 'Nurse 1', 'Hi Winifred, your radio program is on at 3. Want to sit in the chair for it?', { deliveredAt: null }),
  );

  const accounts = [...staffAccounts(), ...patients.flatMap((p) => patientAccounts(p, demoPin(p.room)))];
  const note = (authorId: string, patientId: string | null, text: string, h: number, m: number) => {
    const at = atToday(now, h, m);
    return { id: newId('note'), authorId, patientId, text, createdAt: at, updatedAt: at };
  };
  const notes = [
    note('acct_nurse1', null, 'Restock gait belts in the supply room before 3.', 7, 40),
    note('acct_nurse1', 'p412', 'Ask about trying the chair first after lunch.', 12, 5),
    note('acct_aid1', null, 'Rooms 410, 411, 413 first after rounds.', 7, 35),
    note('acct_aid1', 'p411', 'Likes to walk to the window at the end of the hall.', 10, 25),
  ];
  const ymd = (t: number) => new Date(t).toLocaleDateString('en-CA');
  const exportLog = [
    { id: newId('exp'), at: atToday(now - 24 * HOUR, 16, 10), accountId: 'acct_nurse2', label: 'Nurse 2', role: 'nurse' as const, scope: 'unit', scopeLabel: 'Unit', format: 'xlsx' as const, rowCount: 412, filename: `mobipet_unit_${ymd(now - 24 * HOUR)}.xlsx` },
    { id: newId('exp'), at: atToday(now, 9, 5), accountId: 'acct_aid1', label: 'Mobility Aid 1', role: 'mobility_aid' as const, scope: 'p410', scopeLabel: 'Room 410', format: 'csv' as const, rowCount: 58, filename: `mobipet_room410_${ymd(now)}.csv` },
  ];
  const cheer = (from: string, to: string, body: BuddyCheerBody, h: number, m: number) => ({ id: newId('cheer'), at: atToday(now, h, m), fromPatientId: from, toPatientId: to, body });
  const buddyCheers = [
    cheer('p416', 'p410', 'keep-going', 9, 10),
    cheer('p417', 'p411', 'thumbs-up', 10, 40),
    cheer('p410', 'p416', 'proud', 11, 55),
  ];
  return { version: 2, clockOffsetMs: now - realNow, patients, logs, flags, messages, chats, accounts, sessions: [], notes, exportLog, buddyCheers };
}
