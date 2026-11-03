// Browser-only demo: the AI log ("What the AI saw") kept in memory for this page. Replaces server/ai/log.ts.
import { newId } from '../../server/seed';

export interface AiLogEntry {
  id: string;
  at: number;
  fn: 'petCoach' | 'nudge' | 'unitSummary' | 'familyMessageFilter';
  patientId: string | null;
  mode: 'ai' | 'template' | 'safety';
  guardrail: string | null;
  input: unknown;
  rawOutput: string | null;
  output: string;
  latencyMs: number;
}

let entries: AiLogEntry[] = [];

export function logAi(entry: Omit<AiLogEntry, 'id'>): AiLogEntry {
  const full = { id: newId('ai'), ...entry };
  entries = [...entries.slice(-999), full];
  return full;
}

export function aiLogFor(patientId: string): AiLogEntry[] {
  return entries.filter((e) => e.patientId === patientId).slice(-100);
}

export function clearAiLog() {
  entries = [];
}
