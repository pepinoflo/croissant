import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newlyUnlocked, type AchievementStats } from '../src/game/achievements';
import { completeDay, initialStreak, reconcile, MAX_FREEZES, type StreakState } from '../src/game/streak';
import { levelForXp, levelInfo, titleForLevel, xpForAnswer, xpForLevel } from '../src/game/xp';

function play(days: string[], start: StreakState = initialStreak()): StreakState {
  let s = start;
  for (const d of days) {
    s = reconcile(s, d).streak;
    s = completeDay(s, d).streak;
  }
  return s;
}

describe('streak', () => {
  it('starts at zero with one freeze in hand', () => {
    expect(initialStreak()).toEqual({ current: 0, best: 0, lastDay: null, freezes: 1 });
  });

  it('grows by one for each consecutive day', () => {
    const s = play(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.lastDay).toBe('2026-03-03');
  });

  it('counts a day only once however many sessions are done', () => {
    let s = play(['2026-03-01']);
    const again = completeDay(s, '2026-03-01');
    expect(again.extended).toBe(false);
    s = again.streak;
    expect(s.current).toBe(1);
  });

  it('uses a freeze for one missed day and keeps the streak', () => {
    const s = play(['2026-03-01', '2026-03-02']);
    const r = reconcile(s, '2026-03-04');
    expect(r.broken).toBe(false);
    expect(r.frozenDays).toEqual(['2026-03-03']);
    expect(r.streak.freezes).toBe(0);
    expect(completeDay(r.streak, '2026-03-04').streak.current).toBe(3);
  });

  it('breaks the streak when there are more missed days than freezes', () => {
    const s = play(['2026-03-01', '2026-03-02']);
    const r = reconcile(s, '2026-03-05');
    expect(r.broken).toBe(true);
    expect(r.streak.current).toBe(0);
    expect(r.streak.best).toBe(2);
    // The unused freeze is kept, and a new streak starts from one.
    expect(r.streak.freezes).toBe(1);
    expect(completeDay(r.streak, '2026-03-05').streak.current).toBe(1);
  });

  it('breaks after the freeze has already been spent', () => {
    let s = play(['2026-03-01', '2026-03-02']);
    s = play(['2026-03-04'], s); // uses the freeze for the 3rd
    expect(s.freezes).toBe(0);
    expect(reconcile(s, '2026-03-06').broken).toBe(true);
  });

  it('earns a freeze every five days, up to the maximum', () => {
    const days = Array.from({ length: 15 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);
    const s = play(days);
    expect(s.current).toBe(15);
    expect(s.freezes).toBe(MAX_FREEZES);
    const fifth = completeDay(play(days.slice(0, 4)), days[4]);
    expect(fifth.freezeEarned).toBe(true);
  });

  it('works across month and year boundaries', () => {
    expect(play(['2025-12-30', '2025-12-31', '2026-01-01']).current).toBe(3);
    expect(play(['2026-02-28', '2026-03-01']).current).toBe(2);
  });

  it('does nothing when the app is reopened on the same or the next day', () => {
    const s = play(['2026-03-01']);
    expect(reconcile(s, '2026-03-01').streak).toEqual(s);
    expect(reconcile(s, '2026-03-02').streak).toEqual(s);
  });
});

describe('xp and levels', () => {
  it('has rising thresholds', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    for (let l = 2; l < 40; l++) {
      expect(xpForLevel(l + 1) - xpForLevel(l)).toBeGreaterThan(xpForLevel(l) - xpForLevel(l - 1));
    }
  });

  it('finds the level for any amount of xp', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(xpForLevel(17))).toBe(17);
    expect(levelForXp(xpForLevel(17) - 1)).toBe(16);
  });

  it('reports progress inside the level', () => {
    const info = levelInfo(175);
    expect(info.level).toBe(2);
    expect(info.into).toBe(75);
    expect(info.span).toBe(150);
    expect(info.progress).toBeCloseTo(0.5);
    expect(info.title).toBe(titleForLevel(2));
  });

  it('gives nothing for a wrong answer, less for a corrected one, more with a combo', () => {
    expect(xpForAnswer('type', 'wrong', 4)).toBe(0);
    expect(xpForAnswer('type', 'accent', 0)).toBeLessThan(xpForAnswer('type', 'exact', 0));
    expect(xpForAnswer('choice', 'exact', 3)).toBe(xpForAnswer('choice', 'exact', 0) + 3);
    expect(xpForAnswer('choice', 'exact', 50)).toBe(xpForAnswer('choice', 'exact', 5));
    expect(xpForAnswer('type', 'exact', 0)).toBeGreaterThan(xpForAnswer('choice', 'exact', 0));
  });
});

describe('achievements', () => {
  const zero: AchievementStats = {
    sessions: 0, perfectSessions: 0, bestStreak: 0, itemsSeen: 0, itemsMastered: 0,
    lessonsCompleted: 0, lessonsMastered: 0, answers: 0, sprintBest: 0, level: 1,
  };
  it('have unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
  it('unlock nothing at the start', () => {
    expect(newlyUnlocked(zero, {})).toEqual([]);
  });
  it('unlock once, when earned', () => {
    const stats = { ...zero, sessions: 1, bestStreak: 3 };
    expect(newlyUnlocked(stats, {}).map((a) => a.id)).toEqual(['first-session', 'streak-3']);
    expect(newlyUnlocked(stats, { 'first-session': 1 }).map((a) => a.id)).toEqual(['streak-3']);
  });
});
