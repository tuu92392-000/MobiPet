// Every AI input/output pair (and every guardrail decision) is logged for nurse review.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newId } from '../seed';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'mobipet-ai-log.json');
const KEEP = 1000;

export interface AiLogEntry {
  id: string;
  at: number;
  fn: 'petCoach' | 'nudge' | 'unitSummary' | 'familyMessageFilter';
  patientId: string | null;
  /** 'ai' = model answered; 'template' = no key, muted, rule route, or fallback; 'safety' = symptom escalation, no AI call. */
  mode: 'ai' | 'template' | 'safety';
  /** Which guardrail fired, if any (e.g. "symptom:dizzy", "output:medication", "ai-error:api-529"). */
  guardrail: string | null;
  input: unknown;
  rawOutput: string | null;
  output: string;
  latencyMs: number;
}

let entries: AiLogEntry[] = load();
let timer: NodeJS.Timeout | null = null;

function load(): AiLogEntry[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as AiLogEntry[];
  } catch {
    return [];
  }
}

export function logAi(entry: Omit<AiLogEntry, 'id'>): AiLogEntry {
  const full = { id: newId('ai'), ...entry };
  entries.push(full);
  if (entries.length > KEEP) entries = entries.slice(-KEEP);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(entries, null, 2));
  }, 200);
  return full;
}

export function aiLogFor(patientId: string): AiLogEntry[] {
  return entries.filter((e) => e.patientId === patientId).slice(-100);
}

export function clearAiLog() {
  entries = [];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, '[]');
}
