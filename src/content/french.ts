// Small French text helpers shared by the exercises and the lesson views.

import type { ClozeItem, ConjugationItem, Person, VocabItem } from './types';

const VOWEL_START = /^[aeiouyhàâäéèêëîïôöùûüœ]/i;

/** Typographic niceties for display: curly apostrophes and thin spaces before ? ! : ; */
export function pretty(fr: string): string {
  return fr.replace(/'/g, '’').replace(/ ([?!:;])/g, ' $1');
}

/** The article a noun is shown with, or '' for non-nouns. */
export function articleFor(item: VocabItem): string {
  if (item.article !== undefined) return item.article;
  if (item.pos !== 'noun') return '';
  if (item.plural) return 'des';
  if (item.gender === 'f') return 'une';
  if (item.gender === 'mf') return 'un/une';
  return 'un';
}

/** "une pomme", "l'hiver", "du pain", "voyager". */
export function vocabDisplay(item: VocabItem): string {
  const article = articleFor(item);
  if (!article) return item.fr;
  return article.endsWith("'") ? article + item.fr : `${article} ${item.fr}`;
}

export const PRONOUN_LABEL: Record<Person, string> = {
  je: 'je',
  tu: 'tu',
  il: 'il / elle / on',
  nous: 'nous',
  vous: 'vous',
  ils: 'ils / elles',
};

const PRONOUN_SHORT: Record<Person, string> = {
  je: 'je',
  tu: 'tu',
  il: 'il',
  nous: 'nous',
  vous: 'vous',
  ils: 'ils',
};

/** "j'ai", "nous allons", "ils se couchent". */
export function withPronoun(person: Person, form: string): string {
  if (person === 'je' && VOWEL_START.test(form)) return `j'${form}`;
  return `${PRONOUN_SHORT[person]} ${form}`;
}

/** The subject shown before a blank: "j'" when the answer starts with a vowel. */
export function subjectFor(person: Person, form: string): string {
  if (person === 'je' && VOWEL_START.test(form)) return "j'";
  return PRONOUN_SHORT[person];
}

export function conjugationTitle(item: ConjugationItem): string {
  return `${item.verb} · ${item.tense}`;
}

const CLOZE = /\{\{(.+?)\}\}/;

export interface ClozeParts {
  before: string;
  answer: string;
  after: string;
  /** The full sentence with the answer filled in. */
  full: string;
}

export function clozeParts(item: Pick<ClozeItem, 'fr'>): ClozeParts {
  const m = CLOZE.exec(item.fr);
  if (!m) throw new Error(`Cloze sentence has no {{answer}}: ${item.fr}`);
  const before = item.fr.slice(0, m.index);
  const after = item.fr.slice(m.index + m[0].length);
  return { before, answer: m[1], after, full: before + m[1] + after };
}

/** Words of a sentence for the tile exercise, without sentence-final punctuation. */
export function tokenize(fr: string): string[] {
  return fr
    .replace(/[.!?…]+\s*$/u, '')
    .split(/\s+/)
    .map((t) => t.replace(/^[«"(]+|[»"),;:]+$/gu, ''))
    .filter((t) => t.length > 0 && !/^[?!:;,.…—–-]+$/u.test(t));
}
