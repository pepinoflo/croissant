import type { Gender } from '../content/types';
import type { CheckOptions } from '../srs/grading';

export interface Media {
  emoji?: string;
  image?: string;
}

export interface Prompt {
  /** One line telling her what to do. */
  instruction: string;
  text?: string;
  lang?: 'fr' | 'en';
  /** Smaller line under the main text. */
  sub?: string;
  media?: Media;
  /** French text to say aloud when the exercise appears (and on tapping the speaker). */
  speak?: string;
  /** Show only a speaker button: the text must be heard, not read. */
  audioOnly?: boolean;
  /** A sentence with a blank. */
  cloze?: { before: string; after: string; hint?: string };
}

/** What is revealed once the exercise is answered. */
export interface Answer {
  fr: string;
  en: string;
  note?: string;
}

interface BaseExercise {
  itemId: string;
  /** Exact format, e.g. "vocab:fr-en"; stored so the next review uses another one. */
  variant: string;
  /** Key into the XP table. */
  xpKind: string;
  /** True when the answer is produced from memory rather than recognised. */
  production: boolean;
  prompt: Prompt;
  answer: Answer;
}

export interface ChoiceOption {
  label?: string;
  lang: 'fr' | 'en';
  media?: Media;
}

export interface ChoiceExercise extends BaseExercise {
  kind: 'choice';
  options: ChoiceOption[];
  correctIndex: number;
  layout: 'list' | 'grid' | 'pictures';
}

export interface TypeExercise extends BaseExercise {
  kind: 'type';
  accepted: string[];
  check: CheckOptions;
  answerWords: number;
  /** A whole sentence: a bigger box, a word-by-word correction, and an "I was right" button. */
  sentence?: boolean;
}

export interface UnscrambleExercise extends BaseExercise {
  kind: 'unscramble';
  /** Shuffled word tiles, the traps included. */
  tiles: string[];
  accepted: string[];
  /** How many of the tiles are wrong words that do not belong in the sentence. */
  traps: number;
}

/** An open question: she writes or says her own answer, then compares it with examples. */
export interface OpenExercise extends BaseExercise {
  kind: 'open';
  models: string[];
}

export interface FlashcardExercise extends BaseExercise {
  kind: 'flashcard';
  back: { text: string; lang: 'fr' | 'en'; media?: Media };
}

export interface GenderExercise extends BaseExercise {
  kind: 'gender';
  word: string;
  gender: Exclude<Gender, 'mf'>;
}

export interface MatchPair {
  itemId: string;
  fr: string;
  en: string;
}

export interface MatchExercise {
  kind: 'match';
  pairs: MatchPair[];
  /** Order in which the English side is displayed (indexes into pairs). */
  rightOrder: number[];
}

export type QuizExercise =
  | ChoiceExercise
  | TypeExercise
  | UnscrambleExercise
  | FlashcardExercise
  | GenderExercise
  | OpenExercise;

export type Exercise = QuizExercise | MatchExercise;
