// Family view: the pet, the journey, and ways to help. No clinical details are ever shown.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, Gem, Lock, Send } from 'lucide-react';
import type { Lang } from '@shared/types';
import type { FamilyView } from '@shared/api';
import { api, ApiError } from '../api/client';
import { makeT, type MsgKey } from '../i18n';
import { useLiveRefresh } from '../lib/live';
import { JourneyMap } from '../journey/JourneyMap';
import { PetSvg } from '../pets/PetSvg';
import { LangToggle } from './FamilyJoin';
import { Sticker, STICKERS } from './Sticker';
import { readPref, writePref } from './storage';
import { Conversation } from '../messages/Conversation';
import { useSession } from '../auth/session';

const PRESETS: MsgKey[] = ['family.preset1', 'family.preset2', 'family.preset3', 'family.preset4', 'family.preset5', 'family.preset6'];
const REASONS = ['pressure-or-guilt', 'medical-content', 'contact-info', 'unkind-language'];

export function FamilyHome() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const patientId = me && !me.locked ? me.patientId ?? '' : '';
  const navigate = useNavigate();
  const [view, setView] = useState<FamilyView | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang | null>((readPref('lang') as Lang) || null);
  const [from, setFrom] = useState(readPref('from') ?? '');
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api
      .get<FamilyView>(`/family/${patientId}`)
      .then((v) => {
        setView(v);
        setMissing(false);
      })
      .catch(() => setMissing(true));
  }, [patientId]);

  useEffect(load, [load]);
  useLiveRefresh(patientId, load);

  const activeLang: Lang = lang ?? view?.language ?? 'en';
  const t = useMemo(() => makeT(activeLang), [activeLang]);

  function leave() {
    void signOut().then(() => navigate('/family'));
  }

  if (missing) {
    return (
      <section className="mx-auto max-w-xl p-6 text-center">
        <p className="text-xl">{t('family.badCode')}</p>
        <button onClick={leave} className="mt-4 min-h-tap rounded-full bg-sage-deep px-8 text-lg font-bold text-cream">{t('family.switch')}</button>
      </section>
    );
  }
  if (!view) return <p role="status" className="p-6 text-center text-xl">{t('state.loading', { pet: 'Pip' })}</p>;

  const name = view.firstName;
  const pet = view.pet;
  const petName = pet?.name ?? 'Pip';

  async function send(kind: 'text' | 'preset' | 'sticker', body: string) {
    if (sending) return;
    const sender = from.trim() || (activeLang === 'es' ? 'Tu familia' : 'Your family');
    writePref('from', from.trim());
    setSending(true);
    setFeedback(null);
    try {
      await api.post(`/family/${patientId}/messages`, { from: sender, kind, body });
      setFeedback({ tone: 'ok', text: t('family.sent', { pet: petName }) });
      if (kind === 'text') setText('');
      load();
    } catch (e) {
      const raw = e instanceof ApiError && e.status === 422 ? String(e.data.reason ?? '') : '';
      const reason = REASONS.includes(raw) ? raw : 'other';
      setFeedback({ tone: 'warn', text: t('family.blocked', { reason: t(`family.reason.${reason}` as MsgKey, { name }) }) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4" lang={activeLang}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold">{t('family.title', { name })}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle lang={activeLang} onChange={(l) => { setLang(l); writePref('lang', l); }} />
          <button onClick={leave} className="min-h-tap rounded-full border-2 border-line px-4 font-bold">{t('family.switch')}</button>
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-base text-muted">
        <Lock aria-hidden size={16} /> {t('family.privacy', { name })}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <section aria-label={petName} className="flex flex-col items-center rounded-blob border-2 border-line bg-paper p-4 text-center">
          {pet && (
            <PetSvg
              species={pet.species}
              palette={pet.palette}
              mood={view.mood}
              stage={view.progression.stage}
              accessory={pet.accessory}
              label={t('pet.label', { pet: petName, species: t(`species.${pet.species}`), mood: t(`moodWord.${view.mood}`) })}
              className="h-auto w-full max-w-[14rem]"
            />
          )}
          <p className="mt-2 font-display text-2xl font-extrabold">{petName}</p>
          <ul className="mt-2 space-y-1 text-lg">
            <li className="flex items-center justify-center gap-2">
              <Gem aria-hidden size={20} className="text-sky-deep" /> {t('family.keepsakes')}
            </li>
          </ul>
        </section>

        <section aria-labelledby="send-title" className="rounded-blob border-2 border-line bg-paper p-4">
          <h2 id="send-title" className="font-display text-2xl font-extrabold">{t('family.sendTitle')}</h2>
          <p className="text-lg text-muted">{t('family.sendIntro', { pet: petName, name })}</p>
          <label htmlFor="from-name" className="mt-3 block font-bold">{t('family.fromLabel')}</label>
          <input id="from-name" value={from} maxLength={40} onChange={(e) => setFrom(e.target.value)} autoComplete="given-name" className="mt-1 min-h-tap w-full rounded-xl border-2 border-line px-3 text-lg" />

          <h3 className="mt-3 font-bold">{t('family.presets')}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {PRESETS.map((k) => (
              <button key={k} aria-disabled={sending} onClick={() => void send('preset', t(k))} className="min-h-tap rounded-full border-2 border-sage-deep px-4 text-lg font-bold text-sage-deep aria-disabled:opacity-50">
                {t(k)}
              </button>
            ))}
          </div>

          <h3 className="mt-3 font-bold">{t('family.stickers')}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {STICKERS.map((s) => (
              <button
                key={s}
                aria-disabled={sending}
                onClick={() => void send('sticker', s)}
                aria-label={t(`family.stickerName.${s}`)}
                className="flex min-h-[3.5rem] min-w-[3.5rem] items-center justify-center rounded-2xl border-2 border-line bg-cream aria-disabled:opacity-50"
              >
                <Sticker id={s} size={40} />
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void send('text', text);
            }}
            className="mt-3"
          >
            <label htmlFor="family-text" className="font-bold">{t('family.writeLabel')}</label>
            <div className="mt-1 flex gap-2">
              <input id="family-text" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className="min-h-tap flex-1 rounded-xl border-2 border-line px-3 text-lg" />
              <button type="submit" aria-disabled={!text.trim() || sending} className="flex min-h-tap items-center gap-1.5 rounded-full bg-sage-deep px-5 text-lg font-bold text-cream aria-disabled:opacity-50">
                <Send aria-hidden size={18} /> {t('family.send')}
              </button>
            </div>
          </form>
          <p aria-live="polite" className={`mt-2 min-h-[1.5rem] text-lg ${feedback?.tone === 'warn' ? 'text-alert' : 'text-sage-deep'}`}>{feedback?.text}</p>
        </section>
      </div>

      {pet && (
        <div className="mt-4">
          <JourneyMap
            steps={view.progression.steps}
            region={view.progression.region}
            pet={pet}
            mood={view.mood}
            stage={view.progression.stage}
            keepsakes={view.progression.keepsakes}
            t={t}
            viewerOf={name}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section aria-labelledby="walk-title" className="rounded-blob border-2 border-line bg-paper p-4">
          <h2 id="walk-title" className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <Footprints aria-hidden /> {t('family.walkTitle')}
          </h2>
          {view.walkTogether ? (
            <>
              <p className="mt-1 text-lg">{t('family.walkIntro', { name, pet: petName })}</p>
              {view.walkTogether.needsStaff && <p className="mt-2 text-base text-muted">{t('family.walkStaffNote', { name })}</p>}
            </>
          ) : (
            <p className="mt-1 text-lg text-muted">{t('family.noWalk', { name })}</p>
          )}
        </section>

        <section aria-labelledby="history-title" className="flex max-h-[34rem] flex-col rounded-blob border-2 border-line bg-paper">
          <h2 id="history-title" className="px-4 pt-4 font-display text-2xl font-extrabold">{t('family.history')}</h2>
          {/* Full history with {name}'s replies. New messages are sent with the controls above. */}
          <Conversation
            threadId={`family:${patientId}`}
            lang={activeLang}
            canSend={false}
            labels={{
              history: t('family.history'),
              empty: t('family.historyEmpty', { name }),
              you: '',
              placeholder: '',
              send: '',
              blocked: '',
              error: '',
            }}
            renderStatus={(m) =>
              m.mine
                ? m.deliveredAt
                  ? t('family.delivered', { time: new Date(m.deliveredAt).toLocaleTimeString(activeLang === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit' }) })
                  : t('family.waiting', { pet: petName })
                : null
            }
          />
        </section>
      </div>
    </div>
  );
}
