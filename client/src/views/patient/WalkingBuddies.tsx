// Walking buddies: cheer on other opted-in patients with preset messages and stickers only.
// Buddies appear only as their pet; the server never sends names, rooms or ids.
import { useCallback, useEffect, useState } from 'react';
import { Flower2, Heart, Star, ThumbsUp, type LucideIcon } from 'lucide-react';
import { BUDDY_PRESETS, BUDDY_STICKERS, type BuddyCheerBody, type Lang, type Palette, type Species, type AccessoryId } from '@shared/types';
import { api, ApiError } from '../../api/client';
import type { MsgKey, Translate } from '../../i18n';
import { useLiveRefresh } from '../../lib/live';
import { PetSvg } from '../../pets/PetSvg';
import { formatWhen } from '../../messages/Conversation';

interface Buddy {
  handle: string;
  name: string;
  species: Species;
  speciesWord: string;
  colorWord: string | null;
  palette: Palette;
  accessory: AccessoryId | null;
}

interface BuddiesView {
  optedIn: boolean;
  blockedByStaff: boolean;
  canSendToday: boolean;
  buddies: Buddy[];
  history: { id: string; at: number; body: BuddyCheerBody; direction: 'sent' | 'received'; buddy: Buddy | null }[];
}

const STICKER_ICON: Record<(typeof BUDDY_STICKERS)[number], LucideIcon> = { 'thumbs-up': ThumbsUp, star: Star, heart: Heart, flower: Flower2 };

export function buddyName(t: Translate, b: Pick<Buddy, 'name' | 'species' | 'palette' | 'colorWord'>): string {
  const species = t(`buddies.species.${b.species}` as MsgKey);
  return b.colorWord ? t('buddies.nameColor', { name: b.name, species, color: t(`buddies.color.${b.palette}` as MsgKey) }) : t('buddies.name', { name: b.name, species });
}

interface Props {
  patientId: string;
  lang: Lang;
  t: Translate;
  onToggle: (on: boolean) => void;
}

export function WalkingBuddies({ patientId, lang, t, onToggle }: Props) {
  const [view, setView] = useState<BuddiesView | null>(null);
  const [chosen, setChosen] = useState<Buddy | null>(null);
  const [status, setStatus] = useState('');

  const load = useCallback(() => void api.get<BuddiesView>(`/patients/${patientId}/buddies`).then(setView).catch(() => undefined), [patientId]);
  useEffect(load, [load]);
  useLiveRefresh(patientId, load);

  async function send(body: BuddyCheerBody) {
    if (!chosen) return;
    const who = buddyName(t, chosen);
    try {
      await api.post(`/patients/${patientId}/buddies/cheer`, { to: chosen.handle, body });
      setStatus(t('buddies.sent', { buddy: who }));
      setChosen(null);
    } catch (e) {
      setStatus(e instanceof ApiError && e.code === 'receive-limit' ? t('buddies.full', { buddy: who }) : t('buddies.limit'));
    }
    load();
  }

  if (!view) return null;
  const big = 'min-h-[3.5rem] rounded-full border-4 px-6 text-xl font-bold';

  if (view.blockedByStaff) return <p className="p-4 text-xl">{t('buddies.blocked')}</p>;

  if (!view.optedIn) {
    return (
      <div className="p-4">
        <h3 className="font-display text-2xl font-extrabold">{t('buddies.offTitle')}</h3>
        <p className="mt-2 text-xl">{t('buddies.offBody')}</p>
        <button onClick={() => onToggle(true)} className={`${big} mt-4 border-sage-deep bg-sage-deep text-cream`}>{t('buddies.turnOn')}</button>
      </div>
    );
  }

  const cheerLabel = (body: BuddyCheerBody) => t(`buddies.cheer.${body}` as MsgKey);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <p role="status" className="min-h-[1.75rem] text-xl font-bold text-sage-deep">{status}</p>

      {chosen ? (
        <section aria-labelledby="cheer-pick">
          <div className="flex items-center gap-3">
            <PetSvg species={chosen.species} palette={chosen.palette} accessory={chosen.accessory} mood="happy" label="" className="h-20 w-20" />
            <h3 id="cheer-pick" className="font-display text-2xl font-extrabold">{t('buddies.choose', { buddy: buddyName(t, chosen) })}</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {BUDDY_PRESETS.map((b) => (
              <button key={b} onClick={() => void send(b)} className={`${big} border-sage-deep bg-paper text-sage-deep`}>{cheerLabel(b)}</button>
            ))}
            {BUDDY_STICKERS.map((b) => {
              const Icon = STICKER_ICON[b];
              return (
                <button key={b} onClick={() => void send(b)} aria-label={cheerLabel(b)} className={`${big} flex items-center justify-center border-line bg-paper`}>
                  <Icon aria-hidden size={36} className="text-coral-deep" />
                </button>
              );
            })}
          </div>
          <button onClick={() => setChosen(null)} className={`${big} mt-4 border-line bg-paper`}>{t('buddies.back')}</button>
        </section>
      ) : !view.canSendToday ? (
        <p className="text-xl">{t('buddies.limit')}</p>
      ) : (
        <section aria-labelledby="buddy-list">
          <h3 id="buddy-list" className="font-display text-2xl font-extrabold">{t('buddies.pick')}</h3>
          {view.buddies.length === 0 ? (
            <p className="mt-2 text-xl text-muted">{t('buddies.none')}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {view.buddies.map((b) => (
                <li key={b.handle}>
                  <button onClick={() => { setStatus(''); setChosen(b); }} className="flex w-full flex-col items-center rounded-blob border-4 border-line bg-paper p-3 text-xl font-bold hover:border-sage-deep">
                    <PetSvg species={b.species} palette={b.palette} accessory={b.accessory} mood="happy" label="" className="h-20 w-20" />
                    {buddyName(t, b)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view.history.length > 0 && (
        <section aria-labelledby="buddy-history" className="mt-6">
          <h3 id="buddy-history" className="font-display text-xl font-extrabold">{t('buddies.history')}</h3>
          <ul className="mt-2 space-y-2">
            {view.history.map((c) => {
              const who = c.buddy ? buddyName(t, c.buddy) : '';
              return (
                <li key={c.id} className={`rounded-2xl p-3 text-lg ${c.direction === 'received' ? 'bg-sage/40' : 'bg-sky/40'}`}>
                  {c.direction === 'received' ? t('buddies.from', { buddy: who, cheer: cheerLabel(c.body) }) : t('buddies.youSent', { buddy: who, cheer: cheerLabel(c.body) })}
                  <span className="block text-base text-muted">{formatWhen(c.at, Date.now(), lang)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <button onClick={() => onToggle(false)} className="mt-6 min-h-tap text-lg font-bold text-muted underline underline-offset-4">{t('buddies.turnOff')}</button>
    </div>
  );
}
