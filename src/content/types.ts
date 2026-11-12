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

export interface GrammarItem extends BaseItem {
  type: 'grammar';
  title: string;
  titleEn?: string;
  body: string;
  table?: { headers: string[]; rows: string[][] };
  examples?: Example[];
}

export type Item = VocabItem | PhraseItem | ConjugationItem | ClozeItem | GrammarItem;
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
