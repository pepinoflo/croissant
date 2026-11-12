// Daily streak with "freezes": a missed day uses up a freeze instead of
// breaking the streak. One freeze is earned for every five days in a row.

import { addDays, daysBetween } from '../srs/day';

export interface StreakState {
  current: number;
  best: number;
  /** Last day covered, either by a finished session or by a freeze. */
  lastDay: string | null;
  freezes: number;
}

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 5;

export function initialStreak(): StreakState {
  return { current: 0, best: 0, lastDay: null, freezes: 1 };
}

export interface ReconcileResult {
  streak: StreakState;
  /** Days that were saved by a freeze. */
  frozenDays: string[];
  /** True if a streak was lost. */
  broken: boolean;
}

/**
 * Brings the streak up to date when the app is opened on `today`:
 * missed days are covered by freezes if there are enough, otherwise the streak ends.
 */
export function reconcile(streak: StreakState, today: string): ReconcileResult {
  if (!streak.lastDay || streak.current === 0) return { streak, frozenDays: [], broken: false };
  const missed = daysBetween(streak.lastDay, today) - 1;
  if (missed <= 0) return { streak, frozenDays: [], broken: false };
  if (missed <= streak.freezes) {
    const frozenDays = Array.from({ length: missed }, (_, i) => addDays(streak.lastDay!, i + 1));
    return {
      streak: { ...streak, freezes: streak.freezes - missed, lastDay: addDays(today, -1) },
      frozenDays,
      broken: false,
    };
  }
  return { streak: { ...streak, current: 0 }, frozenDays: [], broken: true };
}

export interface CompleteResult {
  streak: StreakState;
  /** True if today was not already counted. */
  extended: boolean;
  freezeEarned: boolean;
}

/** Records a finished session on `today`. Call reconcile first. */
export function completeDay(streak: StreakState, today: string): CompleteResult {
  if (streak.lastDay === today && streak.current > 0) {
    return { streak, extended: false, freezeEarned: false };
  }
  const current = streak.current + 1;
  const freezeEarned = current % FREEZE_EVERY === 0 && streak.freezes < MAX_FREEZES;
  return {
    streak: {
      current,
      best: Math.max(streak.best, current),
      lastDay: today,
      freezes: streak.freezes + (freezeEarned ? 1 : 0),
    },
    extended: true,
    freezeEarned,
  };
}
