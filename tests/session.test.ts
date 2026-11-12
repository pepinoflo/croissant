import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/content/catalog';
import type { Lesson, StudyItem } from '../src/content/types';
import { difficultyLevel, generateMatch, pickDistractors, type GenContext } from '../src/exercises/generate';
import { DAY_MS } from '../src/srs/day';
import { newCard, review, type CardState } from '../src/srs/scheduler';
import {
  countItems,
  newAllowance,
  pickNew,
  planSession,
  withRetry,
  MATCH_SIZE,
  MAX_RETRIES,
  SIZES,
  type Step,
} from '../src/srs/session';
import { loadCatalog, seeded } from './helpers';

const NOW = new Date(2026, 5, 1, 12).getTime();
const catalog = loadCatalog();

/** Marks items as learned at `when`, with the given next-due offset in days. */
function learned(items: StudyItem[], when: number): Map<string, CardState> {
  const cards = new Map<string, CardState>();
  for (const item of items) cards.set(item.id, review(newCard(item.id, when), 'good', when));
  return cards;
}

const plan = (cards: Map<string, CardState>, extra: Partial<Parameters<typeof planSession>[0]> = {}) =>
  planSession({ catalog, cards, now: NOW, size: 'normal', recentAccuracy: null, rng: seeded(1), ...extra });

const quizIds = (steps: Step[]) => steps.filter((s) => s.kind === 'quiz').map((s) => s.itemId);

describe('newAllowance', () => {
  it('introduces more new items when there is little to review', () => {
    expect(newAllowance('normal', 0, null)).toBeGreaterThan(SIZES.normal.fresh);
    expect(newAllowance('normal', 0, null)).toBeLessThanOrEqual(SIZES.normal.fresh * 2);
    expect(newAllowance('normal', SIZES.normal.reviews, null)).toBe(SIZES.normal.fresh);
  });
  it('stops introducing new items when reviews have piled up', () => {
    expect(newAllowance('normal', SIZES.normal.reviews * 2 + 1, null)).toBe(0);
  });
  it('adapts to recent accuracy', () => {
    const due = SIZES.normal.reviews;
    expect(newAllowance('normal', due, 0.95)).toBeGreaterThan(newAllowance('normal', due, 0.8));
    expect(newAllowance('normal', due, 0.5)).toBeLessThan(newAllowance('normal', due, 0.8));
  });
});

describe('pickNew', () => {
  it('takes half from the latest lesson and the rest from the oldest unfinished one', () => {
    const picked = pickNew(catalog, new Map(), 8);
    const lessons = picked.map((i) => catalog.lessonOf.get(i.id)!.order);
    const last = catalog.lessons.length;
    expect(lessons.filter((o) => o === last)).toHaveLength(4);
    expect(lessons.filter((o) => o === 1)).toHaveLength(4);
  });

  it('follows the order of the lesson file and skips what has been seen', () => {
    const first = catalog.study.filter((i) => catalog.lessonOf.get(i.id)!.order === 1);
    const cards = learned(first.slice(0, 3), NOW);
    const picked = pickNew(catalog, cards, 4, catalog.lessons[0].id);
    expect(picked.map((i) => i.id)).toEqual(first.slice(3, 7).map((i) => i.id));
  });

  it('moves on to the next lesson when one is finished, and stops when nothing is left', () => {
    const allButLast = catalog.study.filter((i) => catalog.lessonOf.get(i.id)!.order > 1);
    const picked = pickNew(catalog, learned(allButLast, NOW), 5);
    expect(picked.every((i) => catalog.lessonOf.get(i.id)!.order === 1)).toBe(true);
    expect(pickNew(catalog, learned(catalog.study, NOW), 5)).toEqual([]);
  });
});

