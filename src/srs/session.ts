// Decides what goes into a session: which items are reviewed, which new
// ones are introduced, and in what order.

import type { Catalog } from '../content/catalog';
import { vocabDisplay } from '../content/french';
import type { StudyItem } from '../content/types';
import type { SessionSize } from '../storage/model';
import { isDue, overdueDays, retrievability, type CardState } from './scheduler';

export type Rng = () => number;

export interface Step {
  kind: 'intro' | 'grammar' | 'quiz' | 'match';
  /** The item concerned (the grammar card for 'grammar', the first item for 'match'). */
  itemId: string;
  /** All items of a match round. */
  itemIds?: string[];
  isNew: boolean;
  /** A second try at something missed earlier in the session; not graded again. */
  retry?: boolean;
}

export interface Plan {
  steps: Step[];
  reviewCount: number;
  newCount: number;
  /** 'extra' means nothing was due and nothing new was left: this is bonus practice. */
  mode: 'daily' | 'lesson' | 'extra';
}

export interface PlanOptions {
  catalog: Catalog;
  cards: Map<string, CardState>;
  now: number;
  size: SessionSize;
  /** Share of recent answers that were right (0–1), or null when there is no history. */
  recentAccuracy: number | null;
  rng: Rng;
  /** Practise one lesson instead of the daily mix. */
  focusLessonId?: string;
  seenGrammar?: Set<string>;
}

/**
 * A session aims at `questions` exercises: up to `reviews` items that are due,
 * and new items to fill the rest (around `fresh` on a typical day).
 */
export const SIZES: Record<SessionSize, { questions: number; reviews: number; fresh: number; minutes: number }> = {
  short: { questions: 15, reviews: 12, fresh: 4, minutes: 3 },
  normal: { questions: 25, reviews: 20, fresh: 8, minutes: 5 },
  long: { questions: 45, reviews: 36, fresh: 14, minutes: 10 },
};

export const MATCH_SIZE = 4;

