// The pet "delivers" messages from family and the care team one at a time, oldest first.
import { motion } from 'framer-motion';
import type { Message, PetChoice } from '@shared/types';
import type { MsgKey, Translate } from '../../i18n';
import { Modal } from '../../components/Modal';
import { Sticker } from '../../family/Sticker';
import { PetSvg } from '../../pets/PetSvg';

interface Props {
  message: Message | null;
  pet: PetChoice;
  t: Translate;
  onDone: (id: string) => void;
}

export function messageText(m: Pick<Message, 'kind' | 'body' | 'from'>, t: Translate): string {
  return m.kind === 'sticker'
    ? t('delivery.sticker', { from: m.from, sticker: t(`family.stickerName.${m.body}` as MsgKey).toLowerCase() })
    : `${t('delivery.from', { from: m.from })}: ${m.body}`;
}

export function MessageDelivery({ message, pet, t, onDone }: Props) {
  return (
    <Modal open={message !== null} onClose={() => message && onDone(message.id)} labelledBy="delivery-title">
      {message && (
        <div className="flex flex-col items-center p-6 text-center">
          <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
            <PetSvg species={pet.species} palette={pet.palette} mood="excited" accessory={pet.accessory} action="bounce" label="" className="h-28 w-28" />
          </motion.div>
          <h2 id="delivery-title" className="mt-1 font-display text-3xl font-extrabold">{t('delivery.title', { pet: pet.name })}</h2>
          <motion.div
            initial={{ y: 20, opacity: 0, rotate: -3 }}
            animate={{ y: 0, opacity: 1, rotate: -1.5 }}
            transition={{ delay: 0.3 }}
            className="mt-4 w-full rounded-3xl border-4 border-coral bg-cream p-5 shadow-md"
          >
            {message.kind === 'sticker' ? (
              <div className="flex flex-col items-center gap-2">
                <Sticker id={message.body} size={96} />
                <p className="text-xl">{messageText(message, t)}</p>
              </div>
            ) : (
              <>
                <p className="font-display text-2xl font-extrabold">“{message.body}”</p>
                <p className="mt-2 text-xl text-muted">{t('delivery.from', { from: message.from })}</p>
              </>
            )}
          </motion.div>
          <button autoFocus onClick={() => onDone(message.id)} className="mt-6 min-h-[3.5rem] rounded-full bg-sage-deep px-12 text-xl font-bold text-cream">
            {t('delivery.thanks')}
          </button>
        </div>
      )}
    </Modal>
  );
}
