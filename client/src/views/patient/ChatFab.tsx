// Floating "Talk to {pet}" button, fixed to the bottom-right corner. It shows the pet's face and
// pulses gently only when the pet has a new nudge (never under reduced motion).
// A small "Hide" control slides it into a slim "Chat" tab on the right edge; tapping the tab brings it back.
// A speech bubble introduces the chat helper once each time the patient view opens.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { PetChoice } from '@shared/types';
import type { Translate } from '../../i18n';
import { PetSvg } from '../../pets/PetSvg';

const BUBBLE_MS = 8000;

interface Props {
  pet: PetChoice;
  t: Translate;
  hasNudge: boolean;
  open: boolean;
  onOpen: () => void;
  hidden: boolean;
  onHide: () => void;
  onShow: () => void;
  bubble: boolean;
  onBubbleDone: () => void;
}

export const ChatFab = forwardRef<HTMLButtonElement, Props>(function ChatFab(
  { pet, t, hasNudge, open, onOpen, hidden, onHide, onShow, bubble, onBubbleDone },
  ref,
) {
  const reduce = useReducedMotion();
  const fab = useRef<HTMLButtonElement>(null);
  const tab = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  useImperativeHandle(ref, () => fab.current as HTMLButtonElement, [hidden]);

  // After Hide or Show, keep keyboard focus on whichever control is now on screen.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (hidden ? tab : fab).current?.focus();
  }, [hidden]);

  useEffect(() => {
    if (!bubble) return;
    const timer = window.setTimeout(onBubbleDone, BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  // Slide only when the patient just pressed Hide or Show, never on first render or under reduced motion.
  const slide = !reduce && toggled.current;

  if (hidden) {
    return (
      <motion.button
        ref={tab}
        key="tab"
        initial={slide ? { x: 64 } : false}
        animate={{ x: 0 }}
        onClick={() => {
          toggled.current = true;
          onShow();
        }}
        aria-label={t('chat.show')}
        className="fixed bottom-5 right-0 z-30 flex w-16 flex-col items-center gap-1 rounded-l-2xl border-4 border-r-0 border-sage-deep bg-paper py-2 text-base font-bold shadow-lg hover:bg-sage/30 focus-visible:outline-offset-[-6px]"
      >
        <PetSvg species={pet.species} palette={pet.palette} mood="happy" accessory={pet.accessory} label="" className="h-10 w-10" />
        <span aria-hidden>{t('chat.tab')}</span>
      </motion.button>
    );
  }

  return (
    <motion.div key="fab" initial={slide ? { x: 120 } : false} animate={{ x: 0 }} className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2">
      <AnimatePresence>
        {bubble && !open && (
          <motion.div
            key="bubble"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-full right-0 mb-2 flex w-64 items-start gap-1 rounded-3xl rounded-br-md border-4 border-sage-deep bg-paper p-1 shadow-xl"
          >
            <button onClick={onOpen} className="min-h-tap flex-1 rounded-2xl px-3 py-2 text-left text-lg font-bold leading-snug">
              {t('chat.bubble', { pet: pet.name })}
            </button>
            <button
              onClick={onBubbleDone}
              aria-label={t('chat.bubbleClose')}
              className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-full hover:bg-line/50"
            >
              <X aria-hidden size={22} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => {
          toggled.current = true;
          onHide();
        }}
        aria-label={t('chat.hide')}
        className="min-h-tap rounded-full border-2 border-line bg-paper px-4 text-base font-bold shadow hover:bg-line/50"
      >
        <span aria-hidden>{t('chat.hideShort')}</span>
      </button>
      <button
        ref={fab}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hasNudge ? t('chat.fabLabelNudge', { pet: pet.name }) : t('chat.fabLabel', { pet: pet.name })}
        className={`relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-sage-deep bg-paper shadow-xl hover:bg-sage/30 ${
          hasNudge ? 'pulse-ring' : ''
        }`}
      >
        <PetSvg species={pet.species} palette={pet.palette} mood={hasNudge ? 'curious' : 'happy'} accessory={pet.accessory} label="" className="h-20 w-20" />
        {hasNudge && <span aria-hidden className="absolute right-1 top-1 h-5 w-5 rounded-full border-2 border-paper bg-coral-deep" />}
      </button>
    </motion.div>
  );
});