export function shuffle<T>(list: T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isSeen = (card: CardState | undefined): card is CardState => !!card && card.reps > 0;

export interface Counts {
  due: number;
  unseen: number;
  seen: number;
}

export function countItems(catalog: Catalog, cards: Map<string, CardState>, now: number): Counts {
  let due = 0;
  let unseen = 0;
  let seen = 0;
  for (const item of catalog.study) {
    const card = cards.get(item.id);
    if (!isSeen(card)) unseen++;
    else {
      seen++;
      if (isDue(card, now)) due++;
    }
  }
  return { due, unseen, seen };
}

/**
 * How many new items to introduce: whatever room the due reviews leave in the
 * session. None when reviews have piled up, fewer when recent answers show a
 * struggle, a couple more when everything is going well.
 */
export function newAllowance(size: SessionSize, dueTotal: number, recentAccuracy: number | null): number {
  const { questions, reviews, fresh } = SIZES[size];
  if (dueTotal > reviews * 2) return 0;
  let n = Math.min(fresh * 2, questions - Math.min(dueTotal, reviews));
  if (recentAccuracy !== null) {
    if (recentAccuracy >= 0.9) n += 2;
    else if (recentAccuracy < 0.7) n = Math.ceil(n / 2);
  }
  return n;
}

/**
 * New items: half from the most recent lesson (to keep up with class), the rest
 * from the oldest lesson that still has unseen items (to work through the backlog).
 */
export function pickNew(catalog: Catalog, cards: Map<string, CardState>, n: number, focusLessonId?: string): StudyItem[] {
  if (n <= 0) return [];
  const unseenByLesson = new Map<string, StudyItem[]>();
  for (const item of catalog.study) {
    if (isSeen(cards.get(item.id))) continue;
    const lessonId = catalog.lessonOf.get(item.id)!.id;
    if (focusLessonId && lessonId !== focusLessonId) continue;
    const list = unseenByLesson.get(lessonId) ?? [];
    list.push(item);
    unseenByLesson.set(lessonId, list);
  }
  const lessons = catalog.lessons.filter((l) => unseenByLesson.has(l.id));
  if (!lessons.length) return [];
  const picked: StudyItem[] = [];
  const latest = unseenByLesson.get(lessons[lessons.length - 1].id)!;
  picked.push(...latest.splice(0, lessons.length === 1 ? n : Math.ceil(n / 2)));
  for (const lesson of lessons) {
    if (picked.length >= n) break;
    picked.push(...unseenByLesson.get(lesson.id)!.splice(0, n - picked.length));
  }
  return picked;
}

function matchEligible(item: StudyItem): boolean {
  if (item.type === 'vocab') return vocabDisplay(item).length <= 24 && item.en.length <= 28;
  if (item.type === 'phrase') return item.fr.length <= 24 && item.en.length <= 28;
  return false;
}

export function planSession(opts: PlanOptions): Plan {
  const { catalog, cards, now, size, rng } = opts;
  const cap = SIZES[size].reviews;
  const focus = opts.focusLessonId;
  const inScope = (item: StudyItem) => !focus || catalog.lessonOf.get(item.id)!.id === focus;

  const seen = catalog.study.filter((i) => inScope(i) && isSeen(cards.get(i.id)));
  const due = seen
    .filter((i) => isDue(cards.get(i.id)!, now))
    .sort((a, b) => overdueDays(cards.get(b.id)!, now) - overdueDays(cards.get(a.id)!, now));

  let reviews = due.slice(0, cap);
  let mode: Plan['mode'] = focus ? 'lesson' : 'daily';

  const dueTotal = focus ? reviews.length : due.length;
  const fresh = pickNew(catalog, cards, newAllowance(size, dueTotal, opts.recentAccuracy), focus);

  // Nothing due and nothing new (or practising one lesson with room to spare):
  // top up with the items most likely to have faded.
  if (focus || (!reviews.length && !fresh.length)) {
    if (!focus) mode = 'extra';
    const chosen = new Set(reviews.map((i) => i.id));
    const weakest = seen
      .filter((i) => !chosen.has(i.id))
      .sort((a, b) => retrievability(cards.get(a.id)!, now) - retrievability(cards.get(b.id)!, now));
    reviews = reviews.concat(weakest.slice(0, cap - reviews.length));
  }

  reviews = shuffle(reviews, rng);

  // Pull a few short review items into one match-the-pairs round.
  let match: Step | null = null;
  const eligible = reviews.filter(matchEligible);
  if (eligible.length >= MATCH_SIZE && rng() < 0.75) {
    const chosen = eligible.slice(0, MATCH_SIZE);
    const ids = new Set(chosen.map((i) => i.id));
    reviews = reviews.filter((i) => !ids.has(i.id));
    match = { kind: 'match', itemId: chosen[0].id, itemIds: chosen.map((i) => i.id), isNew: false };
  }

  const reviewSteps: Step[] = reviews.map((i) => ({ kind: 'quiz', itemId: i.id, isNew: false }));
  const steps: Step[] = reviewSteps.splice(0, Math.min(3, reviewSteps.length));

  // New items: a short introduction, then the first question a few steps later.
  const shownGrammar = new Set(opts.seenGrammar ?? []);
  const pending: StudyItem[] = [];
  const quizNew = (item: StudyItem) => {
    const ref = 'grammar' in item ? item.grammar : undefined;
    if (ref && catalog.items.has(ref) && !shownGrammar.has(ref)) {
      shownGrammar.add(ref);
      steps.push({ kind: 'grammar', itemId: ref, isNew: true });
    }
    steps.push({ kind: 'quiz', itemId: item.id, isNew: true });
  };
  for (const item of fresh) {
    if (item.type === 'cloze') {
      // Fill-in-the-blank sentences need no introduction: the question is the lesson.
      quizNew(item);
    } else {
      steps.push({ kind: 'intro', itemId: item.id, isNew: true });
      pending.push(item);
    }
    if (reviewSteps.length) steps.push(reviewSteps.shift()!);
    if (pending.length >= 2) quizNew(pending.shift()!);
  }
  while (pending.length) {
    if (reviewSteps.length) steps.push(reviewSteps.shift()!);
    quizNew(pending.shift()!);
  }
  steps.push(...reviewSteps);
  if (match) steps.splice(Math.ceil(steps.length / 2), 0, match);

  return {
    steps,
    reviewCount: reviews.length + (match ? MATCH_SIZE : 0),
    newCount: fresh.length,
    mode,
  };
}

/**
 * The next unseen item to bring into a session after one was skipped as
 * "already known". Prefers the lesson the skipped item came from.
 */
export function nextUnseen(
  catalog: Catalog,
  cards: Map<string, CardState>,
  planned: Set<string>,
  preferLessonId?: string,
  focusLessonId?: string,
): StudyItem | null {
  // Items already in the session count as seen for this purpose.
  const masked = new Map(cards);
  for (const id of planned) if (!isSeen(masked.get(id))) masked.set(id, { reps: 1 } as CardState);
  const lesson = focusLessonId ?? preferLessonId;
  const same = lesson ? pickNew(catalog, masked, 1, lesson) : [];
  if (same.length) return same[0];
  if (focusLessonId) return null;
  return pickNew(catalog, masked, 1)[0] ?? null;
}

/** Adds a new item after the current step: its introduction next, its first question a few steps later. */
export function withNewItem(steps: Step[], index: number, item: StudyItem): Step[] {
  const next = [...steps];
  const quiz: Step = { kind: 'quiz', itemId: item.id, isNew: true };
  if (item.type === 'cloze') {
    next.splice(Math.min(index + 1, next.length), 0, quiz);
    return next;
  }
  next.splice(index + 1, 0, { kind: 'intro', itemId: item.id, isNew: true });
  next.splice(Math.min(index + RETRY_GAP + 1, next.length), 0, quiz);
  return next;
}

/** Removes the question still to come for an item (used when it is skipped as already known). */
export function withoutQuiz(steps: Step[], index: number, itemId: string): Step[] {
  return steps.filter((s, i) => !(i > index && s.kind === 'quiz' && s.itemId === itemId));
}

export const RETRY_GAP = 4;
export const MAX_RETRIES = 2;

/**
 * After a wrong answer, the same item is asked again a few steps later
 * (at most twice per session). Returns the new list of steps.
 */
export function withRetry(steps: Step[], index: number): Step[] {
  const step = steps[index];
  if (step.kind !== 'quiz') return steps;
  const earlier = steps.filter((s) => s.retry && s.itemId === step.itemId).length;
  if (earlier >= MAX_RETRIES) return steps;
  const at = Math.min(index + RETRY_GAP, steps.length);
  const next = [...steps];
  next.splice(at, 0, { kind: 'quiz', itemId: step.itemId, isNew: false, retry: true });
  return next;
}
