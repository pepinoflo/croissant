// Turns a lesson item into a concrete exercise. The format gets more demanding
// as the item is better known: recognising it, then hearing it, then producing it.

import type { Catalog } from '../content/catalog';
import {
  clozeParts,
  PRONOUN_LABEL,
  subjectFor,
  tokenize,
  vocabDisplay,
  withPronoun,
} from '../content/french';
import {
  PERSONS,
  type ClozeItem,
  type ConjugationItem,
  type Person,
  type PhraseItem,
  type StudyItem,
  type VocabItem,
} from '../content/types';
import { fold, normalize } from '../srs/grading';
import type { CardState } from '../srs/scheduler';
import { shuffle, type Rng } from '../srs/session';
import type {
  Answer,
  ChoiceExercise,
  ChoiceOption,
  FlashcardExercise,
  GenderExercise,
  MatchExercise,
  Media,
  QuizExercise,
  TypeExercise,
  UnscrambleExercise,
} from './types';

export interface GenContext {
  catalog: Catalog;
  cards: Map<string, CardState>;
  rng: Rng;
  /** False when the device has no French voice: listening formats are skipped. */
  canSpeak: boolean;
  recentAccuracy: number | null;
}

type Weighted = [variant: string, weight: number];

const mediaOf = (item: StudyItem): Media | undefined =>
  item.type === 'vocab' && (item.emoji || item.image) ? { emoji: item.emoji, image: item.image } : undefined;

const mediaKey = (m: Media | undefined): string => (m ? (m.image ?? m.emoji ?? '') : '');

const frOf = (item: VocabItem | PhraseItem): string => (item.type === 'vocab' ? vocabDisplay(item) : item.fr);

const wordCount = (s: string): number => s.trim().split(/\s+/).length;

/** 0 = recognise, 1 = recall with support, 2 = produce. */
export function difficultyLevel(card: CardState | undefined, ctx: Pick<GenContext, 'rng' | 'recentAccuracy'>): number {
  let level = !card || card.reps === 0 || card.stability < 1.5 ? 0 : card.stability < 7 ? 1 : 2;
  const acc = ctx.recentAccuracy;
  if (acc !== null && card && card.reps > 0) {
    if (acc >= 0.9 && ctx.rng() < 0.3) level++;
    else if (acc < 0.65 && ctx.rng() < 0.5) level--;
  }
  return Math.max(0, Math.min(2, level));
}

function hasPictureRivals(item: VocabItem, ctx: GenContext): boolean {
  const key = mediaKey(mediaOf(item));
  const others = new Set<string>();
  for (const other of ctx.catalog.study) {
    const k = mediaKey(mediaOf(other));
    if (k && k !== key) others.add(k);
    if (others.size >= 3) return true;
  }
  return false;
}

