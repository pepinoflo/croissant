import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey } from '../src/srs/day';
import {
  isDue,
  newCard,
  overdueDays,
  retrievability,
  review,
  stageOf,
  MAX_INTERVAL_DAYS,
  type CardState,
  type Grade,
} from '../src/srs/scheduler';

// Noon local time, so adding whole days never crosses the 3 a.m. day boundary.
const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function answer(grades: Grade[], start = T0): CardState {
  let card = newCard('x', start);
  let now = start;
  for (const g of grades) {
    card = review(card, g, now);
    now = card.due;
  }
  return card;
}

describe('scheduler', () => {
  it('starts a new card as unseen and due', () => {
    const card = newCard('a', T0);
    expect(card.reps).toBe(0);
    expect(stageOf(card)).toBe('new');
    expect(isDue(card, T0)).toBe(true);
  });

  it('never schedules a review for the same day', () => {
    for (const g of ['again', 'hard', 'good', 'easy'] as Grade[]) {
      const card = review(newCard('a', T0), g, T0);
      expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
      expect(isDue(card, T0)).toBe(false);
      expect(card.lastReview).toBe(T0);
    }
  });

  it('brings a wrong answer back sooner than a right one', () => {
    const base = newCard('a', T0);
    const again = review(base, 'again', T0);
    const hard = review(base, 'hard', T0);
    const good = review(base, 'good', T0);
    const easy = review(base, 'easy', T0);
    expect(again.scheduledDays).toBe(1);
    expect(again.due).toBeLessThan(good.due);
    expect(hard.due).toBeLessThanOrEqual(good.due);
    expect(good.due).toBeLessThan(easy.due);
  });

  it('grows the interval with each successful review', () => {
    let card = newCard('a', T0);
    let now = T0;
    let last = 0;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      card = review(card, 'good', now);
      expect(card.scheduledDays).toBeGreaterThan(last);
      last = card.scheduledDays;
      intervals.push(last);
      now = card.due;
    }
    // Days, then about a week or two, then weeks: not minutes and not years.
    expect(intervals[0]).toBeLessThanOrEqual(4);
    expect(intervals[3]).toBeGreaterThan(21);
    expect(card.reps).toBe(4);
    expect(card.correct).toBe(4);
  });

  it('shrinks the interval and counts a lapse when a known item is forgotten', () => {
    const known = answer(['good', 'good', 'good', 'good']);
    const lapsed = review(known, 'again', known.due);
    expect(lapsed.scheduledDays).toBe(1);
    expect(lapsed.stability).toBeLessThan(known.stability);
    expect(lapsed.lapses).toBe(known.lapses + 1);
    expect(lapsed.wrong).toBe(1);
    // …and it recovers more slowly than it was first learned.
    const recovered = review(lapsed, 'good', lapsed.due);
    expect(recovered.scheduledDays).toBeLessThan(known.scheduledDays);
  });

  it('makes a difficult item harder and an easy one easier', () => {
    const hard = answer(['good', 'again', 'again']);
    const easy = answer(['good', 'easy', 'easy']);
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty);
  });

  it('caps the interval at one year', () => {
    const card = answer(Array<Grade>(25).fill('easy'));
    expect(card.scheduledDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
  });

  it('treats anything due today or earlier as due, and nothing else', () => {
    const card = review(newCard('a', T0), 'good', T0);
    const dueDay = card.due;
    expect(isDue(card, dueDay - DAY_MS)).toBe(false);
    // Due at noon, but the whole of that day counts — even early morning.
    const sameDayMorning = new Date(dueDay).setHours(7, 0, 0, 0);
    expect(isDue(card, sameDayMorning)).toBe(true);
    expect(isDue(card, dueDay + 5 * DAY_MS)).toBe(true);
    expect(overdueDays(card, dueDay + 5 * DAY_MS)).toBe(5);
  });

  it('rewards a late review that is still remembered with a longer interval', () => {
    const card = answer(['good', 'good']);
    const onTime = review(card, 'good', card.due);
    const late = review(card, 'good', card.due + 20 * DAY_MS);
    expect(late.stability).toBeGreaterThan(onTime.stability);
  });

  it('estimates recall as falling over time', () => {
    const card = answer(['good', 'good']);
    const at = card.lastReview!;
    expect(retrievability(card, at + DAY_MS)).toBeGreaterThan(retrievability(card, at + 30 * DAY_MS));
    expect(retrievability(newCard('n', T0), T0)).toBe(0);
  });

  it('moves through the stages as stability grows', () => {
    expect(stageOf(undefined)).toBe('new');
    expect(stageOf(answer(['again']))).toBe('learning');
    expect(stageOf(answer(['good', 'good', 'good', 'good', 'good']))).toBe('mastered');
  });

  it('is deterministic without fuzz and survives a JSON round trip', () => {
    const a = answer(['good', 'hard', 'good']);
    const b = answer(['good', 'hard', 'good']);
    expect(a).toEqual(b);
    const restored: CardState = JSON.parse(JSON.stringify(a));
    expect(review(restored, 'good', a.due)).toEqual(review(a, 'good', a.due));
  });

  it('does not mutate the card it is given', () => {
    const card = newCard('a', T0);
    const copy = { ...card };
    review(card, 'good', T0);
    expect(card).toEqual(copy);
  });
});

describe('day boundaries', () => {
  it('counts a session after midnight as part of the evening before', () => {
    const late = new Date(2026, 0, 11, 1, 30).getTime();
    const morning = new Date(2026, 0, 11, 8, 0).getTime();
    expect(dayKey(late)).toBe('2026-01-10');
    expect(dayKey(morning)).toBe('2026-01-11');
  });
});
