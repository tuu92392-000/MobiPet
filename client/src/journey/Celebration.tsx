// Goal-met celebration: confetti and a cheer, under 3 seconds, skippable by tap, button, or Escape.
import { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PartyPopper } from 'lucide-react';
import type { Translate } from '../i18n';

const COLORS = ['#F6A08A', '#8DB89A', '#9CC8E8', '#F4D35E', '#D6C8EE'];
export const CELEBRATION_MS = 2800;

export function Celebration({ t, onDone }: { t: Translate; onDone: () => void }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const angle = (i / 42) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 180 + Math.random() * 220;
        return { i, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist * 0.7 + 120, rot: Math.random() * 540, color: COLORS[i % COLORS.length], round: i % 3 === 0 };
      }),
    [],
  );

  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), CELEBRATION_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20" onClick={onDone}>
      {!reduce && (
        <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
          {pieces.map((p) => (
            <motion.span
              key={p.i}
              className={`absolute block h-3 w-2 ${p.round ? 'rounded-full' : 'rounded-sm'}`}
              style={{ backgroundColor: p.color }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, rotate: p.rot }}
              transition={{ duration: 2.2, ease: [0.15, 0.7, 0.4, 1] }}
            />
          ))}
        </div>
      )}
      <motion.div
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="relative flex flex-col items-center rounded-blob bg-paper px-10 py-6 text-center shadow-2xl"
      >
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-coral/40">
          <PartyPopper aria-hidden size={40} className="text-coral-deep" />
        </span>
        <p className="mt-3 font-display text-4xl font-extrabold">{t('celebrate.title')}</p>
        <p className="text-xl">{t('celebrate.body')}</p>
        <button
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="mt-4 min-h-tap rounded-full border-4 border-line px-8 text-lg font-bold"
        >
          {t('celebrate.skip')}
        </button>
      </motion.div>
    </div>
  );
}
