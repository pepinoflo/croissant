import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  backupDue,
  backupFileName,
  BackupError,
  exportBackup,
  importBackup,
  parseBackup,
  summarize,
  BACKUP_FORMAT,
} from '../src/storage/backup';
import { clearAll, loadAll, openDatabase, saveCards, saveDay, saveProfile, saveSettings, type Database } from '../src/storage/db';
import { defaultProfile, defaultSettings } from '../src/storage/model';
import { newCard, review } from '../src/srs/scheduler';

const NOW = new Date(2026, 4, 20, 12).getTime();
let n = 0;
let db: Database;

async function seed(target: Database) {
  const cards = [
    review(newCard('l01.v.ile', NOW), 'good', NOW),
    review(review(newCard('l05.v.poireau', NOW), 'again', NOW), 'good', NOW + 86_400_000),
    review(newCard('l10.x.ma-mere', NOW), 'easy', NOW),
  ];
  const profile = {
    ...defaultProfile(NOW - 1000),
    xp: 1234,
    streak: { current: 6, best: 9, lastDay: '2026-05-20', freezes: 2 },
    totals: { answers: 80, correct: 70, sessions: 6, perfectSessions: 1 },
    recent: [1, 1, 0, 1],
    achievements: { 'first-session': NOW - 500 },
    seenGrammar: ['l10.g.possessifs'],
    sprintBest: 12,
  };
  const settings = { ...defaultSettings(), sessionSize: 'long' as const, speechRate: 0.8 };
  await saveCards(target, cards);
  await saveDay(target, { day: '2026-05-19', xp: 200, answers: 20, correct: 18, sessions: 1 });
  await saveDay(target, { day: '2026-05-20', xp: 0, answers: 0, correct: 0, sessions: 0, frozen: true });
  await saveProfile(target, profile);
  await saveSettings(target, settings);
}

beforeEach(async () => {
  db = await openDatabase(`test-${n++}`);
});

describe('export and import', () => {
  it('exports everything that is stored', async () => {
    await seed(db);
    const backup = await exportBackup(db, NOW);
    expect(backup.app).toBe('croissant');
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.exportedAt).toBe(new Date(NOW).toISOString());
    expect(backup.data.cards).toHaveLength(3);
    expect(backup.data.days).toHaveLength(2);
    expect(backup.data.profile.xp).toBe(1234);
    expect(backup.data.settings.sessionSize).toBe('long');
  });

  it('restores an identical state on another device, through a JSON file', async () => {
    await seed(db);
    const before = await loadAll(db, NOW);
    const file = JSON.stringify(await exportBackup(db, NOW));

    const other = await openDatabase(`test-${n++}`);
    await importBackup(other, file, NOW);
    const after = await loadAll(other, NOW);

    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(after.cards.sort(byId)).toEqual(before.cards.sort(byId));
    expect(after.days).toEqual(before.days);
    expect(after.profile).toEqual(before.profile);
    expect(after.settings).toEqual(before.settings);
  });

  it('replaces what was there rather than merging', async () => {
    await seed(db);
    const backup = await exportBackup(db, NOW);
    const other = await openDatabase(`test-${n++}`);
    await saveCards(other, [review(newCard('l02.v.plage', NOW), 'good', NOW)]);
    await importBackup(other, backup, NOW);
    const after = await loadAll(other, NOW);
    expect(after.cards.map((c) => c.id).sort()).toEqual(['l01.v.ile', 'l05.v.poireau', 'l10.x.ma-mere']);
  });

  it('keeps cards for items it does not know (lessons added on another device)', async () => {
    await seed(db);
    const backup = await exportBackup(db, NOW);
    backup.data.cards.push(review(newCard('l99.v.inconnu', NOW), 'good', NOW));
    await importBackup(db, backup, NOW);
    const after = await loadAll(db, NOW);
    expect(after.cards.map((c) => c.id)).toContain('l99.v.inconnu');
  });

  it('leaves existing progress untouched when the file is rejected', async () => {
    await seed(db);
    const before = await loadAll(db, NOW);
    const bad = await exportBackup(db, NOW);
    (bad.data.cards[1] as unknown as Record<string, unknown>).stability = 'lots';
    await expect(importBackup(db, bad, NOW)).rejects.toBeInstanceOf(BackupError);
    expect(await loadAll(db, NOW)).toEqual(before);
  });

  it('fills in settings and profile fields missing from an older backup', async () => {
    await seed(db);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db, NOW)));
    delete backup.data.settings;
    delete backup.data.profile.sprintBest;
    delete backup.data.profile.seenGrammar;
    const parsed = parseBackup(backup, NOW);
    expect(parsed.data.settings).toEqual(defaultSettings());
    expect(parsed.data.profile.sprintBest).toBe(0);
    expect(parsed.data.profile.seenGrammar).toEqual([]);
    expect(parsed.data.profile.xp).toBe(1234);
  });

  it('starts empty, and is empty again after a reset', async () => {
    const empty = await loadAll(db, NOW);
    expect(empty.cards).toEqual([]);
    expect(empty.profile).toEqual(defaultProfile(NOW));
    await seed(db);
    await clearAll(db);
    expect((await loadAll(db, NOW)).cards).toEqual([]);
  });
});