describe('planSession', () => {
  it('on the first day introduces new items, each followed later by its first question', () => {
    const p = plan(new Map());
    expect(p.mode).toBe('daily');
    expect(p.reviewCount).toBe(0);
    expect(p.newCount).toBe(newAllowance('normal', 0, null));
    const introduced = p.steps.filter((s) => s.kind === 'intro').map((s) => s.itemId);
    for (const id of introduced) {
      const intro = p.steps.findIndex((s) => s.kind === 'intro' && s.itemId === id);
      const quiz = p.steps.findIndex((s) => s.kind === 'quiz' && s.itemId === id);
      expect(quiz - intro, id).toBeGreaterThanOrEqual(2);
    }
    // Every new item is quizzed exactly once.
    const quizzed = quizIds(p.steps);
    expect(new Set(quizzed).size).toBe(quizzed.length);
    expect(quizzed.length).toBe(p.newCount);
  });

  it('shows a grammar reminder once before the first exercise that needs it', () => {
    const p = plan(new Map());
    const grammar = p.steps.filter((s) => s.kind === 'grammar');
    expect(grammar.length).toBeGreaterThan(0);
    expect(new Set(grammar.map((s) => s.itemId)).size).toBe(grammar.length);
    for (const g of grammar) expect(catalog.items.get(g.itemId)?.type).toBe('grammar');
    const again = plan(new Map(), { seenGrammar: new Set(grammar.map((s) => s.itemId)) });
    expect(again.steps.filter((s) => s.kind === 'grammar' && grammar.some((g) => g.itemId === s.itemId))).toEqual([]);
  });

  it('reviews what is due and leaves out what is not', () => {
    const items = catalog.study.slice(0, 12);
    const cards = learned(items.slice(0, 6), NOW - 10 * DAY_MS); // due long ago
    for (const [id, c] of learned(items.slice(6), NOW)) cards.set(id, c); // just reviewed
    const p = plan(cards);
    const asked = new Set(p.steps.flatMap((s) => s.itemIds ?? [s.itemId]));
    for (const item of items.slice(0, 6)) expect(asked.has(item.id), item.id).toBe(true);
    for (const item of items.slice(6)) expect(asked.has(item.id), item.id).toBe(false);
    expect(p.reviewCount).toBe(6);
  });

  it('caps reviews at the session size, most overdue first, and adds nothing new when swamped', () => {
    const many = catalog.study.slice(0, 60);
    const cards = learned(many.slice(0, 30), NOW - 30 * DAY_MS);
    for (const [id, c] of learned(many.slice(30), NOW - 5 * DAY_MS)) cards.set(id, c);
    const p = plan(cards, { size: 'short' });
    expect(p.reviewCount).toBe(SIZES.short.reviews);
    expect(p.newCount).toBe(0);
    const asked = p.steps.flatMap((s) => s.itemIds ?? [s.itemId]);
    const oldest = new Set(many.slice(0, 30).map((i) => i.id));
    expect(asked.every((id) => oldest.has(id))).toBe(true);
  });

  it('offers extra practice when nothing is due and nothing is new', () => {
    const p = plan(learned(catalog.study, NOW));
    expect(p.mode).toBe('extra');
    expect(p.newCount).toBe(0);
    expect(p.reviewCount).toBe(SIZES.normal.reviews);
  });

  it('keeps to one lesson when asked', () => {
    const lesson = catalog.lessons[4];
    const p = plan(new Map(), { focusLessonId: lesson.id });
    expect(p.mode).toBe('lesson');
    for (const s of p.steps) expect(catalog.lessonOf.get(s.itemId)!.id).toBe(lesson.id);
  });

  it('builds at most one match round, from review items only', () => {
    const vocab = catalog.study.filter((i) => i.type === 'vocab').slice(0, 20);
    const cards = learned(vocab, NOW - 5 * DAY_MS);
    let withMatch = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const p = plan(cards, { rng: seeded(seed) });
      const matches = p.steps.filter((s) => s.kind === 'match');
      expect(matches.length).toBeLessThanOrEqual(1);
      for (const m of matches) {
        withMatch++;
        expect(m.itemIds).toHaveLength(MATCH_SIZE);
        expect(m.itemIds!.every((id) => cards.has(id))).toBe(true);
        // Items in the match round are not also asked on their own.
        expect(quizIds(p.steps).filter((id) => m.itemIds!.includes(id))).toEqual([]);
      }
    }
    expect(withMatch).toBeGreaterThan(5);
  });

  it('is repeatable for the same inputs', () => {
    expect(plan(new Map(), { rng: seeded(3) })).toEqual(plan(new Map(), { rng: seeded(3) }));
  });
});

