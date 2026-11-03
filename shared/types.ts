// Shared domain types for client and server. All data is synthetic.

export type Lang = 'en' | 'es';
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Clearance = 'independent' | 'needs-assist';
export type Species = 'nimbus' | 'mossback' | 'glimkit';
export type Palette = 0 | 1 | 2 | 3;
export type AccessoryId = 'scarf' | 'backpack' | 'stick' | 'hat';
export type ShiftName = 'day' | 'evening' | 'night';
export type LogStatus = 'reported' | 'confirmed' | 'rejected';
/** 'family-visit' remains only on v1 history; v2 family accounts cannot log activity. */
export type LogSource = 'patient' | 'family-visit' | 'staff';
export type PatientStatus = 'needs-attention' | 'behind' | 'on-track' | 'goal-met';
export type PetMood = 'curious' | 'happy' | 'excited' | 'sleepy';
export type StaffRole = 'nurse' | 'mobility_aid';

export interface Goal {
  level: Level;
  /** Times to reach the level this shift. */
  reps: number;
  setBy: string;
  setAt: number;
}

export interface PetChoice {
  species: Species;
  palette: Palette;
  name: string;
  accessory: AccessoryId | null;
}

export interface PatientSettings {
  language: Lang;
  textSize: 1 | 2 | 3;
  highContrast: boolean;
  readAloud: boolean;
  /** Chimes and the spoken welcome-back greeting. On by default. */
  sound: boolean;
  /** 0–1, for all speech and chimes. */
  volume: number;
  /** "Cheer on other walkers": walking buddies, off by default. */
  buddies: boolean;
}

export interface Patient {
  id: string;
  firstName: string;
  lastInitial: string;
  room: string;
  /** Seed variety only. Never sent to the AI. */
  cohort: 'lung-transplant' | 'med-surg';
  admittedAt: number;
  clearance: Clearance;
  goal: Goal;
  /** Every goal since admission, oldest first; the last entry is the current goal. */
  goalHistory: Goal[];
  /** null until the patient picks a companion at admission. */
  pet: PetChoice | null;
  /** Journey Home progress. Only ever increases. */
  journeySteps: number;
  settings: PatientSettings;
  /** Things that have motivated this patient before (non-clinical). */
  motivators: string[];
  aiCoachingMuted: boolean;
  nudgesPausedUntil: number | null;
  nudgeSnoozedUntil: number | null;
  lastNudgeAt: number | null;
  nurseNote: { text: string; at: number } | null;
  familyCode: string;
  /** A medical question Pip redirected; the patient asked Pip to remind the nurse. */
  questionForNurse?: { text: string; at: number } | null;
  /** Opaque id other patients see instead of anything identifying (walking buddies). */
  buddyHandle: string;
  /** Care team turned walking buddies off for this patient. */
  buddiesBlockedByStaff: boolean;
  /** Staff (or family at the bedside) asked the tablet to open the pet setup flow. */
  petSetupRequested?: boolean;
  /** The nudge currently shown on the tablet, until dismissed or snoozed. */
  activeNudge?: { id: string; text: string; at: number } | null;
}

/** Who on the care team did something, as it appears in logs and exports. */
export interface StaffRef {
  accountId: string;
  role: StaffRole;
  label: string;
}

export interface ActivityLog {
  id: string;
  patientId: string;
  level: Level;
  at: number;
  source: LogSource;
  status: LogStatus;
  reviewedAt: number | null;
  /** Staff member who checked the activity off (source 'staff'). */
  loggedBy?: StaffRef | null;
  /** Staff member who confirmed or rejected it. */
  reviewedBy?: StaffRef | null;
}

export interface SafetyFlag {
  id: string;
  patientId: string;
  at: number;
  /** Exact text the patient typed or said, or a description of the trigger. */
  text: string;
  source: 'chat' | 'help-button' | 'message';
  matched: string | null;
  acknowledgedAt: number | null;
}

/** Conversation ids: `family:<patientId>`, `careteam:<patientId>`, `staff:<accountA>:<accountB>`, `unit`. */
export type ThreadKind = 'family' | 'careteam' | 'staff' | 'unit';

