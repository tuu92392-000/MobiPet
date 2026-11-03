// Guardrail pipeline for every AI function.
// Patient messages: 1) rule-based symptom check (escalates, no AI) → 2) rule routes (medical questions)
// → 3) AI call (or template) → 4) output check (blocks medical/out-of-level content) → log.
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatTurn, Lang, Patient } from '../../shared/types';
import { summarize } from '../../shared/derive';
import { goalText, isRestGoal, JHHLM } from '../../shared/jhhlm';
import { progressWords, regionAt } from '../../shared/progression';
import { checkOutput, checkSymptoms, isMedicalQuestion, normalize } from '../../shared/safety';
import type { UnitFact } from '../../shared/unitFacts';
import { getDB, mutate, now } from '../store';
import { newId } from '../seed';
import { AIUnavailable, aiMode, complete } from './client';
import { logAi, type AiLogEntry } from './log';
import * as prompts from './prompts';
import { progressPhrase, template, type TemplateKey } from './templates';

const PET_KIND = {
  nimbus: 'a soft little cloud puff',
  mossback: 'a small turtle with a mossy shell',
  glimkit: 'a small fox-like friend with a glowing lantern tail',
} as const;

const REGION_NAME = {
  room: 'Hospital Room', garden: 'Hallway Garden', meadow: 'Window Meadow',
  river: 'Riverside Path', hilltop: 'Hilltop', home: 'Home',
} as const;

function coachContext(p: Patient): prompts.CoachContext {
  const db = getDB();
  const s = summarize(p, db.logs, db.flags, db.messages, now());
  return {
    firstName: p.firstName,
    petName: p.pet?.name ?? 'Pip',
    petKind: PET_KIND[p.pet?.species ?? 'nimbus'],
    language: p.settings.language,
    goal: goalText(p.goal, p.settings.language, p.pet?.name),
    progress: progressWords(s.progress, p.goal.reps),
    restGoal: isRestGoal(p.goal),
    needsAssist: p.clearance === 'needs-assist',
    minutesSinceLastActivity: s.lastActivityAt === null ? null : Math.round((now() - s.lastActivityAt) / 60_000),
    journeyRegion: REGION_NAME[regionAt(p.journeySteps)],
    motivators: p.motivators,
  };
}

/** Keep replies to two sentences and a readable length, whatever the model returns. */
export function trimReply(text: string): string {
  const clean = text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) ?? [clean];
  let out = sentences
    .slice(0, 2)
    .map((s) => s.trim())
    .join(' ');
  if (out.length > 300) out = `${out.slice(0, 297).replace(/\s+\S*$/, '')}…`;
  return out;
}

type Intent = 'greet' | 'goal' | 'next' | 'tired' | 'breathing' | 'cheer';

export function detectIntent(text: string): Intent {
  const t = normalize(text);
  if (/\b(breath\w*|breathe|relax\w*|calm|anxious|nervous|respir\w*|relaj\w*|calma|nervios\w*)\b/.test(t)) return 'breathing';
  if (/\b(tired|exhausted|sleepy|bad day|not today|can'?t today|rest|cansad[oa]|agotad[oa]|sueno|descansar|hoy no)\b/.test(t)) return 'tired';
  if (/\b(next|what now|what should i do|siguiente|que hago|ahora que)\b/.test(t)) return 'next';
  if (/\b(goal|meta|objetivo|plan)\b/.test(t)) return 'goal';
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|hola|buenos|buenas)\b/.test(t)) return 'greet';
  return 'cheer';
}

function templateFor(p: Patient, intent: Intent): string {
  const lang = p.settings.language;
  const ctx = coachContext(p);
  const vars = { name: p.firstName, goal: ctx.goal, progress: progressPhrase(lang, ctx.progress), phrase: JHHLM[p.goal.level].goal[lang] };
  const met = !ctx.restGoal && ctx.progress === 'met';
  let key: TemplateKey;
  switch (intent) {
    case 'greet': key = 'greet'; break;
    case 'goal': key = ctx.restGoal ? 'goalRest' : met ? 'goalMet' : 'goal'; break;
    case 'next': key = ctx.restGoal ? 'goalRest' : met ? 'goalMet' : ctx.needsAssist && p.goal.level >= 4 ? 'nextAssist' : 'next'; break;
    case 'tired': key = 'tired'; break;
    case 'breathing': key = 'breathing'; break;
    default: key = ctx.progress !== 'not-started' ? 'cheer' : 'fallback';
  }
  return template(lang, key, vars);
}

