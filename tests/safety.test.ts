import { describe, expect, it } from 'vitest';
import { checkOutput, checkSymptoms, isMedicalQuestion } from '../shared/safety';

describe('symptom check (runs before any AI call)', () => {
  it.each([
    ['I feel dizzy', 'dizzy'],
    ['my chest feels tight', 'chest'],
    ['I’m short of breath', 'breathing'],
    ['I can’t breathe', 'breathing'], // curly apostrophe
    ['I cant breathe', 'breathing'],
    ['I fell in the bathroom', 'fall'],
    ['there is blood on my bandage', 'bleeding'],
    ['it hurts when I stand', 'pain'],
    ['I feel lightheaded', 'dizzy'],
    ['Me siento mareado', 'dizzy'],
    ['Me duele el pecho', 'pain'],
    ['tengo falta de aire', 'breathing'],
    ['Me caí', 'fall'],
    ['estoy sangrando', 'bleeding'],
  ])('flags “%s”', (text, rule) => {
    const r = checkSymptoms(text);
    expect(r.triggered).toBe(true);
    expect(r.rule).toBe(rule);
  });

  it.each(['I walked to the window!', 'What is my goal?', 'Can we do a breathing break?', 'I feel great today', '¿Cuál es mi meta?'])(
    'does not flag “%s”',
    (text) => expect(checkSymptoms(text).triggered).toBe(false),
  );
});

describe('output check (blocks unsafe AI replies)', () => {
  it('blocks medications and doses', () => {
    expect(checkOutput('Take 5 mg before you walk.', 8).reason).toBe('medication');
    expect(checkOutput('Ask about your pills later!', 8).reason).toBe('medication');
    expect(checkOutput('Toma tus pastillas primero.', 8).reason).toBe('medication');
  });

  it('blocks diagnoses', () => {
    expect(checkOutput('Walking helps prevent rejection.', 8).reason).toBe('diagnosis');
    expect(checkOutput('Esto ayuda con la neumonía.', 8).reason).toBe('diagnosis');
  });

  it('blocks exercise that is never part of a goal', () => {
    expect(checkOutput('Try the stairs today!', 8).reason).toBe('exercise-out-of-level');
    expect(checkOutput('Let’s go for a run!', 8).reason).toBe('exercise-out-of-level');
  });

  it('blocks activity above the nurse-set level', () => {
    expect(checkOutput('Let’s walk to the hallway!', 5).reason).toBe('exercise-out-of-level');
    expect(checkOutput('Can you stand up for me?', 4).reason).toBe('exercise-out-of-level');
    expect(checkOutput('Let’s walk to the hallway!', 7).ok).toBe(true);
  });

  it('requires a nurse reminder for needs-assist patients', () => {
    expect(checkOutput('You can stand for a minute!', 5, 'needs-assist').reason).toBe('assist-reminder-missing');
    expect(checkOutput('Call your nurse, then stand for a minute!', 5, 'needs-assist').ok).toBe(true);
    expect(checkOutput('Llama a tu enfermera y luego ponte de pie.', 5, 'needs-assist').ok).toBe(true);
  });

  it('lets ordinary encouragement through', () => {
    expect(checkOutput('You are doing great, Marigold. I’m proud of you!', 7).ok).toBe(true);
  });
});

describe('medical questions always go to the nurse', () => {
  it.each(['When can I go home?', 'Can I have more pain medicine?', 'What did my x-ray show?', '¿Cuándo me dan de alta?', '¿Puedo comer?'])(
    'routes “%s”',
    (text) => expect(isMedicalQuestion(text)).toBe(true),
  );

  it('leaves goal questions alone', () => {
    expect(isMedicalQuestion('What is my goal?')).toBe(false);
  });
});
