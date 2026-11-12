// The shapes of everything saved on the device.

import { initialStreak, type StreakState } from '../game/streak';
import type { CardState } from '../srs/scheduler';

export type SessionSize = 'short' | 'normal' | 'long';

export interface Profile {
  createdAt: number;
  xp: number;
  streak: StreakState;
  totals: {
    answers: number;
    correct: number;
    sessions: number;
    perfectSessions: number;
  };
  /** The last answers (1 right, 0 wrong), newest last; used to adapt difficulty. */
  recent: number[];
  /** Achievement id → time unlocked. */
  achievements: Record<string, number>;
  /** Grammar cards already shown as a reminder during a session. */
  seenGrammar: string[];
  sprintBest: number;
  lastBackupAt: number | null;
  backupSnoozedUntil: number | null;
}

export interface Settings {
  sessionSize: SessionSize;
  sound: boolean;
  autoSpeak: boolean;
  voiceURI: string | null;
  speechRate: number;
  theme: 'auto' | 'light' | 'dark';
}

export interface DayRecord {
  day: string;
  xp: number;
  answers: number;
  correct: number;
  sessions: number;
  /** The day was missed but covered by a streak freeze. */
  frozen?: boolean;
}

export interface ProgressData {
  cards: CardState[];
  days: DayRecord[];
  profile: Profile;
  settings: Settings;
}

export const RECENT_WINDOW = 50;

export function defaultProfile(now: number): Profile {
  return {
    createdAt: now,
    xp: 0,
    streak: initialStreak(),
    totals: { answers: 0, correct: 0, sessions: 0, perfectSessions: 0 },
    recent: [],
    achievements: {},
    seenGrammar: [],
    sprintBest: 0,
    lastBackupAt: null,
    backupSnoozedUntil: null,
  };
}

export function defaultSettings(): Settings {
  return {
    sessionSize: 'normal',
    sound: true,
    autoSpeak: true,
    voiceURI: null,
    speechRate: 0.9,
    theme: 'auto',
  };
}

export function emptyDay(day: string): DayRecord {
  return { day, xp: 0, answers: 0, correct: 0, sessions: 0 };
}