function toMessages(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const msgs = turns
    .filter((c) => c.kind !== 'nudge')
    .slice(-8)
    .map((c): Anthropic.Beta.BetaMessageParam => ({ role: c.role === 'patient' ? 'user' : 'assistant', content: c.text }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

export interface CoachResult {
  turns: ChatTurn[];
  /** Tells the tablet to show the call-button card or start the breathing guide. */
  action: 'call-button' | 'breathing' | null;
}

const YES = /^(yes|yeah|yep|sure|ok(ay)?|please|si|claro|por favor|bueno|dale)\b/;

export async function coachReply(p: Patient, rawText: string): Promise<CoachResult> {
  const text = rawText.trim().slice(0, 500);
  const lang: Lang = p.settings.language;
  const t0 = Date.now();
  const history = getDB().chats.filter((c) => c.patientId === p.id);
  const patientTurn: ChatTurn = { id: newId('chat'), patientId: p.id, at: now(), role: 'patient', text, kind: 'chat' };

  const finish = (reply: string, mode: AiLogEntry['mode'], guardrail: string | null, input: unknown, rawOutput: string | null, action: CoachResult['action']) => {
    const entry = logAi({ at: now(), fn: 'petCoach', patientId: p.id, mode, guardrail, input, rawOutput, output: reply, latencyMs: Date.now() - t0 });
    const petTurn: ChatTurn = { id: newId('chat'), patientId: p.id, at: now(), role: 'pet', text: reply, mode, guardrail, kind: 'chat', aiLogId: entry.id };
    mutate('chat', p.id, (db) => db.chats.push(patientTurn, petTurn));
    return { turns: [patientTurn, petTurn], action };
  };

  // 1. Symptoms: stop coaching, show the call-button card, flag the nurse. No AI call.
  const symptom = checkSymptoms(text);
  if (symptom.triggered) {
    mutate('flag', p.id, (db) => {
      db.flags.push({ id: newId('flag'), patientId: p.id, at: patientTurn.at, text, source: 'chat', matched: symptom.matched, acknowledgedAt: null });
    });
    return finish(template(lang, 'safety'), 'safety', `symptom:${symptom.rule}`, { text }, null, 'call-button');
  }

  // 2a. "Yes, remind my nurse" right after a medical redirect.
  const lastPet = [...history].reverse().find((c) => c.role === 'pet');
  if (lastPet?.guardrail === 'route:medical-question' && YES.test(normalize(text))) {
    const question = [...history].reverse().find((c) => c.role === 'patient')?.text ?? '';
    mutate('patient', p.id, () => {
      p.questionForNurse = { text: question, at: now() };
    });
    return finish(template(lang, 'remindDone'), 'template', 'route:remind-nurse', { text }, null, null);
  }

  // 2b. Medical questions always go to the nurse, in every mode.
  if (isMedicalQuestion(text)) {
    return finish(template(lang, 'medical'), 'template', 'route:medical-question', { text }, null, null);
  }

  const intent = detectIntent(text);
  const action = intent === 'breathing' ? 'breathing' : null;

  // 3. Template mode: no key, or the nurse muted AI coaching for this patient.
  if (aiMode() === 'template' || p.aiCoachingMuted) {
    return finish(templateFor(p, intent), 'template', p.aiCoachingMuted ? 'muted-by-nurse' : null, { text, intent }, null, action);
  }

  const ctx = coachContext(p);
  const messages = toMessages([...history, patientTurn]);
  const input = { promptName: 'petCoach', context: ctx, messages };
  let raw: string;
  try {
    raw = await complete({ system: prompts.petCoach(ctx), messages });
  } catch (e) {
    const reason = e instanceof AIUnavailable ? e.message : 'unknown';
    return finish(templateFor(p, intent), 'template', `ai-error:${reason}`, input, null, action);
  }

  // 4. Output check: substitute a safe template if the reply drifts out of bounds.
  const reply = trimReply(raw);
  const check = checkOutput(reply, p.goal.level, p.clearance);
  if (!check.ok) return finish(template(lang, 'blocked'), 'template', `output:${check.reason}`, input, raw, action);
  return finish(reply, 'ai', null, input, raw, action);
}

export type NudgeTrigger = 'meal' | 'idle';
export const NUDGE_GAP_MS = 60 * 60_000;
const IDLE_MS = 2 * 60 * 60_000;

/** Why a nudge would not be shown right now, or null if it may be. */
export function nudgeBlocker(p: Patient, trigger: NudgeTrigger): string | null {
  const db = getDB();
  const t = now();
  const s = summarize(p, db.logs, db.flags, db.messages, t);
  if (!p.pet) return 'no-pet';
  if (p.activeNudge) return 'already-showing';
  if (p.nudgesPausedUntil && p.nudgesPausedUntil > t) return 'paused-by-nurse';
  if (p.nudgeSnoozedUntil && p.nudgeSnoozedUntil > t) return 'snoozed';
  if (p.lastNudgeAt && t - p.lastNudgeAt < NUDGE_GAP_MS) return 'max-one-per-hour';
  if (isRestGoal(p.goal)) return 'rest-goal';
  if (s.status === 'goal-met') return 'goal-met';
  if (s.openFlagCount > 0) return 'open-safety-flag';
  if (new Date(t).getHours() >= 23 || new Date(t).getHours() < 7) return 'night';
  if (trigger === 'idle' && s.lastActivityAt !== null && t - s.lastActivityAt < IDLE_MS) return 'recently-active';
  return null;
}

export async function makeNudge(p: Patient, trigger: NudgeTrigger): Promise<{ text: string; mode: 'ai' | 'template' } | { skipped: string }> {
  const blocker = nudgeBlocker(p, trigger);
  if (blocker) return { skipped: blocker };
  const t0 = Date.now();
  const lang = p.settings.language;
  const phrase = JHHLM[p.goal.level].goal[lang];
  const fallbackText = () =>
    template(lang, trigger === 'meal' ? 'nudgeMeal' : 'nudgeIdle', { phrase }) +
    (p.clearance === 'needs-assist' && p.goal.level >= 4 ? template(lang, 'nudgeAssist') : '');

  let text = fallbackText();
  let mode: 'ai' | 'template' = 'template';
  let guardrail: string | null = p.aiCoachingMuted ? 'muted-by-nurse' : null;
  let raw: string | null = null;
  const ctx = coachContext(p);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `(Write the ${trigger} nudge now.)` }];

  if (aiMode() === 'ai' && !p.aiCoachingMuted) {
    try {
      raw = await complete({ system: prompts.nudge(ctx, trigger), messages });
      const candidate = trimReply(raw);
      const check = checkOutput(candidate, p.goal.level, p.clearance);
      if (check.ok) {
        text = candidate;
        mode = 'ai';
      } else guardrail = `output:${check.reason}`;
    } catch (e) {
      guardrail = `ai-error:${e instanceof AIUnavailable ? e.message : 'unknown'}`;
    }
  }

  const entry = logAi({ at: now(), fn: 'nudge', patientId: p.id, mode, guardrail, input: { promptName: 'nudge', trigger, context: ctx }, rawOutput: raw, output: text, latencyMs: Date.now() - t0 });
  mutate('patient', p.id, (db) => {
    const at = now();
    p.lastNudgeAt = at;
    p.activeNudge = { id: newId('nudge'), text, at };
    db.chats.push({ id: newId('chat'), patientId: p.id, at, role: 'pet', text, mode, guardrail, kind: 'nudge', aiLogId: entry.id });
  });
  return { text, mode };
}

export interface SummaryBullet {
  text: string;
  factIds: string[];
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    bullets: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, factIds: { type: 'array', items: { type: 'string' } } },
        required: ['text', 'factIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['bullets'],
  additionalProperties: false,
};

/**
 * A bullet is kept only if it cites real facts and every number in it (rooms, counts, times)
 * appears in the facts it cites. Anything else is dropped as unverifiable.
 */
export function verifyBullets(bullets: SummaryBullet[], facts: UnitFact[]): SummaryBullet[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  return bullets.filter((b) => {
    const cited = b.factIds.map((id) => byId.get(id)).filter((f): f is UnitFact => !!f);
    if (cited.length === 0 || cited.length !== b.factIds.length) return false;
    const source = cited.map((f) => `${f.text} ${f.evidence.map((e) => `${e.room} ${e.detail}`).join(' ')}`).join(' ');
    return (b.text.match(/\d+(:\d+)?/g) ?? []).every((n) => source.includes(n));
  });
}

export async function summarizeUnit(facts: UnitFact[]): Promise<{ bullets: SummaryBullet[]; mode: 'ai' | 'template'; guardrail: string | null }> {
  const t0 = Date.now();
  const templated = facts.slice(0, 4).map((f) => ({ text: f.text, factIds: [f.id] }));
  const input = { promptName: 'unitSummary', facts: facts.map((f) => ({ id: f.id, severity: f.severity, text: f.text, evidence: f.evidence })) };
  let result = { bullets: templated, mode: 'template' as 'ai' | 'template', guardrail: null as string | null };
  let raw: string | null = null;

  if (aiMode() === 'ai' && facts.length > 0) {
    try {
      raw = await complete({
        system: prompts.unitSummary,
        messages: [{ role: 'user', content: JSON.stringify(input.facts) }],
        schema: SUMMARY_SCHEMA,
      });
      const parsed = (JSON.parse(raw) as { bullets: SummaryBullet[] }).bullets.slice(0, 4);
      const verified = verifyBullets(parsed, facts);
      // Every safety flag must survive into the summary; if the AI dropped one, use the facts directly.
      const flagIds = facts.filter((f) => f.kind === 'flag').map((f) => f.id);
      const coversFlags = flagIds.every((id) => verified.some((b) => b.factIds.includes(id)));
      if (verified.length > 0 && coversFlags) {
        result = { bullets: verified, mode: 'ai', guardrail: verified.length < parsed.length ? 'dropped-unverified-bullets' : null };
      } else {
        result.guardrail = coversFlags ? 'no-verified-bullets' : 'missing-safety-flag';
      }
    } catch (e) {
      result.guardrail = `ai-error:${e instanceof AIUnavailable ? e.message : 'bad-json'}`;
    }
  }

  logAi({ at: now(), fn: 'unitSummary', patientId: null, mode: result.mode, guardrail: result.guardrail, input, rawOutput: raw, output: JSON.stringify(result.bullets), latencyMs: Date.now() - t0 });
  return result;
}

// Family message filter: fast rules first, then the AI when available.
const BLOCK_RULES: [RegExp, string][] = [
  [/https?:\/\/|www\.|\.com\b/, 'link'],
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b|@\w+\.\w+/, 'contact-info'],
  [/\b(lazy|hurry up|stop being|you should be|you need to try harder|disappointed|perezos[oa]|apurate|decepcion\w*)\b/, 'pressure-or-guilt'],
  [/\b(damn|hell|crap|stupid|idiot|shut up|maldit\w*|estupid\w*|idiota|callate)\b/, 'unkind-language'],
];

