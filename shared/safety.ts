// Rule-based safety checks. Symptom checks run BEFORE any AI call.
import type { Clearance, Level } from './types';

/** Lowercase, strip accents, normalize curly apostrophes. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase();
}

interface Rule {
  id: string;
  re: RegExp;
}

const SYMPTOM_RULES: Rule[] = [
  // English
  { id: 'pain', re: /\b(pain|pains|painful|hurts?|hurting|ache|aching)\b/ },
  { id: 'dizzy', re: /\b(dizzy|dizziness|light ?headed|faint|fainting|woozy|pass(ing)? out|spinning)\b/ },
  { id: 'breathing', re: /(short of breath|out of breath|breathless|can'?t breathe|cannot breathe|hard to breathe|trouble breathing|can'?t catch my breath|wheez)/ },
  { id: 'chest', re: /\bchest\b/ },
  { id: 'fall', re: /\b(fell|fallen|i fall|i'?m falling)\b/ },
  { id: 'bleeding', re: /\b(bleed|bleeding|blood|bloody)\b/ },
  { id: 'nausea', re: /\b(vomit|vomiting|throw(ing)? up|nauseous|nausea)\b/ },
  // Spanish (accents removed by normalize)
  { id: 'pain', re: /\b(dolor|duele|duelen|adolorid[oa])\b/ },
  { id: 'dizzy', re: /\b(mareo|mareos|maread[oa]|desmay\w*)\b/ },
  { id: 'breathing', re: /(falta de aire|no puedo respirar|me ahogo|cuesta respirar)/ },
  { id: 'chest', re: /\bpecho\b/ },
  { id: 'fall', re: /\b(me cai|caido|caida)\b/ },
  { id: 'bleeding', re: /\b(sangre|sangrando|sangrado)\b/ },
  { id: 'nausea', re: /\b(vomit\w*|nausea[s]?)\b/ },
];

export interface SymptomCheck {
  triggered: boolean;
  matched: string | null;
  rule: string | null;
}

export function checkSymptoms(text: string): SymptomCheck {
  const t = normalize(text);
  for (const rule of SYMPTOM_RULES) {
    const m = t.match(rule.re);
    if (m) return { triggered: true, matched: m[0], rule: rule.id };
  }
  return { triggered: false, matched: null, rule: null };
}

const MEDICATION = /\b(mg|milligrams?|doses?|dosage|medications?|medicines?|meds|pills?|tablets?|prescriptions?|inhalers?|tacrolimus|prednisone|ibuprofen|tylenol|acetaminophen|opioids?|steroids?|antibiotics?|medicamentos?|medicinas?|pastillas?|dosis|receta)\b/;
const DIAGNOSIS = /\b(diagnos\w*|rejection|infection|pneumonia|sepsis|cancer|clot|heart attack|stroke|copd|fibrosis|rechazo|infeccion|neumonia|coagulo|infarto|derrame)\b/;
const NEVER_EXERCISE = /\b(stairs?|staircase|jog\w*|run|running|lift\w*|weights?|squats?|push-?ups?|escaleras?|correr|pesas|sentadillas?)\b/;
const WALKING = /\b(walk\w*|caminar|camina\w*|paseo)\b/;
const STANDING = /\b(stand\w*|stood|de pie|pararte|parate|levantarte)\b/;

const MENTIONS_NURSE = /\b(nurse|enfermer[oa]s?)\b/;

export interface OutputCheck {
  ok: boolean;
  reason: 'medication' | 'diagnosis' | 'exercise-out-of-level' | 'assist-reminder-missing' | null;
}

/** Blocks AI output that drifts into medical advice or activity beyond the nurse-set level and clearance. */
export function checkOutput(text: string, goalLevel: Level, clearance: Clearance = 'independent'): OutputCheck {
  const t = normalize(text);
  if (MEDICATION.test(t)) return { ok: false, reason: 'medication' };
  if (DIAGNOSIS.test(t)) return { ok: false, reason: 'diagnosis' };
  if (NEVER_EXERCISE.test(t)) return { ok: false, reason: 'exercise-out-of-level' };
  if (goalLevel < 6 && WALKING.test(t)) return { ok: false, reason: 'exercise-out-of-level' };
  if (goalLevel < 5 && STANDING.test(t)) return { ok: false, reason: 'exercise-out-of-level' };
  // Needs-assist patients must always be told to call their nurse before standing or walking.
  if (clearance === 'needs-assist' && (WALKING.test(t) || STANDING.test(t)) && !MENTIONS_NURSE.test(t)) {
    return { ok: false, reason: 'assist-reminder-missing' };
  }
  return { ok: true, reason: null };
}

/** Questions Pip should always hand to the nurse, regardless of AI mode. */
const MEDICAL_QUESTION = /\b(medicine|medicines|medication|meds|pills?|dose|doctor|test results?|labs?|x-?ray|scan|diagnos\w*|discharged?|surgery|incision|wound|oxygen|diet|allowed to eat|can i eat|medicina|medicamentos?|pastillas?|dosis|doctora?|medico|resultados?|analisis|radiografia|diagnostico|alta|cirugia|herida|oxigeno|dieta|puedo comer)\b|when can i go home|cuando me voy a casa/;

export function isMedicalQuestion(text: string): boolean {
  return MEDICAL_QUESTION.test(normalize(text));
}
