// Speaking instead of typing, with the browser's speech recognition (on the
// iPad this is Siri's dictation). Not every browser has it, and a home-screen
// app may not be allowed to use it; the keyboard's microphone key works in
// any text box either way.

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canDictate = (): boolean => recognitionClass() !== null;

export interface Dictation {
  stop(): void;
}

/**
 * Listens in French until stopped (or a long pause). `onText` receives each
 * finished phrase; `onEnd` is called once, with an error message if it failed.
 */
export function startDictation(onText: (text: string) => void, onEnd: (error?: string) => void): Dictation | null {
  const Class = recognitionClass();
  if (!Class) return null;
  const rec = new Class();
  rec.lang = 'fr-FR';
  rec.continuous = true;
  rec.interimResults = false;
  let error: string | undefined;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onText(r[0].transcript.trim());
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    error =
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'The microphone is not allowed here. Use the microphone key on the keyboard instead.'
        : 'Voice input stopped. Try again, or use the microphone key on the keyboard.';
  };
  rec.onend = () => onEnd(error);
  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}

/** Adds dictated words to what is already written, with a space between. */
export function appendText(current: string, addition: string): string {
  if (!addition) return current;
  if (!current.trim()) return addition.charAt(0).toUpperCase() + addition.slice(1);
  return /\s$/.test(current) ? current + addition : `${current} ${addition}`;
}
