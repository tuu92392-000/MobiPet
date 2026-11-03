import { Armchair, BedSingle, Footprints, PersonStanding, type LucideIcon } from 'lucide-react';
import type { Level } from '@shared/types';
import type { PatientView } from '@shared/api';
import { allowedActivityLevels, JHHLM } from '@shared/jhhlm';
import type { Translate } from '../../i18n';

const ICONS: Partial<Record<Level, LucideIcon>> = {
  3: BedSingle, 4: Armchair, 5: PersonStanding, 6: Footprints, 7: Footprints, 8: Footprints,
};

interface Props {
  view: PatientView;
  t: Translate;
  busy: boolean;
  onLog: (level: Level) => void;
}

export function ActivityButtons({ view, t, busy, onLog }: Props) {
  const { patient } = view;
  const levels = allowedActivityLevels(patient.goal);
  if (levels.length === 0) return null;
  const lang = patient.settings.language;

  return (
    <section aria-labelledby="activity-title" className="rounded-blob border-2 border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="activity-title" className="font-display text-2xl font-extrabold">{t('activity.title')}</h2>
        <p className="text-base text-muted">{t('activity.hint')}</p>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {levels.map((level) => {
          const Icon = ICONS[level] ?? Footprints;
          const isGoal = level === patient.goal.level;
          return (
            // aria-disabled (not disabled) while saving, so keyboard focus stays on the button.
            <button
              key={level}
              aria-disabled={busy}
              onClick={() => !busy && onLog(level)}
              className={`relative flex min-h-[3.25rem] items-center gap-3 rounded-2xl border-4 px-3 py-2 text-left text-base font-bold leading-tight transition-colors aria-disabled:opacity-60 ${
                isGoal ? 'border-sage-deep bg-sage/50 hover:bg-sage sm:col-span-2' : 'border-line bg-cream hover:bg-sage/30'
              }`}
            >
              <Icon aria-hidden size={28} className="shrink-0" />
              <span>{JHHLM[level].done![lang]}</span>
              {isGoal && (
                <span className="ml-auto shrink-0 rounded-full bg-sage-deep px-3 py-0.5 text-base text-cream">{t('activity.goalTag')}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
