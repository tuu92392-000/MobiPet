import { Check, Moon, StickyNote, Volume2 } from 'lucide-react';
import type { PatientView } from '@shared/api';
import { goalText, isRestGoal } from '@shared/jhhlm';
import { progressWords } from '@shared/progression';
import type { Translate } from '../../i18n';
import { canSpeak, speak } from '../../lib/voice';

export function GoalCard({ view, t }: { view: PatientView; t: Translate }) {
  const { patient, summary } = view;
  const lang = patient.settings.language;
  const text = goalText(patient.goal, lang, patient.pet?.name);
  const rest = isRestGoal(patient.goal);
  const words = progressWords(summary.progress, patient.goal.reps);
  const petName = patient.pet?.name ?? 'Pip';
  const status = words === 'met' ? t('goal.met') : words === 'partway' ? t('goal.partway') : t('goal.notStarted', { pet: petName });

  return (
    <section aria-labelledby="goal-title" className="rounded-blob border-2 border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="goal-title" className="font-display text-2xl font-extrabold">
          {rest ? t('goal.rest') : t('goal.title')}
        </h2>
        {canSpeak && (
          <button
            onClick={() => speak(text, lang)}
            aria-label={t('goal.readAloud')}
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full border-2 border-line hover:bg-sky/40"
          >
            <Volume2 aria-hidden size={26} />
          </button>
        )}
      </div>
      <p className="mt-2 text-xl leading-snug">{text}</p>

      {rest ? (
        <p className="mt-4 flex items-center gap-2 text-lg text-sky-deep">
          <Moon aria-hidden /> {t('mood.rest', { pet: petName })}
        </p>
      ) : (
        <div className="mt-3">
          {/* Filled path pieces show progress without numbers; the words say the same for screen readers. */}
          <ol className="flex gap-2" aria-label={status}>
            {Array.from({ length: patient.goal.reps }, (_, i) => {
              const done = i < summary.progress;
              return (
                <li
                  key={i}
                  className={`flex h-12 flex-1 items-center justify-center rounded-full border-4 ${
                    done ? 'border-sage-deep bg-sage' : 'border-dashed border-line bg-cream'
                  }`}
                >
                  {done && <Check aria-hidden size={30} strokeWidth={3} className="text-sage-deep" />}
                </li>
              );
            })}
          </ol>
          <p className={`mt-2 text-lg font-bold ${words === 'met' ? 'text-sage-deep' : ''}`} aria-hidden>
            {status}
          </p>
        </div>
      )}

      {patient.nurseNote && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-sky/40 p-3">
          <StickyNote aria-hidden className="mt-1 shrink-0 text-sky-deep" />
          <p className="text-lg">
            <span className="font-bold">{t('note.fromNurse')}: </span>
            {patient.nurseNote.text}
          </p>
        </div>
      )}
    </section>
  );
}