/** The formats an item can take at a given level, with their relative weights. */
export function variantsFor(item: StudyItem, level: number, ctx: GenContext): Weighted[] {
  const speak = ctx.canSpeak;
  const out: Weighted[] = [];
  if (item.type === 'vocab') {
    const pic = !!mediaOf(item);
    const genderable = item.pos === 'noun' && (item.gender === 'm' || item.gender === 'f');
    if (level === 0) {
      out.push(['vocab:fr-en', 3], ['vocab:flash-fr', 1]);
      if (pic) out.push(['vocab:picture-word', 3]);
    } else if (level === 1) {
      out.push(['vocab:en-fr', 3], ['vocab:flash-en', 1]);
      if (speak) out.push(['vocab:listen-en', 2]);
      if (pic) out.push(['vocab:picture-word', 1]);
      if (pic && hasPictureRivals(item, ctx)) {
        out.push(['vocab:word-picture', 2]);
        if (speak) out.push(['vocab:listen-picture', 2]);
      }
      if (genderable) out.push(['vocab:gender', 2]);
    } else {
      out.push(['vocab:type', 4], ['vocab:en-fr', 1]);
      if (speak) out.push(['vocab:dictation', 2]);
      if (pic) out.push(['vocab:picture-type', 3]);
      if (genderable) out.push(['vocab:gender', 1]);
    }
  } else if (item.type === 'phrase') {
    const words = tokenize(item.fr).length;
    const tiles = item.scramble !== false && words >= 3 && words <= 9;
    if (level === 0) {
      out.push(['phrase:fr-en', 3], ['phrase:flash-fr', 1]);
      if (speak) out.push(['phrase:listen-en', 1]);
    } else if (level === 1) {
      out.push(['phrase:en-fr', 2], ['phrase:flash-en', 1]);
      if (tiles) out.push(['phrase:tiles', 4]);
      if (speak) out.push(['phrase:listen-en', 2]);
    } else {
      out.push(['phrase:en-fr', 1]);
      if (tiles) out.push(['phrase:tiles', 2]);
      if (tiles && speak) out.push(['phrase:listen-tiles', 3]);
      if (words <= 4) out.push(['phrase:type', 3]);
      if (speak && words <= 6) out.push(['phrase:dictation', 2]);
    }
  } else if (item.type === 'conjugation') {
    if (level === 0) out.push(['conj:choice', 1]);
    else if (level === 1) out.push(['conj:choice', 1], ['conj:type', 2]);
    else out.push(['conj:type', 1]);
  } else {
    if (level === 0 || item.choiceOnly) out.push(['cloze:choice', 1]);
    else if (level === 1) out.push(['cloze:choice', 1], ['cloze:type', 2]);
    else out.push(['cloze:choice', 1], ['cloze:type', 3]);
  }
  return out;
}

function pickWeighted(options: Weighted[], rng: Rng, avoid?: string): string {
  const pool = options.length > 1 && avoid ? options.filter(([v]) => v !== avoid) : options;
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [variant, weight] of pool) {
    r -= weight;
    if (r < 0) return variant;
  }
  return pool[pool.length - 1][0];
}

function meanings(item: VocabItem | PhraseItem): Set<string> {
  return new Set([item.en, ...(item.enAlt ?? [])].map(normalize));
}

function spellings(item: VocabItem | PhraseItem): Set<string> {
  return new Set([item.fr, ...(item.frAlt ?? [])].map(fold));
}

/**
 * Wrong options for a multiple-choice question: other items of the same kind,
 * preferring the same lesson and word class, never something that could also be right.
 */
