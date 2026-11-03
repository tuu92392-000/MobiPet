// Pet setup, designed for older adults: one choice per screen with a large preview, big Back/Next,
// "Surprise me" on every step, and a choice already made on every step, so tapping Next always works.
// It never blocks the tablet: skipping gives the default friend, Pip, and Settings can change it later.
import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import type { AccessoryId, Palette, PetChoice, Species } from '@shared/types';
import { ACCESSORIES } from '@shared/progression';
import type { MsgKey, Translate } from '../../i18n';
import { Modal } from '../../components/Modal';
import { PetSvg } from '../../pets/PetSvg';

export const DEFAULT_PET: PetChoice = { species: 'nimbus', palette: 0, name: 'Pip', accessory: null };
const SPECIES: Species[] = ['nimbus', 'mossback', 'glimkit'];
const PALETTES: Palette[] = [0, 1, 2, 3];
const OUTFITS: (AccessoryId | null)[] = [...ACCESSORIES, null];
export const SUGGESTED_NAMES = ['Pip', 'Sunny', 'Juniper', 'Biscuit', 'Clover', 'Pepper'];

const STEPS: MsgKey[] = ['setup.friend', 'setup.color', 'setup.accessory', 'setup.name'];

const pick = <T,>(list: T[], not?: T): T => {
  const options = list.length > 1 ? list.filter((x) => x !== not) : list;
  return options[Math.floor(Math.random() * options.length)];
};

interface Props {
  open: boolean;
  /** The current pet, or null for a first-time setup. */
  current: PetChoice | null;
  t: Translate;
  onSave: (pet: PetChoice) => void;
  /** First time: save the default pet. Later: close without changes. */
  onSkip: () => void;
}