export interface Message {
  id: string;
  threadId: string;
  /** The patient whose conversation this is (family and care team threads); null for staff-only threads. */
  patientId: string | null;
  at: number;
  fromAccountId: string;
  fromRole: Role;
  /** Display name: a family member's own name, a staff label ("Nurse 1"), or the patient's first name. */
  from: string;
  kind: 'text' | 'preset' | 'sticker';
  body: string;
  /** Failed the content filter: kept for audit, never shown. */
  blocked: boolean;
  /** When the pet showed it on the tablet (messages to the patient only). */
  deliveredAt: number | null;
  /** Accounts that have seen it (the sender always has). */
  readBy: string[];
  /** Staff threads only: the patient this message is about. */
  patientTag?: string | null;
  /** Patient messages only: the symptom keyword the safety scan matched. The message is still delivered. */
  symptom?: string | null;
}

export interface ChatTurn {
  id: string;
  patientId: string;
  at: number;
  role: 'patient' | 'pet';
  text: string;
  mode?: 'ai' | 'template' | 'safety';
  guardrail?: string | null;
  kind?: 'chat' | 'nudge';
  /** Links a pet turn to its entry in the AI log, so nurses can see what the AI saw. */
  aiLogId?: string;
}

export type Role = 'nurse' | 'mobility_aid' | 'patient' | 'family';

export interface Account {
  id: string;
  role: Role;
  /** Display label, e.g. "Nurse 1" or "Family of Room 412". Never a personal name for staff. */
  label: string;
  /** Staff sign-in name. Patients and family have none. */
  username: string | null;
  /** scrypt hash of the password (staff) or PIN (patient). Family uses codeLookup instead. */
  secretHash: string | null;
  salt: string | null;
  /** sha256 of the family invite code, so a code finds its account. */
  codeLookup: string | null;
  /** Patient this account belongs to (patient) or follows (family). */
  patientId: string | null;
}

export interface AuthSession {
  token: string;
  accountId: string;
  /** Bedside sessions are started by staff, bound to one patient, and lock after inactivity. */
  kind: 'staff' | 'family' | 'bedside';
  createdAt: number;
  /** Real (not simulated) time of the last user activity. */
  lastActiveAt: number;
  locked: boolean;
  pinFails: number;
  /** Real time until which PIN entry is blocked after too many wrong tries. */
  pinBlockedUntil: number | null;
  /** Staff account that started a bedside session. */
  startedBy: string | null;
}

export const BUDDY_PRESETS = ['good-work', 'keep-going', 'got-this', 'proud'] as const;
export const BUDDY_STICKERS = ['thumbs-up', 'star', 'heart', 'flower'] as const;
export type BuddyCheerBody = (typeof BUDDY_PRESETS)[number] | (typeof BUDDY_STICKERS)[number];

/** A preset cheer between two opted-in patients. Never free text. */
export interface BuddyCheer {
  id: string;
  at: number;
  fromPatientId: string;
  toPatientId: string;
  body: BuddyCheerBody;
}

/** A staff member's personal reminder. Visible only to its author, never exported. */
export interface Note {
  id: string;
  authorId: string;
  /** Attached to a patient, or null for the general notepad. */
  patientId: string | null;
  text: string;
  createdAt: number;
  updatedAt: number;
}

/** Append-only record of every mobility data export. Nothing can delete entries. */
export interface ExportLogEntry {
  id: string;
  at: number;
  accountId: string;
  label: string;
  role: StaffRole;
  /** 'unit' or a patient id. */
  scope: string;
  scopeLabel: string;
  format: 'csv' | 'xlsx';
  rowCount: number;
  filename: string;
}

export interface DB {
  version: 2;
  /** Simulated time = real time + offset. */
  clockOffsetMs: number;
  patients: Patient[];
  logs: ActivityLog[];
  flags: SafetyFlag[];
  messages: Message[];
  chats: ChatTurn[];
  accounts: Account[];
  sessions: AuthSession[];
  notes: Note[];
  exportLog: ExportLogEntry[];
  buddyCheers: BuddyCheer[];
}

export interface ShiftInfo {
  name: ShiftName;
  id: string;
  start: number;
  end: number;
}

export interface PatientSummary {
  id: string;
  room: string;
  displayName: string;
  goal: Goal;
  clearance: Clearance;
  language: Lang;
  progress: number;
  highestLevelThisShift: Level | null;
  lastActivityAt: number | null;
  unconfirmedCount: number;
  openFlagCount: number;
  status: PatientStatus;
  statusReason: string;
  mood: PetMood;
  pet: PetChoice | null;
  journeySteps: number;
  openQuestion: string | null;
}
