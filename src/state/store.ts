// The app's state: what is in memory, how it changes, and when it is saved.

import { computed, signal } from '@preact/signals';
import { catalog } from '../content/load';
import { studyItemsOf } from '../content/catalog';
import { newlyUnlocked, type Achievement, type AchievementStats } from '../game/achievements';
import { completeDay, reconcile } from '../game/streak';
import { levelForXp, PERFECT_BONUS, SESSION_BONUS } from '../game/xp';
import { dayKey } from '../srs/day';
import { newCard, review, stageOf, type CardState, type Grade } from '../srs/scheduler';
import { backupFileName, exportBackup, importBackup, parseBackup, type BackupFile } from '../storage/backup';
import {
  clearAll,
  loadAll,
  openDatabase,
  saveCards,
  saveDay,
  saveProfile,
  saveSettings,
  type Database,
} from '../storage/db';
import {
  defaultProfile,
  defaultSettings,
  emptyDay,
  RECENT_WINDOW,
  type DayRecord,
  type Profile,
  type Settings,
} from '../storage/model';

export type Route =
  | { name: 'today' }
  | { name: 'lessons' }
  | { name: 'lesson'; id: string }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'session'; focusLessonId?: string }
  | { name: 'sprint' };

export const ready = signal(false);
export const loadError = signal<string | null>(null);
export const route = signal<Route>({ name: 'today' });
export const cards = signal<Map<string, CardState>>(new Map());
export const days = signal<Map<string, DayRecord>>(new Map());
export const profile = signal<Profile>(defaultProfile(Date.now()));
export const settings = signal<Settings>(defaultSettings());
/** Updated whenever the app comes back to the foreground, so "today" stays right. */
export const clock = signal(Date.now());
/** Length of a streak that has just been lost, to say so kindly once. */
export const lostStreak = signal(0);
/** Set when the service worker has downloaded a newer version of the app. */
export const updateReady = signal<null | (() => void)>(null);

export const today = computed(() => dayKey(clock.value));
export const recentAccuracy = computed(() => {
  const r = profile.value.recent;
  return r.length < 10 ? null : r.reduce((a, b) => a + b, 0) / r.length;
});

let db: Database | null = null;

function persist(work: (db: Database) => Promise<unknown>): void {
  if (!db) return;
  work(db).catch((err) => console.error('Could not save progress', err));
}

export function navigate(next: Route): void {
  route.value = next;
  window.scrollTo(0, 0);
}

function setProfile(next: Profile): void {
  profile.value = next;
  persist((d) => saveProfile(d, next));
}

function setDay(next: DayRecord): void {
  const map = new Map(days.value);
  map.set(next.day, next);
  days.value = map;
  persist((d) => saveDay(d, next));
}

/** Uses freezes for missed days, or ends the streak. Runs at start-up and on each new day. */
function reconcileStreak(): void {
  const before = profile.value.streak;
  const result = reconcile(before, today.value);
  if (result.streak === before) return;
  for (const day of result.frozenDays) setDay({ ...(days.value.get(day) ?? emptyDay(day)), frozen: true });
  if (result.broken) lostStreak.value = before.current;
  setProfile({ ...profile.value, streak: result.streak });
}

export async function init(): Promise<void> {
  try {
    db = await openDatabase();
    const data = await loadAll(db, Date.now());
    cards.value = new Map(data.cards.map((c) => [c.id, c]));
    days.value = new Map(data.days.map((d) => [d.day, d]));
    profile.value = data.profile;
    settings.value = data.settings;
    reconcileStreak();
    // Ask the browser not to clear this data when storage runs low.
    navigator.storage?.persist?.().catch(() => undefined);
  } catch (err) {
    console.error(err);
    loadError.value =
      'Croissant could not open its storage on this device. If you are in Private Browsing, switch it off and reload.';
  }
  ready.value = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    clock.value = Date.now();
    reconcileStreak();
  });
}

export interface AnswerRecord {
  itemId: string;
  grade: Grade;
  xp: number;
  variant?: string;
  /** False for a second try inside a session: it earns nothing and does not move the schedule. */
  graded: boolean;
}

export function recordAnswers(records: AnswerRecord[]): void {
  const now = Date.now();
  const graded = records.filter((r) => r.graded);
  if (!graded.length) return;

  const map = new Map(cards.value);
  const changed: CardState[] = [];
  for (const r of graded) {
    const before = map.get(r.itemId) ?? newCard(r.itemId, now);
    const after = { ...review(before, r.grade, now, { fuzz: true }), lastVariant: r.variant ?? before.lastVariant };
    map.set(r.itemId, after);
    changed.push(after);
  }
  cards.value = map;
  persist((d) => saveCards(d, changed));

  const xp = graded.reduce((s, r) => s + r.xp, 0);
  const right = graded.filter((r) => r.grade !== 'again').length;
  const p = profile.value;
  setProfile({
    ...p,
    xp: p.xp + xp,
    totals: { ...p.totals, answers: p.totals.answers + graded.length, correct: p.totals.correct + right },
    recent: [...p.recent, ...graded.map((r) => (r.grade === 'again' ? 0 : 1))].slice(-RECENT_WINDOW),
  });
  const day = days.value.get(today.value) ?? emptyDay(today.value);
  setDay({ ...day, xp: day.xp + xp, answers: day.answers + graded.length, correct: day.correct + right });
}

