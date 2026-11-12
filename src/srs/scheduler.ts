// Spaced repetition, built on FSRS (the algorithm behind modern Anki).
//
// Why FSRS rather than SM-2: it models how well each item is remembered
// (stability and difficulty) instead of multiplying intervals by a fixed ease
// factor. In practice that means fewer reviews for the same retention, sensible
// behaviour when a review happens late or early, and items that are already
// known can jump straight to long intervals.
//
// Scheduling is in whole days: an item answered today is next due on some
// later day, and anything due "today" is due for the whole day.

import { createEmptyCard, fsrs, Rating, type Card, type FSRS } from 'ts-fsrs';
import { dayKey, daysBetween, DAY_MS } from './day';

export type Grade = 'again' | 'hard' | 'good' | 'easy';

/** Everything stored about one item. Plain JSON so it can be saved and exported as is. */
export interface CardState {
  id: string;
  /** Timestamp (ms) the item is next due. */
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** FSRS state: 0 new, 1 learning, 2 review, 3 relearning. */
  state: number;
  lastReview: number | null;
  firstSeen: number;
  /** Simple counters for the statistics screens. */
  correct: number;
  wrong: number;
  /** The exercise format used last time, to avoid repeating it. */
  lastVariant?: string;
}

export type Stage = 'new' | 'learning' | 'familiar' | 'mastered';

export const TARGET_RETENTION = 0.9;
export const MAX_INTERVAL_DAYS = 365;
/** Stability (days) from which an item counts as mastered. */
export const MASTERED_STABILITY = 21;
export const FAMILIAR_STABILITY = 4;

const RATING: Record<Grade, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const engines = new Map<boolean, FSRS>();
function engine(fuzz: boolean): FSRS {
  let f = engines.get(fuzz);
  if (!f) {
    f = fsrs({
      request_retention: TARGET_RETENTION,
      maximum_interval: MAX_INTERVAL_DAYS,
      enable_fuzz: fuzz,
      // No minute-level learning steps: retries inside a session are handled
      // by the session itself, the scheduler only decides which day comes next.
      enable_short_term: false,
    });
    engines.set(fuzz, f);
  }
  return f;
}

export function newCard(id: string, now: number): CardState {
  const c = createEmptyCard(new Date(now));
  return {
    id,
    due: now,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: null,
    firstSeen: now,
    correct: 0,
    wrong: 0,
  };
}

function toFsrs(card: CardState): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

export interface ReviewOptions {
  /** Spread due dates a little so items learned together do not all return on one day. */
  fuzz?: boolean;
}

/** Returns the card as it should be after being answered with `grade` at `now`. */
export function review(card: CardState, grade: Grade, now: number, opts: ReviewOptions = {}): CardState {
  const { card: next } = engine(opts.fuzz ?? false).next(toFsrs(card), new Date(now), RATING[grade]);
  // A forgotten item always comes back the next day, whatever the model says.
  const scheduledDays =
    grade === 'again' ? 1 : Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(next.scheduled_days)));
  return {
    ...card,
    due: now + scheduledDays * DAY_MS,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    lastReview: now,
    correct: card.correct + (grade === 'again' ? 0 : 1),
    wrong: card.wrong + (grade === 'again' ? 1 : 0),
  };
}

/** Due if its due date falls on today or an earlier day. */
export function isDue(card: CardState, now: number): boolean {
  return daysBetween(dayKey(now), dayKey(card.due)) <= 0;
}

/** How many days overdue (0 if due today, negative if not yet due). */
export function overdueDays(card: CardState, now: number): number {
  return daysBetween(dayKey(card.due), dayKey(now));
}

/** Estimated probability (0–1) that the item would be recalled right now. */
export function retrievability(card: CardState, now: number): number {
  if (card.lastReview === null || card.stability <= 0) return 0;
  return engine(false).get_retrievability(toFsrs(card), new Date(now), false);
}

export function stageOf(card: CardState | undefined): Stage {
  if (!card || card.reps === 0) return 'new';
  if (card.stability >= MASTERED_STABILITY) return 'mastered';
  if (card.stability >= FAMILIAR_STABILITY) return 'familiar';
  return 'learning';
}
