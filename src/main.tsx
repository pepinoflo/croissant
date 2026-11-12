import { effect } from '@preact/signals';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { unlockSound } from './speech/sfx';
import { initSpeech, unlockSpeech } from './speech/tts';
import { init, settings, updateReady } from './state/store';
import './styles/app.css';

// Light or dark: follow the system unless a choice was made in Réglages.
effect(() => {
  const theme = settings.value.theme;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
});

// The on-screen keyboard shrinks the visible area without resizing the page.
// Expose the visible size so the session screen can stay above the keyboard.
const viewport = window.visualViewport;
function syncViewport(): void {
  if (!viewport) return;
  const root = document.documentElement.style;
  root.setProperty('--vvh', `${viewport.height}px`);
  root.setProperty('--vvt', `${viewport.offsetTop}px`);
}
viewport?.addEventListener('resize', syncViewport);
viewport?.addEventListener('scroll', syncViewport);
syncViewport();

// iOS only allows sound and speech once a touch has started them.
window.addEventListener(
  'pointerdown',
  () => {
    unlockSpeech();
    unlockSound();
  },
  { once: true },
);

initSpeech();
void init();

// Offline support. When a newer version has been downloaded, offer it on the
// home screen rather than reloading in the middle of a session.
const applyUpdate = registerSW({
  onNeedRefresh() {
    updateReady.value = () => void applyUpdate(true);
  },
  onRegisteredSW(_url, registration) {
    // A home-screen app can stay open for days, so look for a new version
    // each time it comes back to the front, not only when it is launched.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registration?.update().catch(() => undefined);
    });
  },
});

render(<App />, document.getElementById('app')!);
