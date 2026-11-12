// Progress lives in IndexedDB, the database built into the browser. Nothing
// is sent anywhere: it stays on the device.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CardState } from '../srs/scheduler';
import {
  defaultProfile,
  defaultSettings,
  type DayRecord,
  type Profile,
  type ProgressData,
  type Settings,
} from './model';

interface CroissantDB extends DBSchema {
  cards: { key: string; value: CardState };
  days: { key: string; value: DayRecord };
  kv: { key: string; value: unknown };
}

export type Database = IDBPDatabase<CroissantDB>;

export const DB_NAME = 'croissant';
const DB_VERSION = 1;

export function openDatabase(name: string = DB_NAME): Promise<Database> {
  return openDB<CroissantDB>(name, DB_VERSION, {
    upgrade(db) {
      // Version 1. Later versions must add to this, never recreate stores.
      db.createObjectStore('cards', { keyPath: 'id' });
      db.createObjectStore('days', { keyPath: 'day' });
      db.createObjectStore('kv');
    },
  });
}

/** Loads everything, filling in defaults (and new fields added by later versions). */
export async function loadAll(db: Database, now: number): Promise<ProgressData> {
  const tx = db.transaction(['cards', 'days', 'kv'], 'readonly');
  const [cards, days, profile, settings] = await Promise.all([
    tx.objectStore('cards').getAll(),
    tx.objectStore('days').getAll(),
    tx.objectStore('kv').get('profile') as Promise<Partial<Profile> | undefined>,
    tx.objectStore('kv').get('settings') as Promise<Partial<Settings> | undefined>,
  ]);
  await tx.done;
  const base = defaultProfile(now);
  return {
    cards,
    days,
    profile: {
      ...base,
      ...profile,
      streak: { ...base.streak, ...profile?.streak },
      totals: { ...base.totals, ...profile?.totals },
    },
    settings: { ...defaultSettings(), ...settings },
  };
}

export async function saveCards(db: Database, cards: CardState[]): Promise<void> {
  const tx = db.transaction('cards', 'readwrite');
  await Promise.all(cards.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function saveDay(db: Database, day: DayRecord): Promise<void> {
  await db.put('days', day);
}

export async function saveProfile(db: Database, profile: Profile): Promise<void> {
  await db.put('kv', profile, 'profile');
}

export async function saveSettings(db: Database, settings: Settings): Promise<void> {
  await db.put('kv', settings, 'settings');
}

/** Replaces everything in one transaction: either all of it is written or none. */
export async function replaceAll(db: Database, data: ProgressData): Promise<void> {
  const tx = db.transaction(['cards', 'days', 'kv'], 'readwrite');
  const cards = tx.objectStore('cards');
  const days = tx.objectStore('days');
  const kv = tx.objectStore('kv');
  await Promise.all([cards.clear(), days.clear(), kv.clear()]);
  await Promise.all([
    ...data.cards.map((c) => cards.put(c)),
    ...data.days.map((d) => days.put(d)),
    kv.put(data.profile, 'profile'),
    kv.put(data.settings, 'settings'),
  ]);
  await tx.done;
}

export async function clearAll(db: Database): Promise<void> {
  const tx = db.transaction(['cards', 'days', 'kv'], 'readwrite');
  await Promise.all([
    tx.objectStore('cards').clear(),
    tx.objectStore('days').clear(),
    tx.objectStore('kv').clear(),
  ]);
  await tx.done;
}
