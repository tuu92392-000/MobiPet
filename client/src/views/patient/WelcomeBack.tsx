// Plays every time the tablet wakes (PIN unlock, including after the inactivity lock): the pet wakes,
// stretches, perks up and bounces toward the patient, and says hello by first name (aloud only with read-aloud on).
// Under 3 seconds, one tap anywhere skips it, and it is a simple fade under reduced motion.
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import type { Patient } from '@shared/types';
import type { RegionId } from '@shared/progression';
import type { Translate } from '../../i18n';
import { welcomeLine } from './welcomeLines';
import { speak } from '../../lib/voice';
import { PetSvg } from '../../pets/PetSvg';

const DURATION_MS = 2800;

interface Props {
  patient: Patient;
  region: RegionId;
  t: Translate;
  onDone: () => void;
  onReadAloud: (on: boolean) => void;
}

export function WelcomeBack({ patient, region, t, onDone, onReadAloud }: Props) {
  const reduce = useReducedMotion();
  const pet = patient.pet!;
  // Chosen once per wake.
  const [line] = useState(() => welcomeLine(t, patient.settings.language, patient, region, Math.floor(Math.random() * 6)));
  const [awake, setAwake] = useState(false);
  const [soundOn, setSoundOn] = useState(patient.settings.readAloud);
  const done = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    // Focus the overlay so Esc, Enter or Space skip it from the keyboard, and screen readers start here.
    root.current?.focus();
    const wake = window.setTimeout(() => setAwake(true), reduce ? 0 : 700);
    const end = window.setTimeout(finish, DURATION_MS);
    if (patient.settings.readAloud) speak(line, patient.settings.language);
    return () => {
      window.clearTimeout(wake);
      window.clearTimeout(end);
    };
    // Runs once when the tablet wakes.
  }, []);

  function toggleSound(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !soundOn;
    setSoundOn(next);
    if (!next) window.speechSynthesis?.cancel();
    onReadAloud(next);
  }

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-line"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0.3 : 0.2 }}
      onClick={finish}
      onKeyDown={(e) => (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && finish()}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex cursor-pointer flex-col items-center justify-center bg-cream/95 p-6 text-center"
    >
      <button
        onClick={toggleSound}
        aria-pressed={!soundOn}
        aria-label={soundOn ? t('welcome.mute') : t('welcome.unmute')}
        className="absolute right-4 top-4 flex min-h-[3.5rem] min-w-[3.5rem] items-center justify-center rounded-full border-4 border-line bg-paper"
      >
        {soundOn ? <Volume2 aria-hidden size={28} /> : <VolumeX aria-hidden size={28} />}
      </button>

      <motion.div
        initial={reduce ? false : { y: 30, scaleY: 0.85, scaleX: 1.08 }}
        animate={
          reduce
            ? {}
            : {
                // Wake, stretch tall, settle, then two happy hops toward the patient.
                y: [30, 30, 10, 0, -26, 0, -14, 0],
                scaleY: [0.85, 1.12, 0.95, 1, 1, 1, 1, 1],
                scaleX: [1.08, 0.92, 1.03, 1, 1, 1, 1, 1],
                scale: [1, 1, 1, 1.05, 1.12, 1.12, 1.16, 1.16],
              }
        }
        transition={{ duration: 2.2, times: [0, 0.25, 0.38, 0.48, 0.62, 0.74, 0.86, 1], ease: 'easeOut' }}
      >
        <PetSvg
          species={pet.species}
          palette={pet.palette}
          accessory={pet.accessory}
          mood={awake ? 'excited' : 'sleepy'}
          label=""
          className="h-56 w-56"
        />
      </motion.div>

      <motion.p
        id="welcome-line"
        aria-live="assertive"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: reduce ? 0.1 : 0.8, duration: 0.3 }}
        className="relative mt-4 max-w-xl rounded-blob border-4 border-sage-deep bg-paper px-6 py-4 font-display text-3xl font-extrabold"
      >
        {line}
      </motion.p>
      <p className="mt-4 text-lg text-muted">{t('welcome.skip')}</p>
    </motion.div>
  );
}
