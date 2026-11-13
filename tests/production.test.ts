// The exercises that make her produce French: sentences, rewrites, open questions.

import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/content/catalog';
import { acceptedSentences, canonical, expandAlternatives, tokenize } from '../src/content/french';
import type { Lesson, StudyItem } from '../src/content/types';
import { buildExercise, difficultyLevel, generateExercise, pickTraps, variantsFor, type GenContext } from '../src/exercises/generate';
import { checkAnswer, closest, diffWords, fold } from '../src/srs/grading';
import { newCard, review } from '../src/srs/scheduler';
import { planSession } from '../src/srs/session';
// @ts-expect-error plain JS module shared with the command-line validator
import { validateLessons } from '../scripts/validate-lessons.mjs';
import { loadCatalog, seeded } from './helpers';

const catalog = loadCatalog();
const ctx = (rng = seeded(4)): GenContext => ({ catalog, cards: new Map(), rng, canSpeak: true, recentAccuracy: null });
const NOW = new Date(2026, 5, 1, 12).getTime();

describe('alternatives in sentences', () => {
  it('expand into every sentence they describe, the first one displayed', () => {
    expect(expandAlternatives('Je suis [allée|allé] au marché.')).toEqual(['Je suis allée au marché.', 'Je suis allé au marché.']);
    expect(expandAlternatives('[On a|Nous avons] [mangé|dîné].')).toHaveLength(4);
    expect(canonical('Je suis [allée|allé] au marché.')).toBe('Je suis allée au marché.');
  });
  it('allow an optional word, without leaving double spaces', () => {
    expect(expandAlternatives('Laisse refroidir [pendant |]dix minutes.')).toEqual(['Laisse refroidir pendant dix minutes.', 'Laisse refroidir dix minutes.']);
  });
  it('are all accepted when typed', () => {
    const accepted = acceptedSentences('Il y a cinq ans, [on a|nous avons] déménagé.', ['[On a|Nous avons] déménagé il y a cinq ans.']);
    expect(accepted).toHaveLength(4);
    expect(checkAnswer('nous avons déménagé il y a cinq ans', accepted, { allowTypos: true }).verdict).toBe('exact');
  });
  it('keep sentence punctuation off the tiles', () => {
    expect(tokenize("— Je n'aime pas le café. — Moi non plus !")).toEqual(['Je', "n'aime", 'pas', 'le', 'café', 'Moi', 'non', 'plus']);
  });
});

describe('checking a typed sentence', () => {
  it('forgives a few slips in a long sentence, and shows them', () => {
    const accepted = ['Je ne prends pas de petit déjeuner, je prends juste un café.'];
    expect(checkAnswer('je ne prend pas de petit dejeuner je prends juste un cafe', accepted, { allowTypos: true }).verdict).toBe('typo');
  });
  it('compares a wrong answer with the closest correct one', () => {
    const accepted = ['On a mangé dehors.', 'Nous avons mangé dehors.'];
    expect(closest('nous avons manger dehors', accepted)).toBe('Nous avons mangé dehors.');
    expect(checkAnswer('nous avons mangés dedans', accepted, { allowTypos: true }).expected).toBe('Nous avons mangé dehors.');
  });
  it('marks the words to look at', () => {
    const parts = diffWords('je vais a la plage', 'Je suis allée à la plage.');
    expect(parts.map((p) => p.ok)).toEqual([true, false, false, true, true, true]);
    // Accents are not marked here: they are corrected separately.
    expect(diffWords('ou vas tu', 'Où vas-tu ?').every((p) => p.ok)).toBe(true);
  });
  it('is strict for rewrites, where one letter is the point', () => {
    const item = catalog.items.get('l08.t.imp-aller-plage') as StudyItem;
    const ex = buildExercise(item, 'trans:type', ctx(), 2);
    expect(ex.kind).toBe('type');
    if (ex.kind !== 'type') return;
    expect(checkAnswer('Nous allons à la plage.', ex.accepted, ex.check).verdict).toBe('wrong');
    expect(checkAnswer('nous allions a la plage', ex.accepted, ex.check).verdict).toBe('accent');
  });
});

describe('the word bank', () => {
  it('mixes in wrong forms of the words of the sentence', () => {
    const solution = ['je', 'vais', 'à', 'la', 'plage'];
    const traps = pickTraps(solution, ['Je vais à la plage.'], 3, ctx());
    expect(traps).toHaveLength(3);
    const tempting = new Set(['vas', 'va', 'allons', 'allez', 'vont', 'au', 'aux', 'a', 'le', 'les']);
    expect(traps.every((t) => tempting.has(t))).toBe(true);
  });
  it('uses the traps written in the lesson first', () => {
    const item = catalog.items.get('l01.s.habite-ici-depuis-deux-ans') as StudyItem;
    const ex = buildExercise(item, 'sent:bank', ctx(), 0);
    expect(ex.kind).toBe('unscramble');
    if (ex.kind !== 'unscramble') return;
    expect(ex.traps).toBe(2);
    expect(ex.tiles).toEqual(expect.arrayContaining(['pendant', 'habité']));
  });
  it('never offers a word that another correct answer needs', () => {
    // "sommes" is right with « nous », so it cannot be a trap here.
    const traps = pickTraps(['on', 'est', 'restés'], ['On est restés.', 'Nous sommes restés.'], 6, ctx());
    expect(traps.map(fold)).not.toContain('sommes');
  });
  it('gets more traps as the sentence is better known', () => {
    const item = catalog.items.get('l07.s.elle-prend-beaucoup-de-photos') as StudyItem;
    const easy = buildExercise(item, 'sent:bank', ctx(), 0);
    const hard = buildExercise(item, 'sent:bank', ctx(), 2);
    if (easy.kind !== 'unscramble' || hard.kind !== 'unscramble') throw new Error('not tiles');
    expect(hard.traps).toBeGreaterThan(easy.traps);
  });
});

