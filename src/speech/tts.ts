// French speech, using the voices built into the device (Web Speech API).

import { computed, signal } from '@preact/signals';
import { settings } from '../state/store';

const synth: SpeechSynthesis | null =
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/** French voices installed on the device, best first. */
export const frenchVoices = signal<SpeechSynthesisVoice[]>([]);

// iPhones and iPads always ship with a French voice, but Safari sometimes
// reports the list late or not at all; asking for lang "fr-FR" still works there.
const isApple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);

export const canSpeak = computed(() => !!synth && (frenchVoices.value.length > 0 || isApple));

function quality(v: SpeechSynthesisVoice): number {
  let score = 0;
  if (v.lang.replace('_', '-').toLowerCase() === 'fr-fr') score += 10;
  if (/premium|enhanced|siri|natural|neural/i.test(v.name)) score += 5;
  if (v.localService) score += 1;
  // Novelty voices on Apple devices.
  if (/eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|jacques/i.test(v.name)) score -= 4;
  return score;
}

function refreshVoices(): void {
  if (!synth) return;
  const all = synth.getVoices();
  if (!all.length) return;
  frenchVoices.value = all
    .filter((v) => v.lang.toLowerCase().startsWith('fr'))
    .sort((a, b) => quality(b) - quality(a));
}

export function initSpeech(): void {
  if (!synth) return;
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
  // Some browsers never fire the event: look again a few times.
  [250, 1000, 3000].forEach((ms) => setTimeout(refreshVoices, ms));
}

function chosenVoice(): SpeechSynthesisVoice | undefined {
  const uri = settings.value.voiceURI;
  return frenchVoices.value.find((v) => v.voiceURI === uri) ?? frenchVoices.value[0];
}

/** Keeps only what should be said: no ellipses, and for "A → B" only B. */
function speakable(text: string): string {
  const afterArrow = text.includes('→') ? text.slice(text.lastIndexOf('→') + 1) : text;
  return afterArrow.replace(/…/g, ' ').replace(/[—–]/g, ', ').replace(/\s+/g, ' ').trim();
}

let unlocked = false;

/** Must run inside the first tap: iOS only allows speech that a touch has started. */
export function unlockSpeech(): void {
  if (unlocked || !synth) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  u.lang = 'fr-FR';
  synth.speak(u);
}

export function speak(text: string, opts: { slow?: boolean } = {}): void {
  if (!synth || !text) return;
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voice = chosenVoice();
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'fr-FR';
  u.rate = settings.value.speechRate * (opts.slow ? 0.7 : 1);
  synth.cancel();
  // Safari drops an utterance queued in the same tick as cancel().
  setTimeout(() => synth.speak(u), 60);
}

export function stopSpeaking(): void {
  synth?.cancel();
}
