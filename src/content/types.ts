// Types for lesson content. The source of truth for the file format is
// lessons/schema/lesson.v1.schema.json — keep the two in sync.

export type Gender = 'm' | 'f' | 'mf';
export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'expr';
export type Person = 'je' | 'tu' | 'il' | 'nous' | 'vous' | 'ils';
export const PERSONS: Person[] = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];

export interface Example {
  fr: string;
  en: string;
}

interface BaseItem {
  /** Stable forever. Progress is keyed on it, so it must never be renamed or reused. */
  id: string;
  /** Heading the item sits under in the lesson view, e.g. "Le matin". */
  group?: string;
  /** Short tip in English shown with the answer. */
  note?: string;
}

export interface VocabItem extends BaseItem {
  type: 'vocab';
  /** The word without an article (infinitive for verbs). */
  fr: string;
  en: string;
  pos: Pos;
  /** Required for nouns. */
  gender?: Gender;
  /** True for nouns normally used in the plural (les pâtes). */
  plural?: boolean;
  /** Display article when "un/une" is not natural: du, de la, de l', le, la, l', les, des. */
  article?: string;
  emoji?: string;
  /** Path under public/, e.g. "img/vocab/passoire.svg". */
  image?: string;
  frAlt?: string[];
  enAlt?: string[];
  example?: Example;
}

export interface PhraseItem extends BaseItem {
  type: 'phrase';
  fr: string;
  en: string;
  register?: 'informal' | 'neutral' | 'formal';
  frAlt?: string[];
  enAlt?: string[];
  /** Set false to keep a phrase out of the word-tile exercise. */
  scramble?: boolean;
}

export interface ConjugationItem extends BaseItem {
  type: 'conjugation';
  verb: string;
  en: string;
  tense: string;
  /** Verb forms without the subject pronoun: { je: "vais", ... }. */
  forms: Record<Person, string>;
  grammar?: string;
}

export interface ClozeItem extends BaseItem {
  type: 'cloze';
  /** Sentence with exactly one {{answer}} marker. */
  fr: string;
  en: string;
  /** Shown next to the blank, usually the infinitive. */
  hint?: string;
  /** Other answers that are also correct. */
  accept?: string[];
  /** Wrong options for the multiple-choice version. */
  distractors: string[];
  /** Never ask for this one to be typed (e.g. the answer is punctuation). */
  choiceOnly?: boolean;
  explain?: string;
  grammar?: string;
}

/**
 * A sentence to produce in French from its English meaning. Written for practice:
 * built from the lesson's words and grammar, not copied from the notes.
 * `fr` and `frAlt` may hold alternatives in square brackets — "Je suis [allée|allé] au marché." —
 * and the first option is the one displayed.
 */
export interface SentenceItem extends BaseItem {
  type: 'sentence';
  fr: string;
  en: string;
  frAlt?: string[];
  /** Short tip in English shown under the prompt, e.g. "use the passé composé". */
  hint?: string;
  /** Wrong words mixed into the word bank (a wrong ending, the wrong article…). */
  traps?: string[];
  grammar?: string;
}

/** Rewrite a French sentence: make it negative, put it in the past, turn it into a question… */
export interface TransformItem extends BaseItem {
  type: 'transform';
  /** The instruction in French, e.g. "Mets la phrase au passé composé." */
  task: string;
  taskEn: string;
  /** The sentence to start from. */
  from: string;
  /** The rewritten sentence (alternatives in square brackets allowed, as for sentences). */
  fr: string;
  en: string;
  frAlt?: string[];
  traps?: string[];
  grammar?: string;
}

/** An open question to answer in a full sentence of her own. Self-assessed against model answers. */
export interface QuestionItem extends BaseItem {
  type: 'question';
  fr: string;
  en: string;
  /** How to build the answer, in English, e.g. "Answer with j'ai… or je suis allée…". */
  hint?: string;
  /** Two or three example answers. */
  models: string[];
  grammar?: string;
}

export interface GrammarItem extends BaseItem {
  type: 'grammar';
  title: string;
  titleEn?: string;
  body: string;
  table?: { headers: string[]; rows: string[][] };
  examples?: Example[];
}

export type Item =
  | VocabItem
  | PhraseItem
  | ConjugationItem
  | ClozeItem
  | SentenceItem
  | TransformItem
  | QuestionItem
  | GrammarItem;
/** Items that are scheduled for review (everything except grammar reference cards). */
export type StudyItem = Exclude<Item, GrammarItem>;

export interface Lesson {
  schema: 1;
  id: string;
  order: number;
  title: string;
  titleEn: string;
  emoji: string;
  summary: string;
  date?: string;
  items: Item[];
}

export function isStudyItem(item: Item): item is StudyItem {
  return item.type !== 'grammar';
}

/** Items that are asked straight away, without an introduction card: the question is the lesson. */
export function needsIntro(item: StudyItem): boolean {
  return item.type === 'vocab' || item.type === 'phrase' || item.type === 'conjugation';
}
