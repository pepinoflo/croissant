// Tiny synthesised sound effects — no audio files to download.

import { settings } from '../state/store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!settings.value.sound) return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call inside the first tap so iOS lets sounds play afterwards. */
export function unlockSound(): void {
  audio();
}

function tone(freq: number, start: number, length: number, volume = 0.12, type: OscillatorType = 'sine'): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  const t = a.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

export const sfx = {
  tap: () => tone(520, 0, 0.06, 0.05, 'triangle'),
  correct: () => {
    tone(659.25, 0, 0.14);
    tone(987.77, 0.09, 0.22);
  },
  almost: () => {
    tone(587.33, 0, 0.14);
    tone(698.46, 0.09, 0.2);
  },
  wrong: () => {
    tone(311.13, 0, 0.16, 0.1, 'triangle');
    tone(233.08, 0.11, 0.26, 0.1, 'triangle');
  },
  match: () => tone(880, 0, 0.1, 0.08),
  complete: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.35, 0.11));
  },
  levelUp: () => {
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.4, 0.1));
  },
};
