import type { PatientSettings } from '@shared/types';
import type { Translate } from '../../i18n';
import { Modal } from '../../components/Modal';

interface Props {
  open: boolean;
  settings: PatientSettings;
  t: Translate;
  onChange: (patch: Partial<PatientSettings>) => void;
  onClose: () => void;
  petName: string;
  onChangePet: () => void;
}

function Choice<T extends string | number | boolean>({ label, value, options, onPick }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="text-xl font-bold">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={`min-h-tap rounded-full border-4 px-5 text-lg font-bold ${
              value === o.value ? 'border-sage-deep bg-sage/60' : 'border-line bg-paper'
            }`}
          >
            {value === o.value && <span aria-hidden>✓ </span>}
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsDialog({ open, settings, t, onChange, onClose, petName, onChangePet }: Props) {
  const toggle = [
    { value: true, label: t('on') },
    { value: false, label: t('off') },
  ];
  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <div className="p-6">
        <h2 id="settings-title" className="font-display text-3xl font-extrabold">{t('settings.title')}</h2>
        <Choice label={t('settings.readAloud')} value={settings.readAloud} options={toggle} onPick={(readAloud) => onChange({ readAloud })} />
        <Choice
          label={t('settings.textSize')}
          value={settings.textSize}
          options={[
            { value: 1 as const, label: t('settings.size1') },
            { value: 2 as const, label: t('settings.size2') },
            { value: 3 as const, label: t('settings.size3') },
          ]}
          onPick={(textSize) => onChange({ textSize })}
        />
        <Choice
          label={t('settings.language')}
          value={settings.language}
          options={[
            { value: 'en' as const, label: 'English' },
            { value: 'es' as const, label: 'Español' },
          ]}
          onPick={(language) => onChange({ language })}
        />
        <Choice label={t('settings.contrast')} value={settings.highContrast} options={toggle} onPick={(highContrast) => onChange({ highContrast })} />
        <Choice label={t('settings.sound')} value={settings.sound} options={toggle} onPick={(sound) => onChange({ sound })} />
        <Choice label={t('settings.buddies')} value={settings.buddies} options={toggle} onPick={(buddies) => onChange({ buddies })} />
        <div className="mt-5">
          <label htmlFor="volume" className="text-xl font-bold">{t('settings.volume')}</label>
          <p id="volume-hint" className="text-base text-muted">{t('settings.volumeHint', { pet: petName })}</p>
          <input
            id="volume"
            type="range"
            min={0}
            max={100}
            step={10}
            value={Math.round(settings.volume * 100)}
            aria-describedby="volume-hint"
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
            className="mt-2 h-12 w-full accent-[rgb(var(--sage-deep))]"
          />
        </div>
        <button onClick={onChangePet} className="mt-6 min-h-[3.5rem] rounded-full border-4 border-sage-deep bg-paper px-6 text-xl font-bold text-sage-deep">
          {t('settings.changePet')}
        </button>
        <div className="mt-8 flex justify-end">
          <button onClick={onClose} className="min-h-tap rounded-full bg-sage-deep px-10 text-xl font-bold text-cream">
            {t('settings.done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
