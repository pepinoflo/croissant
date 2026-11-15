// The automatic backup: a copy of all progress kept in a secret GitHub gist.
//
// There is no server: the iPad talks to the GitHub API directly, with a token
// that is typed in once and stays on the device. A gist keeps every revision,
// so older backups can still be found on github.com if ever needed.

import { parseBackup, type BackupFile } from './backup';

export const GIST_FILE = 'croissant-backup.json';
const GIST_DESCRIPTION = 'Croissant — automatic backup of French progress';
const API = 'https://api.github.com';

/** Thrown with a message that can be shown to the user as is. */
export class CloudError extends Error {
  constructor(
    message: string,
    /** True when it is worth trying again later (no internet, GitHub down). */
    readonly retry = false,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

interface Gist {
  id: string;
  updated_at: string;
  files: Record<string, { filename: string; content?: string; truncated?: boolean; raw_url?: string } | undefined>;
}

async function call<T>(token: string, path: string, init: RequestInit = {}, fetcher: Fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetcher(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new CloudError('No internet connection. The backup will be sent next time.', true);
  }
  if (res.status === 401) throw new CloudError('GitHub refused the token: it may have expired. Enter a new one in Réglages.');
  if (res.status === 403 || res.status === 404) {
    throw new CloudError('GitHub refused access: the token needs the “Gists” permission (read and write).');
  }
  if (!res.ok) throw new CloudError(`GitHub is not answering properly (error ${res.status}). The backup will be sent next time.`, true);
  return (await res.json()) as T;
}

/** The gist made by an earlier connection (on this iPad or another), if there is one. */
export async function findBackupGist(token: string, fetcher: Fetch = fetch): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const gists = await call<Gist[]>(token, `/gists?per_page=100&page=${page}`, {}, fetcher);
    const found = gists.find((g) => g.files[GIST_FILE]);
    if (found) return found.id;
    if (gists.length < 100) break;
  }
  return null;
}

/** Reads and checks the backup stored in a gist. */
export async function readCloudBackup(token: string, gistId: string, now: number, fetcher: Fetch = fetch): Promise<BackupFile> {
  const gist = await call<Gist>(token, `/gists/${gistId}`, {}, fetcher);
  const file = gist.files[GIST_FILE];
  if (!file) throw new CloudError('The backup file is missing from the gist.');
  let content = file.content ?? '';
  if (file.truncated && file.raw_url) {
    try {
      content = await (await fetcher(file.raw_url)).text();
    } catch {
      throw new CloudError('No internet connection.', true);
    }
  }
  return parseBackup(content, now);
}

/** Saves a backup: updates the gist, or creates it the first time. Returns the gist id. */
export async function writeCloudBackup(token: string, gistId: string | undefined, backup: BackupFile, fetcher: Fetch = fetch): Promise<string> {
  const files = { [GIST_FILE]: { content: JSON.stringify(backup) } };
  if (gistId) {
    try {
      await call<Gist>(token, `/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify({ files }) }, fetcher);
      return gistId;
    } catch (err) {
      // The gist was deleted on github.com: start a new one rather than fail forever.
      if (!(err instanceof CloudError) || err.retry || !(await gistGone(token, gistId, fetcher))) throw err;
    }
  }
  const created = await call<Gist>(
    token,
    '/gists',
    { method: 'POST', body: JSON.stringify({ description: GIST_DESCRIPTION, public: false, files }) },
    fetcher,
  );
  return created.id;
}

async function gistGone(token: string, gistId: string, fetcher: Fetch): Promise<boolean> {
  try {
    const res = await fetcher(`${API}/gists/${gistId}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.status === 404;
  } catch {
    return false;
  }
}
