// A gentle, dismissible nudge from the pet. Never blocks the screen; can be snoozed for an hour.
import { motion } from 'framer-motion';
import type { PetChoice } from '@shared/types';
import type { Translate } from '../../i18n';
import { PetSvg } from '../../pets/PetSvg';

interface Props {
  nudge: { id: string; text: string };
  pet: PetChoice;
  t: Translate;
  onDismiss: (snooze: boolean) => void;
}

export function NudgeCard({ nudge, pet, t, onDismiss }: Props) {
  return (
    <motion.aside
      key={nudge.id}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      aria-label={t('nudge.label', { pet: pet.name })}
      className="fixed bottom-4 left-4 z-40 flex max-w-[min(32rem,calc(100%-9rem))] items-start gap-3 rounded-blob border-4 border-sage-deep bg-paper p-4 shadow-xl"
    >
      <PetSvg species={pet.species} palette={pet.palette} mood="curious" accessory={pet.accessory} label="" className="h-16 w-16 shrink-0" />
      <div>
        <p role="status" className="text-xl">{nudge.text}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => onDismiss(false)} className="min-h-tap rounded-full bg-sage-deep px-6 text-lg font-bold text-cream">{t('nudge.ok')}</button>
          <button onClick={() => onDismiss(true)} className="min-h-tap rounded-full border-4 border-line px-5 text-lg font-bold">{t('nudge.snooze')}</button>
        </div>
      </div>
    </motion.aside>
  );
}
