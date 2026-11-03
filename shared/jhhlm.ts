// Johns Hopkins Highest Level of Mobility (JH-HLM) scale and plain-language goal text.
import type { Clearance, Goal, Lang, Level } from './types';

interface LevelInfo {
  /** Clinical label for the nurse view. */
  nurse: string;
  /** "I did it!" button label, past tense. Levels 1–2 have none. */
  done: Record<Lang, string> | null;
  /** Goal phrase used in "Your goal this shift: …". */
  goal: Record<Lang, string>;
}

export const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const JHHLM: Record<Level, LevelInfo> = {
  1: {
    nurse: 'Lying in bed',
    done: null,
    goal: { en: 'rest in bed', es: 'descansar en la cama' },
  },
  2: {
    nurse: 'Bed activities',
    done: null,
    goal: { en: 'move gently in bed', es: 'moverte suavemente en la cama' },
  },
  3: {
    nurse: 'Sit at edge of bed',
    done: { en: 'Sat at edge of bed', es: 'Me senté en el borde de la cama' },
    goal: { en: 'sit at the edge of your bed', es: 'sentarte en el borde de la cama' },
  },
  4: {
    nurse: 'Transfer to chair/commode',
    done: { en: 'Moved to chair', es: 'Me pasé a la silla' },
    goal: { en: 'move to your chair', es: 'pasarte a la silla' },
  },
  5: {
    nurse: 'Stand ≥ 1 minute',
    done: { en: 'Stood for 1 minute', es: 'Estuve de pie 1 minuto' },
    goal: { en: 'stand up for 1 minute', es: 'ponerte de pie por 1 minuto' },
  },
  6: {
    nurse: 'Walk 10+ steps',
    done: { en: 'Walked 10 steps', es: 'Caminé 10 pasos' },
    goal: { en: 'walk 10 steps', es: 'caminar 10 pasos' },
  },
  7: {
    nurse: 'Walk 25+ feet',
    done: { en: 'Walked 25 feet', es: 'Caminé 25 pies' },
    goal: { en: 'walk to the hallway (25 feet)', es: 'caminar hasta el pasillo (25 pies)' },
  },
  8: {
    nurse: 'Walk 250+ feet',
    done: { en: 'Walked 250+ feet', es: 'Caminé 250+ pies' },
    goal: { en: 'walk down the hall (250 feet or more)', es: 'caminar por el pasillo (250 pies o más)' },
  },
};

/** Levels 1–2 are rest goals: no activity buttons, the pet rests too. */
export function isRestGoal(goal: Pick<Goal, 'level'>): boolean {
  return goal.level <= 2;
}

function times(reps: number, lang: Lang): string {
  if (lang === 'es') return reps === 1 ? '1 vez' : `${reps} veces`;
  return reps === 1 ? 'once' : `${reps} times`;
}

/** e.g. "Your goal this shift: walk to the hallway (25 feet) 2 times." */
export function goalText(goal: Pick<Goal, 'level' | 'reps'>, lang: Lang, petName = 'Pip'): string {
  if (isRestGoal(goal)) {
    return lang === 'es'
      ? `Tu meta este turno: descansar y moverte suavemente en la cama. ${petName} descansa contigo.`
      : `Your goal this shift: rest and move gently in bed. ${petName} is resting with you.`;
  }
  const phrase = JHHLM[goal.level].goal[lang];
  return lang === 'es'
    ? `Tu meta este turno: ${phrase} ${times(goal.reps, lang)}.`
    : `Your goal this shift: ${phrase} ${times(goal.reps, lang)}.`;
}

/** Activities the patient may log: level 3 up to the nurse-set goal level. */
export function allowedActivityLevels(goal: Pick<Goal, 'level'>): Level[] {
  return LEVELS.filter((l) => l >= 3 && l <= goal.level);
}

/**
 * Needs-assist patients must confirm their nurse is present before any activity
 * that involves standing. A chair transfer (4) requires standing to pivot, so it is gated too.
 */
export function requiresAssistGate(level: Level, clearance: Clearance): boolean {
  return clearance === 'needs-assist' && level >= 4;
}
