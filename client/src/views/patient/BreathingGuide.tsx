// Guided breathing break: 4 seconds in, 4 seconds out, three rounds. The pet breathes along.
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { PetChoice } from '@shared/types';
import type { Translate } from '../../i18n';
import { Modal } from '../../components/Modal';
import { PetSvg } from '../../pets/PetSvg';

const PHASE_MS = 4000;
const ROUNDS = 3;

export function BreathingGuide({ open, pet, t, onClose }: { open: boolean; pet: PetChoice; t: Translate; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0); // even = in, odd = out

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const timer = window.setInterval(() => setStep((s) => s + 1), PHASE_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  const done = step >= ROUNDS * 2;
  const inhale = step % 2 === 0;
  const label = done ? t('breathing.done') : inhale ? t('breathing.in') : t('breathing.out');

  return (
    <Modal open={open} onClose={onClose} labelledBy="breathing-title" fullScreen>
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-sky/30 p-6 text-center">
        <h2 id="breathing-title" className="font-display text-3xl font-extrabold">{t('breathing.title')}</h2>
        <div className="relative flex h-72 w-72 items-center justify-center">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full bg-paper"
            animate={reduce || done ? { scale: 0.85 } : { scale: inhale ? 1 : 0.7 }}
            transition={{ duration: PHASE_MS / 1000, ease: 'easeInOut' }}
          />
          <PetSvg species={pet.species} palette={pet.palette} mood={done ? 'happy' : 'curious'} accessory={pet.accessory} breathing={!done} label="" className="relative h-56 w-56" />
        </div>
        <p aria-live="assertive" className="font-display text-4xl font-extrabold">{label}</p>
        <button autoFocus onClick={onClose} className="mt-2 min-h-[3.5rem] rounded-full border-4 border-ink bg-paper px-10 text-xl font-bold">
          {done ? t('chat.close') : t('breathing.stop')}
        </button>
      </div>
    </Modal>
  );
}
