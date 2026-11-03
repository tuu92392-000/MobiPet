// The patient chooses what their companion wears. Every accessory is available from the start.
import type { AccessoryId, PetChoice } from '@shared/types';
import { ACCESSORIES } from '@shared/progression';
import type { Translate } from '../i18n';
import { Modal } from '../components/Modal';
import { PetSvg } from '../pets/PetSvg';

interface Props {
  open: boolean;
  pet: PetChoice;
  stage: 1 | 2 | 3 | 4;
  t: Translate;
  onWear: (accessory: AccessoryId | null) => void;
  onClose: () => void;
}

export function Wardrobe({ open, pet, stage, t, onWear, onClose }: Props) {
  const options: (AccessoryId | null)[] = [null, ...ACCESSORIES];
  return (
    <Modal open={open} onClose={onClose} labelledBy="wardrobe-title">
      <div className="p-6">
        <h2 id="wardrobe-title" className="font-display text-3xl font-extrabold">{t('wardrobe.title', { pet: pet.name })}</h2>
        <div role="radiogroup" aria-labelledby="wardrobe-title" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {options.map((id) => {
            const wearing = pet.accessory === id;
            const name = id ? t(`accessory.${id}`) : t('wardrobe.none');
            return (
              <button
                key={id ?? 'none'}
                role="radio"
                aria-checked={wearing}
                aria-label={name}
                onClick={() => onWear(id)}
                className={`flex flex-col items-center rounded-2xl border-4 p-2 ${
                  wearing ? 'border-sage-deep bg-sage/40' : 'border-line bg-paper'
                }`}
              >
                <PetSvg
                  species={pet.species}
                  palette={pet.palette}
                  mood="happy"
                  stage={stage}
                  accessory={id}
                  label=""
                  className="h-24 w-24"
                />
                <span className="text-lg font-bold">
                  {wearing && <span aria-hidden>✓ </span>}
                  {name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="min-h-tap rounded-full bg-sage-deep px-10 text-xl font-bold text-cream">{t('wardrobe.done')}</button>
        </div>
      </div>
    </Modal>
  );
}
