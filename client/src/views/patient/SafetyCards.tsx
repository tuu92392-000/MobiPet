// Full-screen safety prompts: the assisted-standing gate and the call-button card.
import { BellRing, UserRound } from 'lucide-react';
import type { Translate } from '../../i18n';
import { Modal } from '../../components/Modal';

export function AssistGate({ open, t, onConfirm, onCancel }: { open: boolean; t: Translate; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="gate-title" describedBy="gate-body" fullScreen>
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-sky/30 p-8 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-paper shadow">
          <BellRing aria-hidden size={64} className="text-sky-deep" />
        </span>
        <h2 id="gate-title" className="font-display text-4xl font-extrabold">{t('gate.title')}</h2>
        <p id="gate-body" className="max-w-xl text-2xl">{t('gate.body')}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <button autoFocus onClick={onCancel} className="min-h-[4rem] rounded-full border-4 border-ink bg-paper px-10 text-2xl font-bold">
            {t('gate.notNow')}
          </button>
          <button onClick={onConfirm} className="flex min-h-[4rem] items-center gap-3 rounded-full bg-sage-deep px-10 text-2xl font-bold text-cream">
            <UserRound aria-hidden size={30} /> {t('gate.here')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function CallButtonCard({ open, t, onClose }: { open: boolean; t: Translate; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="help-title" describedBy="help-body" fullScreen>
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-6 bg-coral/40 p-8 text-center">
        <span className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-alert bg-paper">
          <BellRing aria-hidden size={72} className="text-alert" />
        </span>
        <h2 id="help-title" className="font-display text-5xl font-extrabold">{t('help.title')}</h2>
        <p id="help-body" className="max-w-xl text-2xl">{t('help.body')}</p>
        <button autoFocus onClick={onClose} className="min-h-[4rem] rounded-full border-4 border-ink bg-paper px-12 text-2xl font-bold">
          {t('help.ok')}
        </button>
      </div>
    </Modal>
  );
}