describe('withRetry', () => {
  const steps: Step[] = Array.from({ length: 8 }, (_, i) => ({ kind: 'quiz', itemId: `i${i}`, isNew: false }));

  it('asks a missed item again a few steps later', () => {
    const next = withRetry(steps, 1);
    expect(next).toHaveLength(9);
    expect(next[5]).toEqual({ kind: 'quiz', itemId: 'i1', isNew: false, retry: true });
  });

  it('puts the retry at the end when the session is nearly over', () => {
    const next = withRetry(steps, 7);
    expect(next[next.length - 1]).toMatchObject({ itemId: 'i7', retry: true });
  });

  it('gives up after a couple of retries', () => {
    let s = steps;
    let index = 1;
    for (let i = 0; i < MAX_RETRIES + 2; i++) {
      s = withRetry(s, index);
      index = s.findIndex((x, j) => j > index && x.itemId === 'i1');
      if (index < 0) break;
    }
    expect(s.filter((x) => x.itemId === 'i1' && x.retry)).toHaveLength(MAX_RETRIES);
  });
});

describe('countItems', () => {
  it('counts due, seen and unseen', () => {
    const cards = learned(catalog.study.slice(0, 5), NOW - 10 * DAY_MS);
    for (const [id, c] of learned(catalog.study.slice(5, 8), NOW)) cards.set(id, c);
    expect(countItems(catalog, cards, NOW)).toEqual({ due: 5, seen: 8, unseen: catalog.study.length - 8 });
  });
});

describe('exercise difficulty', () => {
  const ctx = { rng: seeded(5), recentAccuracy: null };
  it('starts with recognition and moves to production as memory strengthens', () => {
    expect(difficultyLevel(undefined, ctx)).toBe(0);
    let card = review(newCard('a', NOW), 'good', NOW);
    expect(difficultyLevel(card, ctx)).toBe(1);
    for (let i = 0; i < 3; i++) card = review(card, 'good', card.due);
    expect(difficultyLevel(card, ctx)).toBe(2);
  });
  it('drops back after a lapse', () => {
    let card = review(newCard('a', NOW), 'good', NOW);
    for (let i = 0; i < 3; i++) card = review(card, 'good', card.due);
    card = review(card, 'again', card.due);
    expect(difficultyLevel(card, ctx)).toBeLessThan(2);
  });
});

describe('distractors', () => {
  const gen: GenContext = { catalog, cards: new Map(), rng: seeded(11), canSpeak: true, recentAccuracy: null };

  it('never offer a synonym of the right answer as a wrong option', () => {
    // dehors / à l'extérieur and dedans / à l'intérieur are pairs of synonyms.
    const dehors = catalog.items.get('l01.v.dehors');
    expect(dehors?.type).toBe('vocab');
    if (dehors?.type !== 'vocab') return;
    for (let i = 0; i < 30; i++) {
      const wrong = pickDistractors(dehors, 3, gen, { label: (it) => it.en });
      for (const w of wrong) {
        expect(['outside', 'outdoors']).not.toContain(w.en);
        expect(w.type).toBe('vocab');
      }
      expect(wrong).toHaveLength(3);
    }
  });

  it('use different pictures from the answer and from each other', () => {
    const tiny = buildCatalog([
      {
        schema: 1, id: 'l01-t', order: 1, title: 't', titleEn: 't', emoji: 't', summary: 't',
        items: ['🍎', '🍎', '🍌', '🍌', '🍐', '🍊'].map((emoji, i) => ({
          id: `l01.v.w${i}`, type: 'vocab', fr: `mot${i}`, en: `word${i}`, pos: 'noun', gender: 'm', emoji,
        })),
      } as Lesson,
    ]);
    const target = tiny.study[0] as Extract<StudyItem, { type: 'vocab' }>;
    const wrong = pickDistractors(target, 3, { ...gen, catalog: tiny }, { needMedia: true, label: (it) => it.id });
    const emojis = wrong.map((w) => (w.type === 'vocab' ? w.emoji : ''));
    expect(emojis).not.toContain('🍎');
    expect(new Set(emojis).size).toBe(3);
  });
});

describe('match round', () => {
  it('pairs each French item with its meaning, shuffled', () => {
    const items = catalog.study.filter((i): i is Extract<StudyItem, { type: 'vocab' }> => i.type === 'vocab').slice(0, 4);
    const m = generateMatch(items, seeded(2));
    expect(m.pairs.map((p) => p.itemId)).toEqual(items.map((i) => i.id));
    expect([...m.rightOrder].sort()).toEqual([0, 1, 2, 3]);
    expect(m.rightOrder).not.toEqual([0, 1, 2, 3]);
  });
});