describe('parseBackup rejects', () => {
  const valid = () => ({
    app: 'croissant',
    format: 1,
    exportedAt: '2026-05-20T10:00:00.000Z',
    data: { cards: [], days: [], profile: defaultProfile(NOW), settings: defaultSettings() },
  });

  it('accepts a minimal valid backup', () => {
    expect(() => parseBackup(valid(), NOW)).not.toThrow();
    expect(() => parseBackup(JSON.stringify(valid()), NOW)).not.toThrow();
  });

  it.each([
    ['text that is not JSON', 'not json {'],
    ['another kind of JSON file', { hello: 'world' }],
    ['a file from another app', { ...valid(), app: 'other' }],
    ['a missing version', { ...valid(), format: undefined }],
    ['a backup with no data', { ...valid(), data: undefined }],
    ['a backup with no profile', { ...valid(), data: { cards: [], days: [] } }],
    ['a card without an id', { ...valid(), data: { ...valid().data, cards: [{ due: 1 }] } }],
    ['a bad calendar entry', { ...valid(), data: { ...valid().data, days: [{ day: 'yesterday' }] } }],
    ['null', null],
    ['an array', []],
  ])('%s', (_name, raw) => {
    expect(() => parseBackup(raw, NOW)).toThrow(BackupError);
  });

  it('a backup from a newer version of the app, with a helpful message', () => {
    expect(() => parseBackup({ ...valid(), format: BACKUP_FORMAT + 1 }, NOW)).toThrow(/newer version/);
  });

  it('the same card twice', () => {
    const card = review(newCard('l01.v.ile', NOW), 'good', NOW);
    const raw = { ...valid(), data: { ...valid().data, cards: [card, card] } };
    expect(() => parseBackup(raw, NOW)).toThrow(/twice/);
  });
});

describe('backup helpers', () => {
  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 9).getTime())).toBe('croissant-backup-2026-01-05.json');
  });

  it('summarises a backup for the confirmation dialog', async () => {
    await seed(db);
    expect(summarize(await exportBackup(db, NOW))).toEqual({
      exportedAt: new Date(NOW).toISOString(),
      items: 3,
      xp: 1234,
      streak: 6,
    });
  });

  it('reminds once a week, not before, and not while snoozed', () => {
    const day = 86_400_000;
    const p = { ...defaultProfile(NOW), totals: { answers: 10, correct: 9, sessions: 1, perfectSessions: 0 } };
    expect(backupDue(p, NOW + 6 * day)).toBe(false);
    expect(backupDue(p, NOW + 7 * day)).toBe(true);
    expect(backupDue({ ...p, lastBackupAt: NOW + 6 * day }, NOW + 8 * day)).toBe(false);
    expect(backupDue({ ...p, backupSnoozedUntil: NOW + 9 * day }, NOW + 8 * day)).toBe(false);
    expect(backupDue({ ...p, backupSnoozedUntil: NOW + 9 * day }, NOW + 10 * day)).toBe(true);
    // Nothing to back up yet.
    expect(backupDue(defaultProfile(NOW), NOW + 30 * day)).toBe(false);
  });
});
