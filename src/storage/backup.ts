// Export and import of all progress as one JSON file.

import { loadAll, replaceAll, type Database } from './db';
import { defaultProfile, defaultSettings, type ProgressData } from './model';

export const BACKUP_APP = 'croissant';
export const BACKUP_FORMAT = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  data: ProgressData;
}

/** Thrown with a message that can be shown to the user as is. */
export class BackupError extends Error {}

export async function exportBackup(db: Database, now: number): Promise<BackupFile> {
  const data = await loadAll(db, now);
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: new Date(now).toISOString(), data };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `croissant-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkCard(c: unknown, i: number): void {
  if (!isObject(c) || typeof c.id !== 'string' || !c.id) {
    throw new BackupError(`This backup is damaged (card ${i + 1} has no id).`);
  }
  for (const k of ['due', 'stability', 'difficulty', 'reps', 'lapses', 'state'] as const) {
    if (!isNum(c[k])) throw new BackupError(`This backup is damaged (card "${c.id}" has a bad "${k}").`);
  }
}

/**
 * Checks that `raw` is a backup this version can read and returns it in the
 * current shape. Throws BackupError otherwise. Never touches the database.
 */
export function parseBackup(raw: unknown, now: number): BackupFile {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new BackupError('This file is not a Croissant backup (it is not valid JSON).');
    }
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) {
    throw new BackupError('This file is not a Croissant backup.');
  }
  if (!isNum(raw.format) || raw.format < 1) {
    throw new BackupError('This backup has no version number, so it cannot be read safely.');
  }
  if (raw.format > BACKUP_FORMAT) {
    throw new BackupError('This backup was made by a newer version of Croissant. Update the app, then try again.');
  }
  const data = raw.data;
  if (!isObject(data) || !Array.isArray(data.cards) || !Array.isArray(data.days) || !isObject(data.profile)) {
    throw new BackupError('This backup is incomplete.');
  }
  data.cards.forEach(checkCard);
  const seen = new Set<string>();
  for (const c of data.cards as { id: string }[]) {
    if (seen.has(c.id)) throw new BackupError(`This backup is damaged (card "${c.id}" appears twice).`);
    seen.add(c.id);
  }
  for (const d of data.days) {
    if (!isObject(d) || typeof d.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) {
      throw new BackupError('This backup is damaged (bad calendar entry).');
    }
  }
  const p = data.profile as Record<string, unknown>;
  if (!isNum(p.xp) || !isObject(p.streak) || !isObject(p.totals)) {
    throw new BackupError('This backup is damaged (profile).');
  }

  const baseProfile = defaultProfile(now);
  const profile = p as Partial<ProgressData['profile']>;
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date(now).toISOString(),
    data: {
      // Cards for items this version does not know are kept untouched: the
      // lessons they belong to may simply not be installed yet.
      cards: data.cards as ProgressData['cards'],
      days: data.days as ProgressData['days'],
      profile: {
        ...baseProfile,
        ...profile,
        streak: { ...baseProfile.streak, ...profile.streak },
        totals: { ...baseProfile.totals, ...profile.totals },
      },
      settings: { ...defaultSettings(), ...(isObject(data.settings) ? data.settings : {}) },
    },
  };
}

/** Validates first, then replaces all progress with the backup's contents. */
export async function importBackup(db: Database, raw: unknown, now: number): Promise<BackupFile> {
  const backup = parseBackup(raw, now);
  await replaceAll(db, backup.data);
  return backup;
}

export interface BackupSummary {
  exportedAt: string;
  items: number;
  xp: number;
  streak: number;
}

export function summarize(backup: BackupFile): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    items: backup.data.cards.length,
    xp: backup.data.profile.xp,
    streak: backup.data.profile.streak.current,
  };
}

const WEEK_MS = 7 * 86_400_000;

/** True when it has been a week since the last backup (or since starting) and there is something to save. */
export function backupDue(profile: ProgressData['profile'], now: number): boolean {
  if (profile.totals.answers === 0) return false;
  if (profile.backupSnoozedUntil !== null && now < profile.backupSnoozedUntil) return false;
  return now - (profile.lastBackupAt ?? profile.createdAt) >= WEEK_MS;
}
