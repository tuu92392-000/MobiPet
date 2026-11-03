// Response shapes for the REST API (mirrors server/views.ts).
import type {
  AccessoryId, ActivityLog, ChatTurn, Lang, Message, ThreadKind, Patient, PatientSummary, PetChoice, PetMood, SafetyFlag, ShiftInfo,
} from './types';
import type { KeepsakeId, ProgressResult, RegionId } from './progression';
import type { PatientBenchmark, UnitMetrics } from './benchmarks';

export type BoardPatient = PatientSummary & {
  /** This shift's activity (not rejected), oldest first. */
  shiftLogs: ActivityLog[];
};

export interface BoardView {
  now: number;
  shift: ShiftInfo;
  patients: BoardPatient[];
}

export interface ProgressionView {
  steps: number;
  region: RegionId;
  stage: 1 | 2 | 3 | 4;
  accessories: AccessoryId[];
  keepsakes: KeepsakeId[];
}

export interface PatientView {
  now: number;
  shift: ShiftInfo;
  patient: Patient;
  summary: PatientSummary;
  progression: ProgressionView;
  logs: ActivityLog[];
  flags: SafetyFlag[];
  /** Messages to the patient from family and the care team, for the pet to deliver. */
  messages: Message[];
  chat: ChatTurn[];
}

export interface LogResponse {
  log: ActivityLog;
  progression: ProgressResult;
  goalJustMet: boolean;
  view: PatientView;
}

/** Family view: companion, journey and messages only. No clinical details. */
export interface FamilyView {
  now: number;
  patientId: string;
  firstName: string;
  pet: PetChoice | null;
  mood: PetMood;
  progression: ProgressionView;
  language: Lang;
  /** Present only when walking is part of the nurse's current goal. */
  walkTogether: { needsStaff: boolean } | null;
  messages: Pick<Message, 'id' | 'at' | 'from' | 'fromRole' | 'kind' | 'body' | 'deliveredAt'>[];
}

/** A message as one viewer sees it (server/messages.ts messageFor). */
export type MessageView = Omit<Message, 'readBy'> & { mine: boolean; read: boolean };

export interface ThreadSummary {
  id: string;
  kind: ThreadKind;
  patientId: string | null;
  title: string;
  lastAt: number | null;
  lastPreview: string | null;
  unread: number;
}

export interface ThreadView {
  id: string;
  kind: ThreadKind;
  patientId: string | null;
  messages: MessageView[];
}

export interface SendMessageResponse {
  message: MessageView;
  action: 'call-button' | null;
}

export interface BenchmarksView {
  now: number;
  metrics: UnitMetrics;
  patients: PatientBenchmark[];
}
