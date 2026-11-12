// Preferences, backup and restore.

import { useRef, useState } from 'preact/hooks';
import { Button, Icon } from '../components/ui';
import { catalog } from '../content/load';
import { frenchVoices, canSpeak, speak } from '../speech/tts';
import { SIZES } from '../srs/session';
import { BackupError, summarize, type BackupFile } from '../storage/backup';
import type { SessionSize, Settings as SettingsModel } from '../storage/model';
import { cards, profile, readBackup, resetEverything, restoreBackup, saveBackup, settings, updateSettings } from '../state/store';

const SIZE_LABEL: Record<SessionSize, string> = { short: 'Court', normal: 'Normal', long: 'Long' };

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} class={v === value ? 'is-on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" class={`toggle ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function formatDate(ts: number | string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}

export function Settings() {
  const s = settings.value;
  const p = profile.value;
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [resetStep, setResetStep] = useState(0);
  const set = (patch: Partial<SettingsModel>) => updateSettings(patch);

  const doExport = async () => {
    try {
      const how = await saveBackup();
      if (how === 'cancelled') return;
      setMessage({
        tone: 'good',
        text: how === 'shared' ? 'Backup shared. If you chose “Save to Files”, it is now in the folder you picked.' : 'Backup downloaded.',
      });
    } catch (err) {
      setMessage({ tone: 'bad', text: `The backup could not be made: ${(err as Error).message}` });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending(await readBackup(file));
      setMessage(null);
    } catch (err) {
      setMessage({
        tone: 'bad',
        text: err instanceof BackupError ? err.message : 'This file could not be read.',
      });
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const doRestore = async () => {
    if (!pending) return;
    try {
      await restoreBackup(pending);
      setMessage({ tone: 'good', text: 'Progress restored from the backup.' });
    } catch (err) {
      setMessage({ tone: 'bad', text: `Nothing was changed: ${(err as Error).message}` });
    }
    setPending(null);
  };

  const summary = pending ? summarize(pending) : null;

  return (
    <div class="page settings">
      <header class="page-head">
        <div>
          <p class="eyebrow">Preferences & backup</p>
          <h1 lang="fr">Réglages</h1>
        </div>
      </header>

      <section class="card">
        <h2 class="card-title">Sessions</h2>
        <div class="setting">
          <div>
            <strong>Length</strong>
            <p class="quiet">
              About {SIZES[s.sessionSize].minutes} minutes: up to {SIZES[s.sessionSize].reviews} reviews and around {SIZES[s.sessionSize].fresh} new
              items.
            </p>
          </div>
          <Segmented
            value={s.sessionSize}
            options={(Object.keys(SIZES) as SessionSize[]).map((k) => [k, SIZE_LABEL[k]])}
            onChange={(v) => set({ sessionSize: v })}
          />
        </div>
        <div class="setting">
          <div>
            <strong>Sound effects</strong>
          </div>
          <Toggle on={s.sound} onChange={(v) => set({ sound: v })} label="Sound effects" />
        </div>
        <div class="setting">
          <div>
            <strong>Appearance</strong>
          </div>
          <Segmented value={s.theme} options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => set({ theme: v })} />
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">French voice</h2>
        {!canSpeak.value ? (
          <p class="quiet">This device has no French voice, so listening exercises are switched off.</p>
        ) : (
          <>
            <div class="setting">
              <div>
                <strong>Read French aloud automatically</strong>
                <p class="quiet">Says each word or sentence when it appears and with the answer.</p>
              </div>
              <Toggle on={s.autoSpeak} onChange={(v) => set({ autoSpeak: v })} label="Read aloud automatically" />
            </div>
            <div class="setting">
              <div>
                <strong>Speed</strong>
              </div>
              <Segmented
                value={String(s.speechRate)}
                options={[['0.7', 'Slow'], ['0.9', 'Normal'], ['1', 'Fast']]}
                onChange={(v) => set({ speechRate: Number(v) })}
              />
            </div>
            {frenchVoices.value.length > 0 && (
              <div class="setting">
                <div>
                  <strong>Voice</strong>
                  <p class="quiet">
                    For a more natural voice, download an “Enhanced” French voice in the iPad’s Settings → Accessibility → Spoken
                    Content → Voices → French.
                  </p>
                </div>
                <select
                  class="select"
                  value={s.voiceURI ?? frenchVoices.value[0].voiceURI}
                  onChange={(e) => set({ voiceURI: (e.target as HTMLSelectElement).value })}
                >
                  {frenchVoices.value.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button kind="secondary" onClick={() => speak('Bonjour ! Je suis ta voix française.')}>
              <Icon name="speaker" size={20} /> Test the voice
            </Button>
          </>
        )}
      </section>

      <section class="card">
        <h2 class="card-title">Backup</h2>
        <p>
          Your progress is stored on this iPad only. A backup is a small file you can keep in iCloud Drive: tap <em>Back up</em>, then
          choose <em>Save to Files</em>.
        </p>
        <p class="quiet">
          {p.lastBackupAt ? `Last backup: ${formatDate(p.lastBackupAt)}.` : 'No backup yet.'} {cards.value.size} items with progress.
        </p>
        <div class="button-row">
          <Button onClick={() => void doExport()}>
            <Icon name="download" size={20} /> Back up
          </Button>
          <Button kind="secondary" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={20} /> Restore from a backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            class="visually-hidden"
            onChange={(e) => void onFile((e.target as HTMLInputElement).files?.[0])}
          />
        </div>
        {message && <div class={`banner banner-${message.tone}`}>{message.text}</div>}
      </section>

      <section class="card">
        <h2 class="card-title">About</h2>
        <p class="quiet">
          Croissant · {catalog.lessons.length} lessons, {catalog.study.length} items · built {formatDate(__BUILD_TIME__)}
        </p>
        <p class="quiet">Works offline. New lessons arrive when the app is opened with an internet connection.</p>
        {resetStep === 0 ? (
          <button type="button" class="link link-danger" onClick={() => setResetStep(1)}>
            Erase all progress…
          </button>
        ) : (
          <div class="banner banner-bad">
            <span>This erases every answer, the streak and the XP on this iPad. It cannot be undone without a backup.</span>
            <span class="banner-actions">
              <button type="button" class="link" onClick={() => setResetStep(0)}>
                Cancel
              </button>
              <Button
                kind="danger"
                onClick={() => {
                  void resetEverything().then(() => {
                    setResetStep(0);
                    setMessage({ tone: 'good', text: 'All progress erased.' });
                  });
                }}
              >
                Erase everything
              </Button>
            </span>
          </div>
        )}
      </section>

      {pending && summary && (
        <div class="dialog-backdrop" onClick={() => setPending(null)}>
          <div class="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Restore this backup?</h2>
            <p>
              Made on {formatDate(summary.exportedAt)}: {summary.items} items with progress, {summary.xp} XP, a {summary.streak}-day streak.
            </p>
            <p>
              It will <strong>replace</strong> what is on this iPad now ({cards.value.size} items, {p.xp} XP).
            </p>
            <div class="dialog-actions">
              <Button kind="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button onClick={() => void doRestore()}>Restore</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