export function pickDistractors(
  target: VocabItem | PhraseItem,
  count: number,
  ctx: GenContext,
  opts: { needMedia?: boolean; label: (item: VocabItem | PhraseItem) => string },
): (VocabItem | PhraseItem)[] {
  const lesson = ctx.catalog.lessonOf.get(target.id)!;
  const targetMeanings = meanings(target);
  const targetSpellings = spellings(target);
  const targetMedia = mediaKey(mediaOf(target));
  const scored: { item: VocabItem | PhraseItem; score: number }[] = [];
  for (const other of ctx.catalog.study) {
    if (other.id === target.id || other.type !== target.type) continue;
    if (opts.needMedia && (!mediaOf(other) || mediaKey(mediaOf(other)) === targetMedia)) continue;
    // Skip anything that shares a meaning or a spelling with the target.
    if ([...meanings(other)].some((m) => targetMeanings.has(m))) continue;
    if ([...spellings(other)].some((s) => targetSpellings.has(s))) continue;
    let score = ctx.rng() * 2.5;
    if (ctx.catalog.lessonOf.get(other.id) === lesson) score += 3;
    if (other.type === 'vocab' && target.type === 'vocab' && other.pos === target.pos) score += 2;
    if (other.group && other.group === target.group) score += 1;
    if (ctx.cards.has(other.id)) score += 0.5;
    scored.push({ item: other, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const picked: (VocabItem | PhraseItem)[] = [];
  const labels = new Set([normalize(opts.label(target))]);
  const medias = new Set([targetMedia]);
  for (const { item } of scored) {
    const label = normalize(opts.label(item));
    if (labels.has(label)) continue;
    if (opts.needMedia) {
      const key = mediaKey(mediaOf(item));
      if (medias.has(key)) continue;
      medias.add(key);
    }
    labels.add(label);
    picked.push(item);
    if (picked.length === count) break;
  }
  return picked;
}

function placeCorrect<T>(correct: T, wrong: T[], rng: Rng): { options: T[]; correctIndex: number } {
  const options = shuffle([correct, ...wrong], rng);
  return { options, correctIndex: options.indexOf(correct) };
}

function wordAnswer(item: VocabItem | PhraseItem): Answer {
  return { fr: frOf(item), en: item.en, note: item.note };
}

function choiceFromItems(
  item: VocabItem | PhraseItem,
  variant: string,
  ctx: GenContext,
  spec: {
    prompt: ChoiceExercise['prompt'];
    option: (i: VocabItem | PhraseItem) => ChoiceOption;
    label: (i: VocabItem | PhraseItem) => string;
    layout: ChoiceExercise['layout'];
    needMedia?: boolean;
    xpKind?: string;
  },
): ChoiceExercise {
  const wrong = pickDistractors(item, 3, ctx, { needMedia: spec.needMedia, label: spec.label });
  const correct = spec.option(item);
  const { options, correctIndex } = placeCorrect(correct, wrong.map(spec.option), ctx.rng);
  return {
    kind: 'choice',
    itemId: item.id,
    variant,
    xpKind: spec.xpKind ?? 'choice',
    production: false,
    prompt: spec.prompt,
    options,
    correctIndex,
    layout: spec.layout,
    answer: wordAnswer(item),
  };
}

function buildWord(item: VocabItem | PhraseItem, variant: string, ctx: GenContext): QuizExercise {
  const fr = frOf(item);
  const media = mediaOf(item);
  const kind = variant.split(':')[1];
  const answer = wordAnswer(item);
  const noun = item.type === 'vocab' && item.pos === 'noun' ? item.gender : undefined;
  const longOptions = item.type === 'phrase';

  switch (kind) {
    case 'fr-en':
      return choiceFromItems(item, variant, ctx, {
        prompt: { instruction: 'What does this mean?', text: fr, lang: 'fr', speak: fr },
        option: (i) => ({ label: i.en, lang: 'en' }),
        label: (i) => i.en,
        layout: longOptions ? 'list' : 'grid',
      });
    case 'en-fr':
      return choiceFromItems(item, variant, ctx, {
        prompt: { instruction: 'How do you say this in French?', text: item.en, lang: 'en', media },
        option: (i) => ({ label: frOf(i), lang: 'fr' }),
        label: frOf,
        layout: longOptions ? 'list' : 'grid',
      });
    case 'picture-word':
      return choiceFromItems(item, variant, ctx, {
        prompt: { instruction: 'What is this in French?', media },
        option: (i) => ({ label: frOf(i), lang: 'fr' }),
        label: frOf,
        layout: 'grid',
      });
    case 'word-picture':
      return choiceFromItems(item, variant, ctx, {
        prompt: { instruction: 'Tap the right picture', text: fr, lang: 'fr', speak: fr },
        option: (i) => ({ lang: 'fr', media: mediaOf(i) }),
        label: (i) => mediaKey(mediaOf(i)),
        layout: 'pictures',
        needMedia: true,
      });
    case 'listen-en':
      return choiceFromItems(item, variant, ctx, {
        prompt: { instruction: 'Listen. What does it mean?', speak: fr, audioOnly: true },
        option: (i) => ({ label: i.en, lang: 'en' }),
        label: (i) => i.en,
        layout: longOptions ? 'list' : 'grid',
        xpKind: 'listen',
      });
    case 'listen-picture':
      return choiceFromItems(item, variant, ctx, {
        prompt: { instruction: 'Listen, then tap the right picture', speak: fr, audioOnly: true },
        option: (i) => ({ lang: 'fr', media: mediaOf(i) }),
        label: (i) => mediaKey(mediaOf(i)),
        layout: 'pictures',
        needMedia: true,
        xpKind: 'listen',
      });
    case 'flash-fr':
    case 'flash-en': {
      const frFirst = kind === 'flash-fr';
      const ex: FlashcardExercise = {
        kind: 'flashcard',
        itemId: item.id,
        variant,
        xpKind: 'flashcard',
        production: !frFirst,
        prompt: frFirst
          ? { instruction: 'Do you remember what this means?', text: fr, lang: 'fr', speak: fr }
          : { instruction: 'Can you say this in French?', text: item.en, lang: 'en', media },
        back: frFirst ? { text: item.en, lang: 'en', media } : { text: fr, lang: 'fr', media },
        answer,
      };
      return ex;
    }
    case 'gender': {
      const v = item as VocabItem;
      const ex: GenderExercise = {
        kind: 'gender',
        itemId: item.id,
        variant,
        xpKind: 'gender',
        production: false,
        prompt: { instruction: 'Masculin ou féminin ?', text: v.fr, lang: 'fr', media, sub: v.en },
        word: v.fr,
        gender: v.gender as 'm' | 'f',
        answer,
      };
      return ex;
    }
    case 'tiles':
    case 'listen-tiles': {
      const listen = kind === 'listen-tiles';
      const solution = tokenize(item.fr);
      solution[0] = lowerFirst(solution[0]);
      const accepted = [item.fr, ...(item.frAlt ?? [])];
      // Shuffle until the tiles do not already spell an accepted sentence.
      let tiles = shuffle(solution, ctx.rng);
      for (let tries = 0; tries < 12 && tilesMatch(tiles, accepted); tries++) tiles = shuffle(solution, ctx.rng);
      if (tilesMatch(tiles, accepted)) tiles = [...solution].reverse();
      const ex: UnscrambleExercise = {
        kind: 'unscramble',
        itemId: item.id,
        variant,
        xpKind: 'unscramble',
        production: true,
        prompt: listen
          ? { instruction: 'Listen and build the sentence', speak: item.fr, audioOnly: true }
          : { instruction: 'Build this sentence in French', text: item.en, lang: 'en' },
        tiles,
        accepted,
        answer,
      };
      return ex;
    }
    default: {
      // type, dictation, picture-type
      const dictation = kind === 'dictation';
      const accepted = [item.fr, ...(item.frAlt ?? [])];
      if (item.type === 'vocab' && fr !== item.fr) accepted.push(fr);
      const prompt: TypeExercise['prompt'] = dictation
        ? { instruction: 'Listen and type what you hear', speak: fr, audioOnly: true }
        : kind === 'picture-type'
          ? { instruction: 'Type the French word', media }
          : { instruction: 'Type this in French', text: item.en, lang: 'en', media };
      const ex: TypeExercise = {
        kind: 'type',
        itemId: item.id,
        variant,
        xpKind: 'type',
        production: true,
        prompt,
        accepted,
        check: { allowTypos: !dictation, nounGender: noun },
        answerWords: wordCount(fr),
        answer,
      };
      return ex;
    }
  }
}

function lowerFirst(word: string): string {
  // Keeps "Noël"-style capitals out of scope: only the sentence-initial capital is dropped.
  return word.charAt(0).toLocaleLowerCase('fr') + word.slice(1);
}

function conjugationRivals(item: ConjugationItem, person: Person, ctx: GenContext): string[] {
  const answer = item.forms[person];
  const seen = new Set([fold(answer)]);
  const out: string[] = [];
  const add = (form: string) => {
    const k = fold(form);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(form);
  };
  // The same person in another tense of the same verb is the most tempting mistake…
  const sameVerb: string[] = [];
  for (const other of ctx.catalog.study) {
    if (other.type === 'conjugation' && other.id !== item.id && other.verb === item.verb) {
      sameVerb.push(other.forms[person]);
    }
  }
  shuffle(sameVerb, ctx.rng).slice(0, 1).forEach(add);
  // …then the other persons of this tense.
  shuffle(PERSONS.filter((p) => p !== person), ctx.rng).forEach((p) => add(item.forms[p]));
  return out.slice(0, 3);
}

function buildConjugation(item: ConjugationItem, variant: string, ctx: GenContext): QuizExercise {
  const person = PERSONS[Math.floor(ctx.rng() * PERSONS.length)];
  const form = item.forms[person];
  const subject = subjectFor(person, form);
  const before = subject.endsWith("'") ? subject : `${subject} `;
  const label = person === 'je' ? subject : PRONOUN_LABEL[person];
  const prompt = {
    instruction: `${item.verb} — ${item.tense}`,
    sub: `${item.en} · ${label}`,
    cloze: { before, after: '', hint: item.verb },
  };
  const answer: Answer = { fr: withPronoun(person, form), en: `${item.en} — ${item.tense}`, note: item.note };
  if (variant === 'conj:type') {
    const ex: TypeExercise = {
      kind: 'type',
      itemId: item.id,
      variant,
      xpKind: 'type',
      production: true,
      prompt,
      accepted: [form],
      check: { allowTypos: false, allowPronoun: true },
      answerWords: wordCount(form),
      answer,
    };
    return ex;
  }
  const { options, correctIndex } = placeCorrect(form, conjugationRivals(item, person, ctx), ctx.rng);
  const ex: ChoiceExercise = {
    kind: 'choice',
    itemId: item.id,
    variant,
    xpKind: 'choice',
    production: false,
    prompt,
    options: options.map((label) => ({ label, lang: 'fr' as const })),
    correctIndex,
    layout: 'grid',
    answer,
  };
  return ex;
}

function buildCloze(item: ClozeItem, variant: string, ctx: GenContext): QuizExercise {
  const parts = clozeParts(item);
  const prompt = {
    instruction: 'Complete the sentence',
    sub: item.en,
    cloze: { before: parts.before, after: parts.after, hint: item.hint },
  };
  const answer: Answer = { fr: parts.full, en: item.en, note: item.explain ?? item.note };
  if (variant === 'cloze:type') {
    const ex: TypeExercise = {
      kind: 'type',
      itemId: item.id,
      variant,
      xpKind: 'type',
      production: true,
      prompt,
      accepted: [parts.answer, ...(item.accept ?? [])],
      check: { allowTypos: false },
      answerWords: wordCount(parts.answer),
      answer,
    };
    return ex;
  }
  const wrong = shuffle(item.distractors, ctx.rng).slice(0, 3);
  const { options, correctIndex } = placeCorrect(parts.answer, wrong, ctx.rng);
  const ex: ChoiceExercise = {
    kind: 'choice',
    itemId: item.id,
    variant,
    xpKind: 'choice',
    production: false,
    prompt,
    options: options.map((label) => ({ label, lang: 'fr' as const })),
    correctIndex,
    layout: 'grid',
    answer,
  };
  return ex;
}

/** Builds one specific format for an item. */
export function buildExercise(item: StudyItem, variant: string, ctx: GenContext): QuizExercise {
  if (item.type === 'conjugation') return buildConjugation(item, variant, ctx);
  if (item.type === 'cloze') return buildCloze(item, variant, ctx);
  return buildWord(item, variant, ctx);
}

/** Chooses a format suited to how well the item is known, and builds it. */
export function generateExercise(item: StudyItem, ctx: GenContext, opts: { easier?: boolean } = {}): QuizExercise {
  const card = ctx.cards.get(item.id);
  const level = opts.easier ? 0 : difficultyLevel(card, ctx);
  const variant = pickWeighted(variantsFor(item, level, ctx), ctx.rng, card?.lastVariant);
  return buildExercise(item, variant, ctx);
}

export function generateMatch(items: (VocabItem | PhraseItem)[], rng: Rng): MatchExercise {
  const pairs = items.map((item) => ({ itemId: item.id, fr: frOf(item), en: item.en }));
  let rightOrder = shuffle(pairs.map((_, i) => i), rng);
  if (pairs.length > 1 && rightOrder.every((v, i) => v === i)) rightOrder = [...rightOrder.slice(1), rightOrder[0]];
  return { kind: 'match', pairs, rightOrder };
}

/** Whether a set of tiles, in the order chosen, spells one of the accepted sentences. */
export function tilesMatch(chosen: string[], accepted: string[]): boolean {
  const built = normalize(chosen.join(' '));
  return accepted.some((a) => normalize(tokenize(a).join(' ')) === built);
}
