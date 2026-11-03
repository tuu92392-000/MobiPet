// One conversation's full, scrollable, timestamped history plus a composer. Used by every role;
// the server decides what this viewer may see and send.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff, Send } from 'lucide-react';
import type { Lang } from '@shared/types';
import type { MessageView, SendMessageResponse, ThreadView } from '@shared/api';
import { api, ApiError } from '../api/client';
import { useLiveRefresh } from '../lib/live';
import { canListen, listen } from '../lib/voice';
import { Sticker } from '../family/Sticker';

export interface ConversationLabels {
  history: string;
  empty: string;
  /** Label for the viewer's own messages; empty shows the sender's name instead (shared family account). */
  you: string;
  placeholder: string;
  send: string;
  blocked: string;
  error: string;
  mic?: string;
  listening?: string;
  quickReplies?: string;
  composerNote?: string;
}

interface Props {
  threadId: string;
  labels: ConversationLabels;
  lang?: Lang;
  /** Large type and big controls for the bedside tablet. */
  large?: boolean;
  canSend?: boolean;
  quickReplies?: string[];
  voice?: boolean;
  /** Called after a send, e.g. so the tablet can open the call-button card. */
  onSent?: (res: SendMessageResponse) => void;
  /** Extra composer controls (for example a patient tag picker) and the values they add to a send. */
  composerExtra?: ReactNode;
  extraBody?: Record<string, unknown>;
  /** Renders a small chip for a tagged patient. */
  renderTag?: (patientId: string) => ReactNode;
  /** Optional line under a message, e.g. whether the pet has delivered it yet. */
  renderStatus?: (m: MessageView) => ReactNode;
}

export function formatWhen(at: number, now: number, lang: Lang = 'en'): string {
  const locale = lang === 'es' ? 'es-US' : 'en-US';
  const d = new Date(at);
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const day = new Date(now);
  if (d.toDateString() === day.toDateString()) return time;
  return `${d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

export function Conversation({ threadId, labels, lang = 'en', large, canSend = true, quickReplies, voice, onSent, composerExtra, extraBody, renderTag, renderStatus }: Props) {
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const stopListening = useRef<() => void>();
  const endRef = useRef<HTMLLIElement>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    api
      .get<ThreadView>(`/messages/threads/${threadId}`)
      .then((v) => {
        setThread(v);
        setNow(Date.now());
        // Opening a conversation marks it read.
        if (v.messages.some((m) => !m.read)) void api.post(`/messages/threads/${threadId}/read`).catch(() => undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, [threadId]);

  useEffect(() => {
    setThread(null);
    load();
  }, [load]);
  useLiveRefresh(thread?.patientId ?? '*', load);
  useEffect(() => () => stopListening.current?.(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  async function send(body: string, kind: 'text' | 'preset' = 'text') {
    const clean = body.trim();
    if (!clean || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<SendMessageResponse>(`/messages/threads/${threadId}`, { kind, body: clean, ...extraBody });
      if (kind === 'text') setText('');
      load();
      onSent?.(res);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? labels.blocked : labels.error);
    } finally {
      setSending(false);
    }
  }

  function toggleMic() {
    if (listening) return stopListening.current?.();
    setListening(true);
    stopListening.current = listen(lang, (heard) => setText((prev) => `${prev} ${heard}`.trim()), () => setListening(false));
  }

  const text_ = large ? 'text-xl' : 'text-base';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Focusable so keyboard users can scroll the history. */}
      <ol tabIndex={0} aria-label={labels.history} className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto p-4">
        {thread && thread.messages.length === 0 && <li className={`${text_} text-muted`}>{labels.empty}</li>}
        {thread?.messages.map((m) => <Bubble key={m.id} m={m} you={labels.you} large={large} when={formatWhen(m.at, now, lang)} renderTag={renderTag} status={renderStatus?.(m)} />)}
        <li ref={endRef} aria-hidden />
      </ol>

      {error && <p role="alert" className={`px-4 ${text_} font-bold text-alert`}>{error}</p>}

      {canSend && (
        <div className="border-t border-line p-3">
          {quickReplies && quickReplies.length > 0 && (
            <div role="group" aria-label={labels.quickReplies} className="mb-2 flex flex-wrap gap-2">
              {quickReplies.map((q) => (
                <button key={q} disabled={sending} onClick={() => void send(q, 'preset')} className={`min-h-tap rounded-full border-2 border-sage-deep bg-paper px-4 font-bold text-sage-deep disabled:opacity-50 ${text_}`}>
                  {q}
                </button>
              ))}
            </div>
          )}
          {composerExtra}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="flex items-end gap-2"
          >
            {voice && canListen && (
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label={listening ? labels.listening : labels.mic}
                className={`flex min-h-[3.5rem] min-w-[3.5rem] items-center justify-center rounded-full border-4 ${listening ? 'border-alert bg-coral/30' : 'border-line bg-paper'}`}
              >
                {listening ? <MicOff aria-hidden size={28} /> : <Mic aria-hidden size={28} />}
              </button>
            )}
            <label htmlFor={`compose-${threadId}`} className="sr-only">{labels.placeholder}</label>
            <textarea
              id={`compose-${threadId}`}
              value={text}
              maxLength={500}
              rows={large ? 3 : 2}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends on staff screens; on the tablet Enter adds a line, and the big Send button sends.
                if (!large && e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              placeholder={listening ? labels.listening : labels.placeholder}
              className={`min-h-[3.5rem] flex-1 resize-none rounded-2xl border-4 border-line bg-paper px-4 py-2 focus:border-sky-deep ${text_}`}
            />
            <button type="submit" aria-disabled={!text.trim() || sending} className={`flex min-h-[3.5rem] items-center gap-2 rounded-full bg-sage-deep px-5 font-bold text-cream aria-disabled:opacity-50 ${text_}`}>
              <Send aria-hidden size={22} /> {labels.send}
            </button>
          </form>
          {labels.composerNote && <p className="mt-1 text-sm text-muted">{labels.composerNote}</p>}
        </div>
      )}
    </div>
  );
}

function Bubble({ m, you, large, when, renderTag, status }: { m: MessageView; you: string; large?: boolean; when: string; renderTag?: (id: string) => ReactNode; status?: ReactNode }) {
  const size = large ? 'text-xl' : 'text-base';
  return (
    <li className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
      <p className={`text-sm text-muted ${large ? 'text-base' : ''}`}>
        <span className="font-bold text-ink">{m.mine && you ? you : m.from}</span> · <time dateTime={new Date(m.at).toISOString()}>{when}</time>
      </p>
      <div className={`mt-0.5 max-w-[85%] rounded-3xl px-4 py-2 ${size} ${m.mine ? 'rounded-br-md bg-sky/60' : 'rounded-bl-md bg-sage/40'}`}>
        {m.kind === 'sticker' ? <Sticker id={m.body} size={large ? 72 : 48} /> : m.body}
        {m.patientTag && renderTag && <div className="mt-1">{renderTag(m.patientTag)}</div>}
      </div>
      {status && <p className="text-sm text-muted">{status}</p>}
    </li>
  );
}
