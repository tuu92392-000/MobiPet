// Floating "Talk to {pet}" button, fixed to the bottom-right corner. It shows the pet's face and
// pulses gently only when the pet has a new nudge (never under reduced motion).
import { forwardRef } from 'react';
import type { PetChoice } from '@shared/types';
import type { Translate } from '../../i18n';
import { PetSvg } from '../../pets/PetSvg';

interface Props {
  pet: PetChoice;
  t: Translate;
  hasNudge: boolean;
  open: boolean;
  onOpen: () => void;
}

export const ChatFab = forwardRef<HTMLButtonElement, Props>(function ChatFab({ pet, t, hasNudge, open, onOpen }, ref) {
  return (
    <button
      ref={ref}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={hasNudge ? t('chat.fabNudge', { pet: pet.name }) : t('chat.button', { pet: pet.name })}
      className={`fixed bottom-5 right-5 z-30 flex h-24 w-24 items-center justify-center rounded-full border-4 border-sage-deep bg-paper shadow-xl hover:bg-sage/30 ${
        hasNudge ? 'pulse-ring' : ''
      }`}
    >
      <PetSvg species={pet.species} palette={pet.palette} mood={hasNudge ? 'curious' : 'happy'} accessory={pet.accessory} label="" className="h-20 w-20" />
      {hasNudge && <span aria-hidden className="absolute right-1 top-1 h-5 w-5 rounded-full border-2 border-paper bg-coral-deep" />}
    </button>
  );
});