describe('progression towards speaking', () => {
  it('moves to producing French after one good answer', () => {
    const card = review(newCard('a', NOW), 'good', NOW);
    expect(difficultyLevel(card, { rng: seeded(1), recentAccuracy: null })).toBe(1);
  });
  it('asks for typed or spoken sentences once a phrase has been met', () => {
    const phrase = catalog.items.get('l03.p.je-ne-sais-pas-encore') as StudyItem;
    const formats = variantsFor(phrase, 1, ctx()).map(([v]) => v);
    expect(formats).toEqual(expect.arrayContaining(['phrase:type', 'phrase:say', 'phrase:bank']));
    expect(formats).not.toContain('phrase:fr-en');
  });
  it('asks practice sentences without an introduction card', () => {
    const lesson = catalog.lessons[0];
    const practice = new Set(['sentence', 'transform', 'question']);
    const sentences = lesson.items.filter((i) => practice.has(i.type));
    expect(sentences.length).toBeGreaterThan(10);
    // Everything else in the lesson already seen: only practice items are left to introduce.
    const cards = new Map(
      lesson.items.filter((i) => !sentences.includes(i)).map((i) => [i.id, review(newCard(i.id, NOW - 864e5), 'good', NOW - 864e5)] as const),
    );
    const { steps } = planSession({ catalog: { ...catalog, lessons: [lesson], study: catalog.study.filter((i) => catalog.lessonOf.get(i.id) === lesson) }, cards, now: NOW, size: 'normal', recentAccuracy: null, rng: seeded(2), focusLessonId: lesson.id });
    const newSteps = steps.filter((s) => s.isNew && s.kind !== 'grammar');
    expect(newSteps.length).toBeGreaterThan(0);
    expect(newSteps.every((s) => s.kind === 'quiz')).toBe(true);
  });
  it('builds an open question with example answers', () => {
    const item = catalog.items.get('l06.q.ce-week-end') as StudyItem;
    const ex = generateExercise(item, ctx());
    expect(ex.kind).toBe('open');
    if (ex.kind === 'open') expect(ex.models.length).toBeGreaterThanOrEqual(2);
  });
  it('has plenty to say in every lesson', () => {
    for (const lesson of catalog.lessons) {
      const n = lesson.items.filter((i) => i.type === 'sentence' || i.type === 'transform' || i.type === 'question').length;
      expect(n, lesson.id).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('the validator, for practice items', () => {
  const lesson = (items: unknown[]) => ({
    file: 'l01-test.json',
    lesson: { schema: 1, id: 'l01-test', order: 1, title: 'T', titleEn: 'T', emoji: '🧪', summary: 'T', items } as unknown as Lesson,
  });
  const errors = (items: unknown[]) => validateLessons([lesson(items)]).errors.join('\n');
  const sentence = (extra: Record<string, unknown>) => ({ id: 'l01.s.a', type: 'sentence', fr: 'Je suis [allée|allé] ici.', en: 'I went here.', ...extra });

  it('accepts a correct sentence, rewrite and question', () => {
    expect(
      errors([
        sentence({ traps: ['ai'] }),
        { id: 'l01.t.a', type: 'transform', task: 'Mets au passé composé.', taskEn: 'Past.', from: 'Je mange.', fr: "J'ai mangé.", en: 'I ate.' },
        { id: 'l01.q.a', type: 'question', fr: 'Ça va ?', en: 'How are you?', models: ['Ça va bien.', 'Très bien, merci.'] },
      ]),
    ).toBe('');
  });
  it('catches broken alternatives', () => {
    expect(errors([sentence({ fr: 'Je suis [allée|allé ici.' })])).toMatch(/unclosed/);
    expect(errors([sentence({ fr: 'Je suis [allée] ici.' })])).toMatch(/without a \|/);
  });
  it('catches a trap that is a word of the sentence', () => {
    expect(errors([sentence({ traps: ['suis'] })])).toMatch(/word of the sentence/);
    expect(errors([sentence({ traps: ['de la'] })])).toMatch(/single word/);
  });
  it('catches a question with a single model answer, and the wrong id letter', () => {
    expect(errors([{ id: 'l01.q.a', type: 'question', fr: 'Ça va ?', en: 'x', models: ['Oui.'] }])).toMatch(/two model answers/);
    expect(errors([sentence({ id: 'l01.p.a' })])).toMatch(/letter "s"/);
  });
});

describe('every practice sentence', () => {
  it('displays without brackets and accepts its own French', () => {
    for (const item of buildCatalog(catalog.lessons).study) {
      if (item.type !== 'sentence' && item.type !== 'transform') continue;
      const accepted = acceptedSentences(item.fr, item.frAlt);
      for (const a of accepted) expect(a, item.id).not.toMatch(/[[\]|]/);
      expect(accepted.length, item.id).toBeLessThanOrEqual(64);
    }
  });
});
