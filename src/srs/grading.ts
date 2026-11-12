// Checking typed answers. The goal is to be strict about French but kind about
// typing: a missing accent or a slip of the finger is accepted, with the correct
// spelling shown, and the item simply comes back a little sooner.

import type { Gender } from '../content/types';
import type { Grade } from './scheduler';

export type Verdict =
  | 'exact' // right
  | 'accent' // right apart from accents, hyphens or œ
  | 'typo' // one letter off in a longer answer
  | 'gender' // right noun, wrong article
  | 'wrong';

export interface CheckResult {
  verdict: Verdict;
  /** The accepted answer the input was closest to, in its original spelling. */
  expected: string;
}

/** Lower-case, tidy whitespace and punctuation. Keeps accents and hyphens. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLocaleLowerCase('fr')
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[  ]/g, ' ')
    .replace(/[.,!?;:…«»"()]/g, ' ')
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Like normalize, and also ignores accents, ligatures and hyphens. */
export function fold(s: string): string {
  return normalize(s)
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

const ARTICLES: { re: RegExp; gender: Gender | null }[] = [
  { re: /^(un|le|du|mon|ton|son) /, gender: 'm' },
  { re: /^(une|la|de la|ma|ta|sa) /, gender: 'f' },
  { re: /^(l'|de l'|les |des |d'|de )/, gender: null },
];

const PRONOUNS = /^(je |j'|tu |il |elle |on |nous |vous |ils |elles )/;

function splitArticle(input: string): { rest: string; gender: Gender | null } | null {
  for (const { re, gender } of ARTICLES) {
    const m = re.exec(input);
    if (m) return { rest: input.slice(m[0].length), gender };
  }
  return null;
}

export interface CheckOptions {
  /** Accept one wrong letter in longer answers. Off for grammar, where one letter is the point. */
  allowTypos?: boolean;
  /** The answer is a noun of this gender: an article may be typed, and is checked. */
  nounGender?: Gender;
  /** The answer is a verb form: a leading subject pronoun may be typed and is ignored. */
  allowPronoun?: boolean;
}

function compare(input: string, accepted: string[], allowTypos: boolean): CheckResult | null {
  const n = normalize(input);
  if (!n) return null;
  for (const a of accepted) if (normalize(a) === n) return { verdict: 'exact', expected: a };
  const f = fold(input);
  for (const a of accepted) if (fold(a) === f) return { verdict: 'accent', expected: a };
  if (allowTypos) {
    for (const a of accepted) {
      const fa = fold(a);
      // One slip is forgiven from six letters up, two from fourteen.
      const budget = fa.length >= 14 ? 2 : fa.length >= 6 ? 1 : 0;
      if (budget > 0 && levenshtein(fa, f) <= budget) return { verdict: 'typo', expected: a };
    }
  }
  return null;
}

/** Compares what was typed with the list of accepted answers. */
export function checkAnswer(input: string, accepted: string[], opts: CheckOptions = {}): CheckResult {
  const allowTypos = opts.allowTypos ?? false;
  const direct = compare(input, accepted, allowTypos);
  if (direct) return direct;

  const n = normalize(input);
  if (opts.nounGender) {
    const split = splitArticle(n);
    if (split) {
      const r = compare(split.rest, accepted, allowTypos);
      if (r) {
        const mismatch =
          split.gender !== null && opts.nounGender !== 'mf' && split.gender !== opts.nounGender;
        return mismatch ? { verdict: 'gender', expected: r.expected } : r;
      }
    }
  }
  if (opts.allowPronoun) {
    const m = PRONOUNS.exec(n);
    if (m) {
      const r = compare(n.slice(m[0].length), accepted, allowTypos);
      if (r) return r;
    }
  }
  return { verdict: 'wrong', expected: accepted[0] };
}

export function isAccepted(verdict: Verdict): boolean {
  return verdict !== 'wrong';
}

export interface GradeContext {
  /** True for exercises where the answer is produced from memory rather than recognised. */
  production: boolean;
  /** Time taken to answer, in ms. */
  elapsedMs: number;
  /** Number of words in the answer, used to judge what "quick" means. */
  answerWords?: number;
  /**
   * True when the item has never been shown before, not even introduced.
   * A quick right answer then means it was already known from class.
   */
  firstSight?: boolean;
}

/**
 * Turns the outcome of an exercise into an FSRS grade.
 * wrong → again; accepted with a correction → hard; right → good;
 * right, from memory and without hesitation → easy;
 * right straight away on something never shown before → easy (already known).
 */
export function gradeFor(verdict: Verdict, ctx: GradeContext): Grade {
  if (verdict === 'wrong') return 'again';
  if (verdict !== 'exact') return 'hard';
  if (ctx.firstSight && ctx.elapsedMs <= 8000) return 'easy';
  if (ctx.production) {
    const quick = 5000 + 2500 * Math.max(0, (ctx.answerWords ?? 1) - 1);
    if (ctx.elapsedMs <= quick) return 'easy';
  }
  return 'good';
}
