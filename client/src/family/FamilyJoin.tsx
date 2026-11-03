import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import type { Lang } from '@shared/types';
import { useSession } from '../auth/session';
import { makeT } from '../i18n';
import { readPref, writePref } from './storage';

export function FamilyJoin() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>((readPref('lang') as Lang) || 'en');
  const t = useMemo(() => makeT(lang), [lang]);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const signInFamily = useSession((s) => s.signInFamily);

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await signInFamily(code);
      navigate('/family/home');
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center p-6 text-center" lang={lang}>
      <LangToggle lang={lang} onChange={(l) => { setLang(l); writePref('lang', l); }} />
      <Heart aria-hidden size={48} className="mt-4 text-coral-deep" />
      <h1 className="mt-2 font-display text-3xl font-extrabold">{t('family.joinTitle')}</h1>
      <p className="mt-2 text-lg text-muted">{t('family.joinIntro')}</p>
      <p role="note" className="mt-3 rounded-xl border-2 border-coral-deep bg-coral/20 px-4 py-2 font-bold">{t('family.demoOnly')}</p>
      <form onSubmit={join} className="mt-6 flex w-full flex-col items-center gap-3">
        <label htmlFor="invite-code" className="text-lg font-bold">{t('family.codeLabel')}</label>
        <input
          id="invite-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          aria-invalid={error}
          aria-describedby={error ? 'code-error' : 'code-hint'}
          className="min-h-[3.5rem] w-64 rounded-2xl border-4 border-line bg-paper px-4 text-center font-display text-2xl font-extrabold uppercase tracking-widest focus:border-sky-deep"
        />
        {error ? (
          <p id="code-error" role="alert" className="text-lg text-alert">{t('family.badCode')}</p>
        ) : (
          <p id="code-hint" className="text-base text-muted">{t('family.demoCodes')}</p>
        )}
        <button type="submit" disabled={!code.trim() || busy} className="min-h-[3.5rem] rounded-full bg-sage-deep px-12 text-xl font-bold text-cream disabled:opacity-50">
          {t('family.join')}
        </button>
      </form>
    </section>
  );
}

export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="group" aria-label="Language / Idioma" className="flex gap-1 self-end rounded-full border-2 border-line bg-paper p-1">
      {(['en', 'es'] as const).map((l) => (
        <button
          key={l}
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={`min-h-tap rounded-full px-4 font-bold ${lang === l ? 'bg-sage-deep text-cream' : ''}`}
        >
          {l === 'en' ? 'English' : 'Español'}
        </button>
      ))}
    </div>
  );
}
