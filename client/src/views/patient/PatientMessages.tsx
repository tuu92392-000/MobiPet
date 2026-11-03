// The patient's Messages: full history with family and with the care team, with large replies,
// voice input and quick replies. Urgent problems go to the call button, never to chat.
import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import type { SendMessageResponse, ThreadSummary } from '@shared/api';
import type { Lang } from '@shared/types';
import type { MsgKey, Translate } from '../../i18n';
import { Modal } from '../../components/Modal';
import { Conversation } from '../../messages/Conversation';
import { WalkingBuddies } from './WalkingBuddies';

interface Props {
  open: boolean;
  patientId: string;
  lang: Lang;
  t: Translate;
  threads: ThreadSummary[];
  onClose: () => void;
  onSent: (res: SendMessageResponse) => void;
  onBuddies: (on: boolean) => void;
}

type Tab = 'family' | 'careteam' | 'buddies';

export function PatientMessages({ open, patientId, lang, t, threads, onClose, onSent, onBuddies }: Props) {
  const [tab, setTab] = useState<Tab>('family');
  const unread = (id: string) => (threads.find((x) => x.id === id)?.unread ?? 0) > 0;

  // Open on whichever conversation has something new.
  useEffect(() => {
    if (open) setTab(unread(`careteam:${patientId}`) && !unread(`family:${patientId}`) ? 'careteam' : 'family');
  }, [open]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'family', label: t('messages.family') },
    { id: 'careteam', label: t('messages.careTeam') },
    { id: 'buddies', label: t('buddies.tab') },
  ];
  const quick: MsgKey[] = tab === 'family' ? ['messages.quick1', 'messages.quick2', 'messages.quick3', 'messages.quick4'] : ['messages.careQuick1', 'messages.careQuick2', 'messages.careQuick3'];
  const threadId = `${tab}:${patientId}`;

  return (
    <Modal open={open} onClose={onClose} labelledBy="messages-title" fullScreen>
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 id="messages-title" className="font-display text-3xl font-extrabold">{t('messages.title')}</h2>
          <button onClick={onClose} aria-label={t('messages.close')} className="flex min-h-[3.5rem] min-w-[3.5rem] items-center justify-center rounded-full border-4 border-line">
            <X aria-hidden size={28} />
          </button>
        </div>
        <div role="tablist" aria-label={t('messages.title')} className="flex gap-2 px-4 pt-3">
          {tabs.map((x) => (
            <button
              key={x.id}
              role="tab"
              id={`tab-${x.id}`}
              aria-selected={tab === x.id}
              aria-controls="messages-panel"
              onClick={() => setTab(x.id)}
              className={`relative min-h-[3.5rem] flex-1 rounded-full border-4 px-4 text-xl font-bold ${tab === x.id ? 'border-sage-deep bg-sage-deep text-cream' : 'border-line bg-paper'}`}
            >
              {x.label}
              {unread(`${x.id}:${patientId}`) && tab !== x.id && (
                <span className="ml-2 rounded-full bg-coral-deep px-2 py-0.5 text-base text-cream">{t('messages.new')}</span>
              )}
            </button>
          ))}
        </div>
        <p className="mx-4 mt-3 flex items-center gap-2 rounded-2xl bg-coral/20 p-3 text-lg">
          <BellRing aria-hidden className="shrink-0 text-alert" /> {t('messages.urgent')}
        </p>
        <div id="messages-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
          {tab === 'buddies' ? (
            <WalkingBuddies patientId={patientId} lang={lang} t={t} onToggle={onBuddies} />
          ) : (
          <Conversation
            key={threadId}
            threadId={threadId}
            lang={lang}
            large
            voice
            quickReplies={quick.map((k) => t(k))}
            onSent={onSent}
            labels={{
              history: t('messages.history', { who: tab === 'family' ? t('messages.family') : t('messages.careTeam') }),
              empty: t('messages.empty'),
              you: t('messages.you'),
              placeholder: t('messages.placeholder'),
              send: t('messages.send'),
              blocked: t('messages.blocked'),
              error: t('messages.error'),
              mic: t('messages.mic'),
              listening: t('chat.listening'),
              quickReplies: t('messages.quick'),
            }}
          />
          )}
        </div>
      </div>
    </Modal>
  );
}
