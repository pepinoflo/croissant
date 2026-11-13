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
      // One slip is forgiven from six letters up, two from fourteen, three in a long sentence.
      const budget = fa.length >= 40 ? 3 : fa.length >= 14 ? 2 : fa.length >= 6 ? 1 : 0;
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
  return { verdict: 'wrong', expected: closest(input, accepted) };
}

/** The accepted answer nearest to what was typed (the first one when nothing was typed). */
export function closest(input: string, accepted: string[]): string {
  const f = fold(input);
  if (!f || accepted.length < 2) return accepted[0];
  let best = accepted[0];
  let bestDistance = Infinity;
  for (const a of accepted) {
    const d = levenshtein(fold(a), f);
    if (d < bestDistance) {
      best = a;
      bestDistance = d;
    }
  }
  return best;
}

export type DiffPart = { word: string; ok: boolean };

/**
 * Word-by-word comparison of an answer with the expected sentence: each word of
 * the expected sentence is marked ok when the answer has it, in the same order
 * (accents ignored, since those are corrected separately).
 */
export function diffWords(input: string, expected: string): DiffPart[] {
  const want = expected.split(/\s+/).filter(Boolean);
  // "vas-tu" folds to two parts, "vas tu"; a word is right when all its parts are.
  const parts: { key: string; word: number }[] = [];
  want.forEach((w, word) => fold(w).split(' ').filter(Boolean).forEach((key) => parts.push({ key, word })));
  const got = fold(input).split(' ').filter(Boolean);
  const n = got.length;
  const m = parts.length;
  // Longest common subsequence.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = got[i] === parts[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Array<boolean>(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (got[i] === parts[j].key) {
      matched[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return want.map((word, k) => ({ word, ok: parts.every((p, j) => p.word !== k || matched[j]) }));
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
