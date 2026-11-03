// Text-to-speech and chimes. Both degrade silently where unsupported.
import type { Lang } from '@shared/types';

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** The patient's volume (0–1), set by the tablet from their saved settings. */
let volume = 0.6;
export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
}

export function speak(text: string, lang: Lang) {
  if (!canSpeak || volume === 0) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'es' ? 'es-US' : 'en-US';
  u.rate = 0.92;
  u.volume = volume;
  window.speechSynthesis.speak(u);
}

// Speech-to-text via the Web Speech API (Chrome, Edge, Safari). Hidden where unsupported.
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const RecognitionImpl: (new () => Recognition) | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined;

export const canListen = !!RecognitionImpl;

/** Listen for one utterance. Returns a function that stops listening. */
export function listen(lang: Lang, onText: (text: string) => void, onEnd: () => void): () => void {
  if (!RecognitionImpl) {
    onEnd();
    return () => undefined;
  }
  const r = new RecognitionImpl();
  r.lang = lang === 'es' ? 'es-US' : 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript ?? '';
    if (text) onText(text);
  };
  r.onend = onEnd;
  r.onerror = onEnd;
  r.start();
  return () => r.stop();
}

let ctx: AudioContext | null = null;

/** Soft two-note chime. Only plays when the patient has sounds turned on. */
export function chime() {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.13 * volume + 0.0001, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.6);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.65);
    });
  } catch {
    // Audio unavailable: stay silent.
  }
}
