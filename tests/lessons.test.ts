import { describe, expect, it } from 'vitest';
import { clozeParts, tokenize, vocabDisplay } from '../src/content/french';
import { isStudyItem, type Lesson } from '../src/content/types';
import { buildExercise, generateExercise, tilesMatch, variantsFor, type GenContext } from '../src/exercises/generate';
import { checkAnswer } from '../src/srs/grading';
// @ts-expect-error plain JS module shared with the command-line validator
import { readLock, validateLessons } from '../scripts/validate-lessons.mjs';
import { loadCatalog, loadLessons, seeded } from './helpers';

const entries = loadLessons();
const catalog = loadCatalog();

type Result = { errors: string[]; warnings: string[]; ids: string[] };
const check = (lessons: { file: string; lesson: unknown }[], lock = { ids: [] as string[], retired: [] as string[] }): Result =>
  validateLessons(lessons, lock);

function minimal(overrides: Record<string, unknown> = {}, items?: unknown[]): { file: string; lesson: Lesson } {
  const lesson = {
    schema: 1,
    id: 'l01-test',
    order: 1,
    title: 'Test',
    titleEn: 'Test',
    emoji: '🧪',
    summary: 'A test lesson.',
    items: items ?? [{ id: 'l01.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm' }],
    ...overrides,
  } as unknown as Lesson;
  return { file: `${lesson.id}.json`, lesson };
}

