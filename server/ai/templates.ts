// Pre-written messages used when no API key is set, the AI fails, or a guardrail blocks a reply.
import type { Lang } from '../../shared/types';
import type { ProgressWords } from '../../shared/progression';

type Vars = Record<string, string | number>;
const fill = (s: string, v: Vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** Exported for the no-pet-pronouns test. */
export const TEMPLATES = {
  en: {
    greet: ['Hi {name}! I’m right here with you. Want to hear your goal for this shift?'],
    goal: ['{goal} {progress}'],
    goalRest: ['Your goal right now is to rest. I’m resting right here with you.'],
    goalMet: ['You already met your goal this shift, {name}! Resting now is a great choice.'],
    next: ['Your next small step: {phrase}. I’ll cheer you on!'],
    nextAssist: ['Your next small step: {phrase}. Call your nurse first for help.'],
    cheer: [
      'You’re doing great, {name}. Every little bit counts.',
      'I’m so proud of you. Small steps add up!',
      'Look how far we’ve come together!',
    ],
    tired: ['That’s okay. Rest is part of getting better. I’ll rest right here with you.'],
    breathing: ['Let’s take a breathing break. Breathe in slowly… and out. I’ll breathe with you.'],
    medical: ['That’s a great question for your nurse. Want me to remind you to ask your nurse?'],
    remindDone: ['Okay! I let your nurse know you have a question.'],
    fallback: ['I’m here with you, {name}. Want to hear your goal, or take a breathing break?'],
    safety: ['Please press your call button now so your nurse can help you. I let your nurse know too.'],
    blocked: ['Your nurse is the best person to help with that. Want to hear your goal for this shift?'],
    nudgeMeal: ['All done with your meal? When you feel ready, let’s {phrase} together.'],
    nudgeIdle: ['I’ve been napping a while. Want to {phrase} with me when you’re ready?'],
    nudgeAssist: [' Call your nurse first.'],
  },
  es: {
    greet: ['¡Hola, {name}! Estoy aquí contigo. ¿Quieres saber tu meta de este turno?'],
    goal: ['{goal} {progress}'],
    goalRest: ['Tu meta ahora es descansar. Yo descanso aquí contigo.'],
    goalMet: ['¡Ya cumpliste tu meta de este turno, {name}! Descansar ahora es una gran idea.'],
    next: ['Tu siguiente pasito: {phrase}. ¡Yo te animo!'],
    nextAssist: ['Tu siguiente pasito: {phrase}. Llama primero a tu enfermera para que te ayude.'],
    cheer: [
      'Lo estás haciendo muy bien, {name}. Cada poquito cuenta.',
      '¡Qué orgullo me das! ¡Los pasitos suman!',
      '¡Mira cuánto hemos avanzado en el camino!',
    ],
    tired: ['Está bien. Descansar también ayuda a sanar. Yo descanso aquí contigo.'],
    breathing: ['Tomemos un descanso para respirar. Inhala despacio… y exhala. Respiro contigo.'],
    medical: ['Esa es una muy buena pregunta para tu enfermera. ¿Quieres que te recuerde preguntarle?'],
    remindDone: ['¡Ya está! Le avisé a tu enfermera que tienes una pregunta.'],
    fallback: ['Estoy aquí contigo, {name}. ¿Quieres saber tu meta o tomar un descanso para respirar?'],
    safety: ['Por favor presiona tu botón de llamada ahora para que tu enfermera te ayude. Yo también le avisé.'],
    blocked: ['Tu enfermera es la mejor persona para ayudarte con eso. ¿Quieres saber tu meta de este turno?'],
    nudgeMeal: ['¿Terminaste de comer? Cuando tengas ganas, ¡vamos a {phrase}! Te acompaño.'],
    nudgeIdle: ['Estuve tomando una siesta. Cuando tengas ganas, ¿quieres {phrase} conmigo?'],
    nudgeAssist: [' Llama primero a tu enfermera.'],
  },
} satisfies Record<Lang, Record<string, string[]>>;

export type TemplateKey = keyof (typeof TEMPLATES)['en'];

let rotation = 0;

/** Progress in words for the "goal" template. Patients never hear counts. */
const PROGRESS: Record<Lang, Record<ProgressWords, string>> = {
  en: { 'not-started': 'Whenever you’re ready, I’m ready too.', partway: 'You’re on your way. Keep it up!', met: 'And you already did it!' },
  es: { 'not-started': 'Cuando quieras empezar, aquí estoy.', partway: '¡Vas por buen camino! Sigue así.', met: '¡Y ya lo lograste!' },
};

export const progressPhrase = (lang: Lang, words: ProgressWords) => PROGRESS[lang][words];

export function template(lang: Lang, key: TemplateKey, vars: Vars = {}): string {
  const options = TEMPLATES[lang][key];
  rotation += 1;
  return fill(options[rotation % options.length], vars);
}
