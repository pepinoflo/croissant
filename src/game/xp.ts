// XP, levels and their titles.

import type { Verdict } from '../srs/grading';

/** Total XP needed to reach a level (level 1 = 0, 2 = 100, 3 = 250, 4 = 450 …). */
export function xpForLevel(level: number): number {
  return 25 * (level - 1) * (level + 2);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export interface LevelInfo {
  level: number;
  title: string;
  /** XP earned inside the current level, and the size of the level. */
  into: number;
  span: number;
  progress: number;
}

// Titles are in the feminine: the app was made for one particular learner.
const TITLES: [number, string][] = [
  [1, 'Touriste'],
  [2, 'Curieuse'],
  [3, 'Flâneuse'],
  [4, 'Habituée du café'],
  [5, 'Gourmande'],
  [6, 'Voyageuse'],
  [8, 'Bavarde'],
  [10, 'Exploratrice'],
  [12, 'Connaisseuse'],
  [15, 'Parisienne d’adoption'],
  [18, 'Conteuse'],
  [22, 'Presque bilingue'],
  [26, 'Virtuose'],
  [30, 'Académicienne'],
];

export function titleForLevel(level: number): string {
  let title = TITLES[0][1];
  for (const [min, t] of TITLES) if (level >= min) title = t;
  return title;
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  const into = xp - base;
  return { level, title: titleForLevel(level), into, span, progress: into / span };
}

/** Base XP by how demanding the exercise is. */
const BASE_XP: Record<string, number> = {
  flashcard: 8,
  gender: 8,
  choice: 10,
  listen: 12,
  match: 6,
  unscramble: 14,
  say: 12,
  bank: 16,
  type: 16,
  write: 22,
  open: 22,
};

/** For saying "I already know this" about a new item. */
export const KNOWN_XP = 3;
export const MAX_COMBO_BONUS = 5;
export const SESSION_BONUS = 20;
export const PERFECT_BONUS = 15;

/** XP for one answer. `combo` is the number of correct answers in a row before this one. */
export function xpForAnswer(xpKind: string, verdict: Verdict, combo: number): number {
  if (verdict === 'wrong') return 0;
  const base = BASE_XP[xpKind] ?? 10;
  const earned = verdict === 'exact' ? base : Math.round(base * 0.7);
  return earned + Math.min(combo, MAX_COMBO_BONUS);
}