export async function filterFamilyMessage(body: string): Promise<{ ok: boolean; reason: string | null; mode: 'ai' | 'template' }> {
  const t0 = Date.now();
  const t = normalize(body);
  const ruleHit = BLOCK_RULES.find(([re]) => re.test(t))?.[1] ?? null;
  const out = checkOutput(body, 8);
  const medical = out.reason === 'medication' || out.reason === 'diagnosis' || isMedicalQuestion(body) ? 'medical-content' : null;
  let decision = { ok: !(ruleHit || medical), reason: ruleHit ?? medical, mode: 'template' as 'ai' | 'template' };
  let raw: string | null = null;

  if (decision.ok && aiMode() === 'ai') {
    try {
      raw = await complete({
        system: prompts.familyMessageFilter,
        messages: [{ role: 'user', content: body }],
        schema: {
          type: 'object',
          properties: {
            allow: { type: 'boolean' },
            reason: { type: 'string', enum: ['ok', 'medical-content', 'pressure-or-guilt', 'distressing', 'contact-info', 'unkind', 'other'] },
          },
          required: ['allow', 'reason'],
          additionalProperties: false,
        },
      });
      const parsed = JSON.parse(raw) as { allow: boolean; reason: string };
      decision = { ok: parsed.allow, reason: parsed.allow ? null : parsed.reason, mode: 'ai' };
    } catch {
      // Rules already passed; deliver rather than drop a kind message because the AI was unavailable.
    }
  }

  logAi({ at: now(), fn: 'familyMessageFilter', patientId: null, mode: decision.mode, guardrail: decision.ok ? null : `blocked:${decision.reason}`, input: { body }, rawOutput: raw, output: decision.ok ? 'allow' : 'block', latencyMs: Date.now() - t0 });
  return decision;
}
