import { KEEPSAKES, type KeepsakeId } from '@shared/progression';
import type { Translate } from '../i18n';
import { Modal } from '../components/Modal';
import { KeepsakeIcon } from './KeepsakeIcon';

export function KeepsakeShelf({ open, found, t, onClose }: { open: boolean; found: KeepsakeId[]; t: Translate; onClose: () => void }) {
  const have = new Set(found);
  return (
    <Modal open={open} onClose={onClose} labelledBy="shelf-title" describedBy="shelf-intro">
      <div className="p-6">
        <h2 id="shelf-title" className="font-display text-3xl font-extrabold">{t('shelf.title')}</h2>
        <p id="shelf-intro" className="text-lg">{t('shelf.intro')}</p>
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {KEEPSAKES.map((k) => (
            <li
              key={k.id}
              className={`flex flex-col items-center rounded-2xl border-4 p-2 text-center ${
                have.has(k.id) ? 'border-sage-deep/40 bg-cream' : 'border-dashed border-line'
              }`}
            >
              {have.has(k.id) ? (
                <>
                  <KeepsakeIcon id={k.id} size={44} />
                  <span className="mt-1 text-base font-bold leading-tight">{t(`keepsake.${k.id}`)}</span>
                </>
              ) : (
                <>
                  <span className="flex h-11 w-11 items-center justify-center font-display text-2xl font-extrabold text-muted" aria-hidden>?</span>
                  <span className="mt-1 text-base leading-tight text-muted">{t('keepsake.hidden')}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-lg text-muted">{t('shelf.hint')}</p>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="min-h-tap rounded-full bg-sage-deep px-10 text-xl font-bold text-cream">{t('shelf.close')}</button>
        </div>
      </div>
    </Modal>
  );
}
