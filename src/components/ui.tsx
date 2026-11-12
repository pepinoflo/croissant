// Small shared building blocks.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { pretty } from '../content/french';
import type { Media } from '../exercises/types';
import { sfx } from '../speech/sfx';
import { canSpeak, speak } from '../speech/tts';

const ICONS: Record<string, string> = {
  home: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zm0 15A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6M9 11h4',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8-3.5c0-.6-.1-1.2-.2-1.8l2-1.5-2-3.4-2.3.9a8 8 0 0 0-3-1.8L14 2h-4l-.4 2.4a8 8 0 0 0-3 1.8l-2.4-.9-2 3.4 2 1.5a8 8 0 0 0 0 3.6l-2 1.5 2 3.4 2.3-.9a8 8 0 0 0 3 1.8L10 22h4l.4-2.4a8 8 0 0 0 3-1.8l2.4.9 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8z',
  speaker: 'M4 9.5h3.5L13 5v14l-5.5-4.5H4zm12.5-.5a4.5 4.5 0 0 1 0 6m2.5-9a8.5 8.5 0 0 1 0 12',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 5l7 7-7 7',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.8.7-3 1.5-4 .5 1.5 1.5 2 2.5 2C11 8.5 10.5 6 12 3z',
  snow: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 6l-2-2m2 2 2-2m-2 14-2 2m2-2 2 2',
  bolt: 'M13 3 5 13.5h5.5L9.5 21l8.5-11h-5.5z',
  share: 'M12 15V3.5m0 0L8 7.5m4-4 4 4M5 12v7.5h14V12',
  download: 'M12 4v11.5m0 0-4-4m4 4 4-4M5 19.5h14',
  upload: 'M12 16V4.5m0 0-4 4m4-4 4 4M5 19.5h14',
  turtle: 'M4 14c0-4 3.5-7 8-7s8 3 8 7H4zm2 0v3m12-3v3M20 12.5l2-1',
};

export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The app's mark: a croissant. */
export function Croissant({ size = 48, muted = false }: { size?: number; muted?: boolean }) {
  const fill = muted ? 'var(--line)' : '#F0B04A';
  const edge = muted ? 'var(--line-strong)' : '#9A5A16';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" class="croissant">
      <path
        d="M9 68C4 40 24 14 48 14s44 26 39 54c-7-13-20-22-39-22S16 55 9 68z"
        fill={fill}
        stroke={edge}
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path
        d="M37 15.5c-2 10-1 21 2 31M59 15.5c2 10 1 21-2 31M20 30c3 8 7 15 11 21M76 30c-3 8-7 15-11 21"
        fill="none"
        stroke={edge}
        stroke-width="3.5"
        stroke-linecap="round"
      />
      {!muted && <path d="M28 27c5-4 11-6 17-6.5" fill="none" stroke="#FBD98F" stroke-width="3" stroke-linecap="round" />}
    </svg>
  );
}

const BASE = import.meta.env.BASE_URL;

export function Picture({ media, size = 96 }: { media: Media; size?: number }) {
  if (media.image) {
    return <img class="picture" src={BASE + media.image} width={size} height={size} alt="" draggable={false} />;
  }
  return (
    <span class="picture picture-emoji" style={{ fontSize: `${Math.round(size * 0.82)}px`, width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      {media.emoji}
    </span>
  );
}

export function SpeakButton({ text, big = false, label = 'Listen' }: { text: string; big?: boolean; label?: string }) {
  if (!canSpeak.value) return null;
  return (
    <button
      type="button"
      class={`speak ${big ? 'speak-big' : ''}`}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
    >
      <Icon name="speaker" size={big ? 44 : 22} />
    </button>
  );
}

/** French text set in the display face, with proper apostrophes and spacing. */
export function Fr({ children, class: cls = '' }: { children: string; class?: string }) {
  return (
    <span lang="fr" class={`fr ${cls}`}>
      {pretty(children)}
    </span>
  );
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'good' | 'ink' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div class={`bar bar-${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div class="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 120, children }: { value: number; size?: number; children?: ComponentChildren }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div class="ring" style={{ width: `${size}px`, height: `${size}px` }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--track)" stroke-width="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--accent)"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray={`${c * v} ${c}`}
          transform="rotate(-90 60 60)"
          class="ring-value"
        />
      </svg>
      <div class="ring-center">{children}</div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = 'primary',
  disabled = false,
  wide = false,
  type = 'button',
}: {
  children: ComponentChildren;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'good' | 'bad' | 'danger';
  disabled?: boolean;
  wide?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      class={`btn btn-${kind} ${wide ? 'btn-wide' : ''}`}
      disabled={disabled}
      onClick={() => {
        sfx.tap();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/** Renders **bold** and paragraphs from a plain string. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith('**') ? <strong key={j}>{pretty(part.slice(2, -2))}</strong> : pretty(part),
          )}
        </p>
      ))}
    </>
  );
}

const CONFETTI_COLORS = ['#F0B04A', '#E0533D', '#3E7CB1', '#3F9B76', '#F6D4C8', '#FBD98F'];

/** A short burst of confetti drawn on a canvas, then removed. */
export function Confetti({ pieces = 110 }: { pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    const parts = Array.from({ length: pieces }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (-Math.random() * 13 - 5) * dpr,
      size: (5 + Math.random() * 7) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.32 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = Math.max(0, 1 - frame / 150);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        g.restore();
      }
      if (frame < 150) raf = requestAnimationFrame(tick);
      else g.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pieces]);
  return <canvas ref={ref} class="confetti" aria-hidden="true" />;
}
