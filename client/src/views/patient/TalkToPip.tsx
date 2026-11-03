// "Talk to Pip": chat with the companion by voice or text, in a panel that slides up from the floating button. Every message goes through the
// server's guardrail pipeline; symptoms skip the AI and open the call-button card.
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, X } from 'lucide-react';
import type { ChatTurn } from '@shared/types';
import type { PatientView } from '@shared/api';
import type { Translate } from '../../i18n';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { canListen, listen, speak } from '../../lib/voice';
import { PetSvg } from '../../pets/PetSvg';

interface ChatResponse {
  turns: ChatTurn[];
  action: 'call-button' | 'breathing' | null;
}

interface Props {
  open: boolean;
  view: PatientView;
  t: Translate;
  onClose: () => void;
  onAction: (action: 'call-button' | 'breathing') => void;
}

export function TalkToPip({ open, view, t, onClose, onAction }: Props) {
  const { patient } = view;
  const pet = patient.pet!;
  const lang = patient.settings.language;
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopListening = useRef<() => void>();
  const endRef = useRef<HTMLLIElement>(null);

  const turns = view.chat.slice(-30);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, pending, open]);

  useEffect(() => () => stopListening.current?.(), []);

  async function send(message: string) {
    const body = message.trim();
    if (!body || pending) return;
    setText('');
    setError(null);
    setPending(body);
    try {
      const res = await api.post<ChatResponse>(`/patients/${patient.id}/chat`, { text: body });
      const reply = res.turns[res.turns.length - 1];
      if (res.action) onAction(res.action);
      else if (patient.settings.readAloud && reply) speak(reply.text, lang);
    } catch {
      setError(t('chat.error', { pet: pet.name }));
    } finally {
      setPending(null);
    }
  }

  function toggleMic() {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setListening(true);
    stopListening.current = listen(
      lang,
      (heard) => void send(heard),
      () => setListening(false),
    );
  }

  const chips = [t('chat.chipGoal'), t('chat.chipNext'), t('chat.chipBreathe'), t('chat.chipTired')];

  return (
    <Modal open={open} onClose={onClose} labelledBy="chat-title" describedBy="chat-disclaimer" corner closeOnBackdrop>
      <div className="flex max-h-[min(85vh,48rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <PetSvg species={pet.species} palette={pet.palette} mood={pending ? 'curious' : 'happy'} accessory={pet.accessory} label="" className="h-14 w-14 shrink-0" />
          <div className="flex-1">
            <h2 id="chat-title" className="font-display text-2xl font-extrabold">{t('chat.title', { pet: pet.name })}</h2>
            <p id="chat-disclaimer" className="text-base text-muted">{t('chat.disclaimer', { pet: pet.name })}</p>
          </div>
          <button onClick={onClose} aria-label={t('chat.close')} className="flex min-h-tap min-w-tap shrink-0 items-center justify-center self-start rounded-full border-2 border-line hover:bg-line/50">
            <X aria-hidden size={26} />
          </button>
        </div>

        {/* Focusable so keyboard users can scroll the history. */}
        <ol tabIndex={0} aria-label={t('chat.title', { pet: pet.name })} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {turns.length === 0 && !pending && <li className="text-lg text-muted">{t('chat.empty', { pet: pet.name })}</li>}
          {turns.map((c) => (
            <li key={c.id} className={`flex ${c.role === 'patient' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] rounded-3xl px-4 py-2 text-xl ${
                  c.role === 'patient' ? 'rounded-br-md bg-sky/60' : c.mode === 'safety' ? 'rounded-bl-md border-4 border-alert bg-coral/20' : 'rounded-bl-md bg-sage/40'
                }`}
              >
                <span className="sr-only">{c.role === 'patient' ? t('chat.you') : pet.name}: </span>
                {c.text}
              </p>
            </li>
          ))}
          {pending && (
            <>
              <li className="flex justify-end">
                <p className="max-w-[85%] rounded-3xl rounded-br-md bg-sky/60 px-4 py-2 text-xl">{pending}</p>
              </li>
              <li className="text-lg text-muted" role="status">{t('chat.thinking', { pet: pet.name })}</li>
            </>
          )}
          <li ref={endRef} aria-hidden />
        </ol>

        {error && <p role="alert" className="px-5 text-lg text-alert">{error}</p>}

        <div className="flex flex-wrap gap-2 px-5 pb-2">
          {chips.map((c) => (
            <button key={c} onClick={() => void send(c)} aria-disabled={!!pending} className="min-h-tap rounded-full border-2 border-sage-deep bg-paper px-4 text-lg font-bold text-sage-deep aria-disabled:opacity-50">
              {c}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
          className="flex items-center gap-2 border-t border-line px-5 py-3"
        >
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? t('chat.listening') : t('chat.mic', { pet: pet.name })}
              className={`flex min-h-[3.5rem] min-w-[3.5rem] items-center justify-center rounded-full border-4 ${listening ? 'border-alert bg-coral/30' : 'border-line bg-paper'}`}
            >
              {listening ? <MicOff aria-hidden size={28} /> : <Mic aria-hidden size={28} />}
            </button>
          )}
          <label htmlFor="chat-input" className="sr-only">{t('chat.label', { pet: pet.name })}</label>
          <input
            id="chat-input"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            placeholder={listening ? t('chat.listening') : t('chat.placeholder')}
            autoComplete="off"
            className="min-h-[3.5rem] flex-1 rounded-2xl border-4 border-line bg-paper px-4 text-xl focus:border-sky-deep"
          />
          <button type="submit" aria-disabled={!text.trim() || !!pending} className="flex min-h-[3.5rem] items-center gap-2 rounded-full bg-sage-deep px-5 text-xl font-bold text-cream aria-disabled:opacity-50">
            <Send aria-hidden size={22} /> {t('chat.send')}
          </button>
        </form>
      </div>
    </Modal>
  );
}