export function achievementStats(): AchievementStats {
  const p = profile.value;
  let itemsSeen = 0;
  let itemsMastered = 0;
  let lessonsCompleted = 0;
  let lessonsMastered = 0;
  for (const lesson of catalog.lessons) {
    const items = studyItemsOf(lesson);
    let seen = 0;
    let mastered = 0;
    for (const item of items) {
      const stage = stageOf(cards.value.get(item.id));
      if (stage !== 'new') seen++;
      if (stage === 'mastered') mastered++;
    }
    itemsSeen += seen;
    itemsMastered += mastered;
    if (seen === items.length) lessonsCompleted++;
    if (mastered === items.length) lessonsMastered++;
  }
  return {
    sessions: p.totals.sessions,
    perfectSessions: p.totals.perfectSessions,
    bestStreak: p.streak.best,
    itemsSeen,
    itemsMastered,
    lessonsCompleted,
    lessonsMastered,
    answers: p.totals.answers,
    sprintBest: p.sprintBest,
    level: levelForXp(p.xp),
  };
}

function unlockAchievements(p: Profile): { profile: Profile; unlocked: Achievement[] } {
  profile.value = p; // achievementStats reads the signal
  const unlocked = newlyUnlocked(achievementStats(), p.achievements);
  if (!unlocked.length) return { profile: p, unlocked };
  const achievements = { ...p.achievements };
  for (const a of unlocked) achievements[a.id] = Date.now();
  return { profile: { ...p, achievements }, unlocked };
}

export interface SessionOutcome {
  bonusXp: number;
  streak: number;
  streakExtended: boolean;
  freezeEarned: boolean;
  levelBefore: number;
  levelAfter: number;
  achievements: Achievement[];
}

/** Called when the last step of a session is done. */
export function completeSession(result: { xpBefore: number; mistakes: number }): SessionOutcome {
  clock.value = Date.now();
  reconcileStreak();
  const p = profile.value;
  const perfect = result.mistakes === 0;
  const bonusXp = SESSION_BONUS + (perfect ? PERFECT_BONUS : 0);
  const done = completeDay(p.streak, today.value);
  const next: Profile = {
    ...p,
    xp: p.xp + bonusXp,
    streak: done.streak,
    totals: {
      ...p.totals,
      sessions: p.totals.sessions + 1,
      perfectSessions: p.totals.perfectSessions + (perfect ? 1 : 0),
    },
  };
  const { profile: withBadges, unlocked } = unlockAchievements(next);
  setProfile(withBadges);
  const day = days.value.get(today.value) ?? emptyDay(today.value);
  setDay({ ...day, xp: day.xp + bonusXp, sessions: day.sessions + 1 });
  lostStreak.value = 0;
  return {
    bonusXp,
    streak: done.streak.current,
    streakExtended: done.extended,
    freezeEarned: done.freezeEarned,
    levelBefore: levelForXp(result.xpBefore),
    levelAfter: levelForXp(withBadges.xp),
    achievements: unlocked,
  };
}

export function recordSprint(score: number): { best: boolean; achievements: Achievement[] } {
  const p = profile.value;
  const best = score > p.sprintBest;
  const { profile: next, unlocked } = unlockAchievements({
    ...p,
    xp: p.xp + score * 2,
    sprintBest: Math.max(p.sprintBest, score),
  });
  setProfile(next);
  const day = days.value.get(today.value) ?? emptyDay(today.value);
  setDay({ ...day, xp: day.xp + score * 2 });
  return { best, achievements: unlocked };
}

export function markGrammarSeen(id: string): void {
  const p = profile.value;
  if (p.seenGrammar.includes(id)) return;
  setProfile({ ...p, seenGrammar: [...p.seenGrammar, id] });
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...settings.value, ...patch };
  settings.value = next;
  persist((d) => saveSettings(d, next));
}

export function snoozeBackup(daysFromNow: number): void {
  setProfile({ ...profile.value, backupSnoozedUntil: Date.now() + daysFromNow * 86_400_000 });
}

/**
 * Saves a backup file. On the iPad this opens the share sheet, where
 * "Save to Files" puts it in iCloud Drive; elsewhere it downloads.
 */
export async function saveBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (!db) throw new Error('Storage is not available.');
  const now = Date.now();
  const backup = await exportBackup(db, now);
  const name = backupFileName(now);
  const json = JSON.stringify(backup, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  let how: 'shared' | 'downloaded' = 'downloaded';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Croissant backup' });
      how = 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      download(file);
    }
  } else {
    download(file);
  }
  setProfile({ ...profile.value, lastBackupAt: now, backupSnoozedUntil: null });
  return how;
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a backup file without changing anything, so its contents can be confirmed first. */
export async function readBackup(file: File): Promise<BackupFile> {
  return parseBackup(await file.text(), Date.now());
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  if (!db) throw new Error('Storage is not available.');
  await importBackup(db, backup, Date.now());
  const data = await loadAll(db, Date.now());
  cards.value = new Map(data.cards.map((c) => [c.id, c]));
  days.value = new Map(data.days.map((d) => [d.day, d]));
  profile.value = data.profile;
  settings.value = data.settings;
  lostStreak.value = 0;
  reconcileStreak();
}

export async function resetEverything(): Promise<void> {
  if (!db) return;
  await clearAll(db);
  cards.value = new Map();
  days.value = new Map();
  profile.value = defaultProfile(Date.now());
  settings.value = defaultSettings();
  lostStreak.value = 0;
}
