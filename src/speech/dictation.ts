// Speaking instead of typing, with the browser's speech recognition.
//
// Not on iPhone and iPad: there, in an app added to the home screen, Safari's
// speech recognition can hang and freeze the whole app. The microphone key on
// the iPad keyboard does the same job reliably, in any text box.

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
  abort?(): void;
}

type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** iPhone and iPad, including iPads that present themselves as a Mac. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export const canDictate = (): boolean => !isAppleMobile() && recognitionClass() !== null;

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
  // One phrase per tap: it stops by itself after a pause, so nothing is left listening.
  rec.continuous = false;
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
  // Never listen for more than 30 seconds, whatever the browser does.
  const limit = setTimeout(() => rec.abort?.(), 30_000);
  rec.onend = () => {
    clearTimeout(limit);
    onEnd(error);
  };
  try {
    rec.start();
  } catch {
    clearTimeout(limit);
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