export function PetSetup({ open, current, t, onSave, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [pet, setPet] = useState<PetChoice>(current ?? DEFAULT_PET);
  const [typing, setTyping] = useState(!SUGGESTED_NAMES.includes((current ?? DEFAULT_PET).name));
  const set = (patch: Partial<PetChoice>) => setPet((p) => ({ ...p, ...patch }));
  const last = step === STEPS.length - 1;

  function surprise() {
    if (step === 0) set({ species: pick(SPECIES, pet.species) });
    if (step === 1) set({ palette: pick(PALETTES, pet.palette) });
    if (step === 2) set({ accessory: pick(OUTFITS, pet.accessory) });
    if (step === 3) {
      setTyping(false);
      set({ name: pick(SUGGESTED_NAMES, pet.name) });
    }
  }

  const option = (selected: boolean) =>
    `flex min-h-[4rem] flex-col items-center justify-center rounded-blob border-4 bg-paper p-3 text-xl font-bold ${selected ? 'border-sage-deep bg-sage/40' : 'border-line'}`;

  const name = pet.name.trim() || 'Pip';

  return (
    <Modal open={open} onClose={onSkip} labelledBy="setup-title" describedBy="setup-intro" fullScreen>
      <div className="mx-auto flex min-h-full max-w-4xl flex-col p-5 text-center">
        <h2 id="setup-title" className="font-display text-3xl font-extrabold">{t('setup.title')}</h2>
        <p id="setup-intro" className="mt-1 text-lg text-muted">{t('setup.intro')}</p>

        <ol className="mt-3 flex justify-center gap-2" aria-label={t('setup.stepOf', { step: t(STEPS[step]) })}>
          {STEPS.map((s, i) => (
            <li key={s} aria-hidden className={`h-3 w-12 rounded-full ${i <= step ? 'bg-sage-deep' : 'bg-line'}`} />
          ))}
        </ol>

        <div className="mt-4 flex flex-col items-center">
          <PetSvg species={pet.species} palette={pet.palette} accessory={pet.accessory} mood="happy" stage={2} label={t('setup.preview', { pet: name })} className="h-48 w-48" />
          {step === 3 && <p className="font-display text-3xl font-extrabold">{name}</p>}
        </div>

        <h3 id="setup-step" className="mt-3 font-display text-2xl font-extrabold">{t(STEPS[step])}</h3>

        <div role="radiogroup" aria-labelledby="setup-step" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {step === 0 &&
            SPECIES.map((sp) => (
              <button key={sp} role="radio" aria-checked={pet.species === sp} onClick={() => set({ species: sp })} className={option(pet.species === sp)}>
                <PetSvg species={sp} palette={pet.palette} mood="happy" label="" className="h-24 w-24" />
                {t(`species.${sp}`)}
                <span className="text-base font-normal text-muted">{t(`species.${sp}.desc`)}</span>
              </button>
            ))}
          {step === 1 &&
            PALETTES.map((pal) => (
              <button key={pal} role="radio" aria-checked={pet.palette === pal} onClick={() => set({ palette: pal })} className={option(pet.palette === pal)}>
                <PetSvg species={pet.species} palette={pal} mood="happy" label="" className="h-20 w-20" />
                {t(`palette.${pal}`)}
              </button>
            ))}
          {step === 2 &&
            OUTFITS.map((a) => (
              <button key={a ?? 'none'} role="radio" aria-checked={pet.accessory === a} onClick={() => set({ accessory: a })} className={option(pet.accessory === a)}>
                <PetSvg species={pet.species} palette={pet.palette} accessory={a} mood="happy" label="" className="h-20 w-20" />
                {a ? t(`accessory.${a}`) : t('setup.none')}
              </button>
            ))}
          {step === 3 && (
            <>
              {SUGGESTED_NAMES.map((n) => (
                <button key={n} role="radio" aria-checked={!typing && pet.name === n} onClick={() => { setTyping(false); set({ name: n }); }} className={option(!typing && pet.name === n)}>
                  {n}
                </button>
              ))}
              <button role="radio" aria-checked={typing} onClick={() => setTyping(true)} className={`${option(typing)} col-span-2 sm:col-span-3`}>
                {t('setup.ownName')}
              </button>
            </>
          )}
        </div>

        {step === 3 && typing && (
          <div className="mt-3">
            <label htmlFor="own-name" className="text-xl font-bold">{t('setup.ownLabel')}</label>
            <input
              id="own-name"
              value={pet.name}
              maxLength={16}
              autoComplete="off"
              onChange={(e) => set({ name: e.target.value })}
              className="mx-auto mt-2 block min-h-[3.5rem] w-72 rounded-2xl border-4 border-line bg-paper px-4 text-center text-2xl font-bold focus:border-sky-deep"
            />
          </div>
        )}

        <button onClick={surprise} className="mx-auto mt-4 inline-flex min-h-[3.5rem] items-center gap-2 rounded-full border-4 border-sky-deep bg-paper px-6 text-xl font-bold text-sky-deep">
          <Shuffle aria-hidden size={24} /> {t('setup.surprise')}
        </button>

        <div className="mt-6 flex justify-center gap-4">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="min-h-[4rem] min-w-[9rem] rounded-full border-4 border-line bg-paper px-8 text-2xl font-bold">
              {t('setup.back')}
            </button>
          )}
          <button
            onClick={() => (last ? onSave({ ...pet, name }) : setStep(step + 1))}
            className="min-h-[4rem] min-w-[12rem] rounded-full bg-sage-deep px-10 text-2xl font-bold text-cream"
          >
            {last ? t('setup.done') : t('setup.next')}
          </button>
        </div>

        <div className="mt-6">
          <button onClick={onSkip} className="min-h-tap rounded-full px-4 text-lg font-bold text-muted underline underline-offset-4">
            {current ? t('setup.cancel') : t('setup.skip')}
          </button>
          {!current && <p className="text-base text-muted">{t('setup.skipHint')}</p>}
        </div>
      </div>
    </Modal>
  );
}
