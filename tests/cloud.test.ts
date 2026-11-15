import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_FORMAT, exportBackup, importBackup, type BackupFile } from '../src/storage/backup';
import { CloudError, findBackupGist, GIST_FILE, readCloudBackup, writeCloudBackup } from '../src/storage/cloud';
import { clearAll, loadSecrets, openDatabase, saveProfile, saveSecrets } from '../src/storage/db';
import { defaultProfile, defaultSettings } from '../src/storage/model';

const NOW = new Date(2026, 10, 15, 12).getTime();

function backup(answers = 10): BackupFile {
  const profile = { ...defaultProfile(NOW), totals: { answers, correct: answers, sessions: 1, perfectSessions: 0 } };
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: new Date(NOW).toISOString(), data: { cards: [], days: [], profile, settings: defaultSettings() } };
}

interface Call {
  url: string;
  method: string;
  body?: unknown;
  auth?: string;
}

/** A pretend GitHub that keeps gists in memory. */
function fakeGitHub(opts: { status?: number; offline?: boolean } = {}) {
  const gists = new Map<string, Record<string, { content: string }>>();
  const calls: Call[] = [];
  let next = 1;
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body, auth: (init.headers as Record<string, string>)?.Authorization });
    if (opts.offline) throw new TypeError('Failed to fetch');
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (opts.status) return json({ message: 'nope' }, opts.status);
    const path = url.replace('https://api.github.com', '');
    if (method === 'GET' && path.startsWith('/gists?')) {
      return json([...gists].map(([id, files]) => ({ id, updated_at: '', files: Object.fromEntries(Object.keys(files).map((f) => [f, { filename: f }])) })));
    }
    if (method === 'POST' && path === '/gists') {
      const id = `g${next++}`;
      gists.set(id, body.files);
      return json({ id, files: body.files }, 201);
    }
    const m = /^\/gists\/(\w+)$/.exec(path);
    if (m && !gists.has(m[1])) return json({ message: 'Not Found' }, 404);
    if (m && method === 'PATCH') {
      gists.set(m[1], { ...gists.get(m[1]), ...body.files });
      return json({ id: m[1], files: gists.get(m[1]) });
    }
    if (m) return json({ id: m[1], files: Object.fromEntries(Object.entries(gists.get(m[1])!).map(([f, v]) => [f, { filename: f, ...v }])) });
    return json({}, 500);
  }) as unknown as typeof fetch;
  return { fetcher, gists, calls };
}

describe('the automatic backup to a gist', () => {
  it('creates a secret gist the first time, then updates the same one', async () => {
    const gh = fakeGitHub();
    const id = await writeCloudBackup('tok', undefined, backup(10), gh.fetcher);
    expect(gh.calls[0]).toMatchObject({ method: 'POST', auth: 'Bearer tok' });
    expect((gh.calls[0].body as { public: boolean }).public).toBe(false);
    expect(await writeCloudBackup('tok', id, backup(20), gh.fetcher)).toBe(id);
    expect(gh.gists.size).toBe(1);
    const read = await readCloudBackup('tok', id, NOW, gh.fetcher);
    expect(read.data.profile.totals.answers).toBe(20);
  });

  it('finds an existing backup, for a new iPad', async () => {
    const gh = fakeGitHub();
    expect(await findBackupGist('tok', gh.fetcher)).toBeNull();
    gh.gists.set('other', { 'notes.md': { content: 'x' } });
    const id = await writeCloudBackup('tok', undefined, backup(), gh.fetcher);
    expect(await findBackupGist('tok', gh.fetcher)).toBe(id);
  });

  it('starts a new gist if the old one was deleted', async () => {
    const gh = fakeGitHub();
    const id = await writeCloudBackup('tok', 'deleted', backup(), gh.fetcher);
    expect(id).not.toBe('deleted');
    expect(gh.gists.get(id)?.[GIST_FILE]).toBeDefined();
  });

  it('says to try again later when offline, but not when the token is refused', async () => {
    const offline = await writeCloudBackup('tok', undefined, backup(), fakeGitHub({ offline: true }).fetcher).catch((e) => e);
    expect(offline).toBeInstanceOf(CloudError);
    expect(offline.retry).toBe(true);
    const refused = await writeCloudBackup('tok', undefined, backup(), fakeGitHub({ status: 401 }).fetcher).catch((e) => e);
    expect(refused.retry).toBe(false);
    expect(refused.message).toMatch(/token/);
  });

  it('rejects a gist that does not hold a valid backup', async () => {
    const gh = fakeGitHub();
    gh.gists.set('bad', { [GIST_FILE]: { content: '{"app":"other"}' } });
    await expect(readCloudBackup('tok', 'bad', NOW, gh.fetcher)).rejects.toThrow(/not a Croissant backup/);
  });
});

describe('the keys for outside services', () => {
  it('are never exported, and survive a restore and an erase', async () => {
    const db = await openDatabase(`secrets-${Math.random()}`);
    await saveProfile(db, defaultProfile(NOW));
    await saveSecrets(db, { githubToken: 'tok', gistId: 'g1', openrouterKey: 'sk-or' });
    const file = await exportBackup(db, NOW);
    expect(JSON.stringify(file)).not.toMatch(/tok|sk-or/);
    await importBackup(db, backup(5), NOW);
    expect(await loadSecrets(db)).toMatchObject({ githubToken: 'tok', openrouterKey: 'sk-or' });
    await clearAll(db);
    expect(await loadSecrets(db)).toMatchObject({ githubToken: 'tok', gistId: 'g1' });
  });
});