describe('the real lesson files', () => {
  it('all pass validation, including the id lock', () => {
    const { errors } = check(entries, readLock());
    expect(errors).toEqual([]);
  });

  it('have every id recorded in ids.lock.json', () => {
    const { ids } = check(entries);
    const locked = new Set<string>(readLock().ids);
    expect(ids.filter((id) => !locked.has(id))).toEqual([]);
  });

  it('are numbered 1…n without gaps', () => {
    expect(catalog.lessons.map((l) => l.order)).toEqual(catalog.lessons.map((_, i) => i + 1));
  });

  it('each have something to study', () => {
    for (const lesson of catalog.lessons) {
      expect(lesson.items.filter(isStudyItem).length, lesson.id).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('every item can be turned into every exercise it supports', () => {
  const ctx: GenContext = { catalog, cards: new Map(), rng: seeded(7), canSpeak: true, recentAccuracy: null };

  it.each(catalog.study.map((item) => [item.id, item] as const))('%s', (_id, item) => {
    for (const level of [0, 1, 2]) {
      const variants = variantsFor(item, level, ctx);
      expect(variants.length, `level ${level}`).toBeGreaterThan(0);
      for (const [variant] of variants) {
        const ex = buildExercise(item, variant, ctx);
        expect(ex.itemId).toBe(item.id);
        expect(ex.answer.fr.length).toBeGreaterThan(0);

        if (ex.kind === 'choice') {
          expect(ex.options.length, `${variant}: options`).toBeGreaterThanOrEqual(3);
          expect(ex.correctIndex).toBeGreaterThanOrEqual(0);
          const labels = ex.options.map((o) => o.label ?? o.media?.image ?? o.media?.emoji);
          expect(labels.every(Boolean), `${variant}: empty option`).toBe(true);
          expect(new Set(labels).size, `${variant}: duplicate options ${labels.join(' | ')}`).toBe(labels.length);
        }
        if (ex.kind === 'type') {
          // The model answer must be accepted as exactly right.
          expect(checkAnswer(ex.accepted[0], ex.accepted, ex.check).verdict, variant).toBe('exact');
        }
        if (ex.kind === 'unscramble') {
          expect(ex.tiles.length).toBeGreaterThanOrEqual(3);
          const solution = tokenize(ex.accepted[0]);
          expect([...ex.tiles].sort()).toEqual(
            solution.map((t, i) => (i === 0 ? t.charAt(0).toLocaleLowerCase('fr') + t.slice(1) : t)).sort(),
          );
          expect(tilesMatch(solution, ex.accepted)).toBe(true);
          expect(tilesMatch(ex.tiles, ex.accepted), `${variant}: tiles start out solved`).toBe(false);
        }
        if (ex.kind === 'gender') expect(['m', 'f']).toContain(ex.gender);
      }
    }
  });

  it('picks a format by itself for new items', () => {
    for (const item of catalog.study) expect(generateExercise(item, ctx).itemId).toBe(item.id);
  });
});

describe('content rules', () => {
  it('cloze sentences read correctly once filled in', () => {
    for (const item of catalog.study) {
      if (item.type !== 'cloze') continue;
      const parts = clozeParts(item);
      expect(parts.full).not.toMatch(/[{}]/);
      expect(parts.answer.length).toBeGreaterThan(0);
    }
  });

  it('nouns display with an article', () => {
    for (const item of catalog.study) {
      if (item.type === 'vocab' && item.pos === 'noun') {
        expect(vocabDisplay(item), item.id).not.toBe(item.fr);
      }
    }
  });
});

describe('the validator catches', () => {
  it('nothing in a correct lesson', () => {
    expect(check([minimal()]).errors).toEqual([]);
  });

  it('a missing required field', () => {
    const { errors } = check([minimal({ titleEn: undefined })]);
    expect(errors.join('\n')).toMatch(/titleEn/);
  });

  it('an unknown field (usually a typo)', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm', gendre: 'm' }])]);
    expect(errors.join('\n')).toMatch(/gendre/);
  });

  it('a noun without a gender', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun' }])]);
    expect(errors.join('\n')).toMatch(/gender/);
  });

  it('an article left inside the French word', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.v.pain', type: 'vocab', fr: 'le pain', en: 'bread', pos: 'noun', gender: 'm' }])]);
    expect(errors.join('\n')).toMatch(/article/);
  });

  it('an article that contradicts the gender', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'f', article: 'du' }])]);
    expect(errors.join('\n')).toMatch(/gender m/);
  });

  it('duplicate ids, even across lessons', () => {
    const a = minimal();
    const b = minimal({ id: 'l02-test', order: 2 }, [{ id: 'l01.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm' }]);
    expect(check([a, b]).errors.join('\n')).toMatch(/duplicate id/);
  });

  it('an id that does not belong to its lesson or its type', () => {
    expect(check([minimal({}, [{ id: 'l02.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm' }])]).errors.join('\n')).toMatch(/must start with "l01\."/);
    expect(check([minimal({}, [{ id: 'l01.p.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm' }])]).errors.join('\n')).toMatch(/letter "v"/);
  });

  it('a file name, id and order that disagree', () => {
    expect(check([{ ...minimal(), file: 'l01-other.json' }]).errors.join('\n')).toMatch(/file name/);
    expect(check([minimal({ order: 3 })]).errors.join('\n')).toMatch(/order/);
  });

  it('a cloze without a blank, or with two', () => {
    const cloze = (fr: string) => minimal({}, [{ id: 'l01.x.a', type: 'cloze', fr, en: 'x', distractors: ['b', 'c'] }]);
    expect(check([cloze('Je mange du pain.')]).errors.length).toBeGreaterThan(0);
    expect(check([cloze('Je {{mange}} du {{pain}}.')]).errors.length).toBeGreaterThan(0);
    expect(check([cloze('Je {{mange}} du pain.')]).errors).toEqual([]);
  });

  it('a wrong option that is actually right', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.x.a', type: 'cloze', fr: 'Je prends {{mon}} sac.', en: 'x', accept: ['ton'], distractors: ['ton', 'ma'] }])]);
    expect(errors.join('\n')).toMatch(/also listed as a correct answer/);
  });

  it('a conjugation with a missing person or with the pronoun included', () => {
    const forms = { je: 'vais', tu: 'vas', il: 'va', nous: 'allons', vous: 'allez', ils: 'vont' };
    const conj = (f: Record<string, string>) => minimal({}, [{ id: 'l01.c.aller', type: 'conjugation', verb: 'aller', en: 'to go', tense: 'présent', forms: f }]);
    expect(check([conj(forms)]).errors).toEqual([]);
    const { ils: _ils, ...five } = forms;
    expect(check([conj(five)]).errors.length).toBeGreaterThan(0);
    expect(check([conj({ ...forms, je: 'je vais' })]).errors.join('\n')).toMatch(/subject pronoun/);
  });

  it('a link to a grammar card that does not exist', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.x.a', type: 'cloze', fr: 'Je {{mange}}.', en: 'x', distractors: ['b', 'c'], grammar: 'l01.g.nope' }])]);
    expect(errors.join('\n')).toMatch(/not a grammar card/);
  });

  it('a picture file that is missing', () => {
    const { errors } = check([minimal({}, [{ id: 'l01.v.pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm', image: 'img/vocab/nope.svg' }])]);
    expect(errors.join('\n')).toMatch(/image not found/);
  });
});

describe('the id lock protects progress', () => {
  it('fails when a published id disappears', () => {
    const { errors } = check([minimal()], { ids: ['l01.v.pain', 'l01.v.beurre'], retired: [] });
    expect(errors.join('\n')).toMatch(/l01\.v\.beurre.*no longer exists/);
  });

  it('fails when an id is renamed (old one gone, new one added)', () => {
    const renamed = minimal({}, [{ id: 'l01.v.le-pain', type: 'vocab', fr: 'pain', en: 'bread', pos: 'noun', gender: 'm' }]);
    expect(check([renamed], { ids: ['l01.v.pain'], retired: [] }).errors.length).toBe(1);
  });

  it('accepts new ids and ids that were retired on purpose', () => {
    expect(check([minimal()], { ids: [], retired: [] }).errors).toEqual([]);
    expect(check([minimal()], { ids: ['l01.v.pain', 'l01.v.beurre'], retired: ['l01.v.beurre'] }).errors).toEqual([]);
  });

  it('refuses to reuse a retired id', () => {
    const { errors } = check([minimal()], { ids: ['l01.v.pain'], retired: ['l01.v.pain'] });
    expect(errors.join('\n')).toMatch(/never be reused/);
  });
});
