// The writing tutor: an AI model, reached through OpenRouter, that corrects
// what she writes in her own words.
//
// There is no server, so the iPad calls OpenRouter directly with a key that is
// typed in once in Réglages and stays on the device (it is not in the code, the
// repository or backup files). Use a key made for Croissant only, with a small
// credit limit, so a leaked key can cost very little.

export const DEFAULT_TUTOR_MODEL = 'anthropic/claude-sonnet-5.5';
const API = 'https://openrouter.ai/api/v1';

export interface TutorRequest {
  /** The task or question, in French and in English. */
  task: string;
  taskEn: string;
  /** For a translation: the English text. */
  source?: string;
  points?: string[];
  minWords?: number;
  /** What she wrote. */
  text: string;
}

export interface TutorMistake {
  wrong: string;
  right: string;
  why: string;
}

export interface TutorReply {
  /** great: right, or one tiny slip · good: a few mistakes · retry: many mistakes, off topic, or far too short. */
  verdict: 'great' | 'good' | 'retry';
  /** Her text with the mistakes corrected and nothing else changed. */
  corrected: string;
  mistakes: TutorMistake[];
  /** A more natural way to say it, when hers is correct but clumsy. */
  natural?: string;
  /** One or two sentences in English: what went well, and the one thing to work on. */
  comment: string;
}

/** Thrown with a message that can be shown as is. */
export class TutorError extends Error {}

type Fetch = typeof fetch;

const SYSTEM = `You are a warm, precise French teacher. You correct short texts written by an adult learner of French at level A2 whose first language is English. She is a woman, so first-person agreements are feminine (je suis allée, je suis contente).

How to correct:
- Correct real mistakes only: spelling, accents, agreement, verb forms and tenses, articles and prepositions, word order, elision, anglicisms. Keep her ideas, her words and her sentence structure whenever they are correct French. Do not rewrite for style in "corrected".
- Accept anything a French speaker from France would accept, including informal "on" for "nous" and questions with rising intonation.
- Ignore a missing capital letter or final full stop.
- Each mistake: the wrong words exactly as she wrote them, the right words, and why in plain English, under 15 words.
- If her text is correct but sounds unnatural, give a more natural version in "natural". Otherwise leave "natural" empty.
- "comment": one or two short sentences in English, kind and specific: something she did well, then the one thing to work on. If she did not do the task (off topic, or a translation missing parts), say so.
- "verdict": "great" if there are no mistakes or only one small slip and the task is done; "good" if there are a few mistakes but the meaning is clear; "retry" if there are many mistakes, the meaning is unclear, the task was not done, or it is far too short.

Answer with one JSON object and nothing else:
{"verdict": "great" | "good" | "retry", "corrected": string, "mistakes": [{"wrong": string, "right": string, "why": string}], "natural": string, "comment": string}`;

function userMessage(req: TutorRequest): string {
  const lines = [`Task (French): ${req.task}`, `Task (English): ${req.taskEn}`];
  if (req.source) lines.push(`English text to translate:\n${req.source}`);
  if (req.points?.length) lines.push(`It should include:\n${req.points.map((p) => `- ${p}`).join('\n')}`);
  if (req.minWords) lines.push(`Expected length: about ${req.minWords} words or more.`);
  lines.push(`Her text:\n"""\n${req.text.trim()}\n"""`);
  return lines.join('\n\n');
}

/** Reads the model's answer, tolerating a code fence or a sentence around the JSON. */
export function parseReply(raw: string): TutorReply {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new TutorError('The tutor’s answer could not be read. Try again.');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new TutorError('The tutor’s answer could not be read. Try again.');
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const verdict = data.verdict === 'great' || data.verdict === 'good' || data.verdict === 'retry' ? data.verdict : 'good';
  const mistakes = (Array.isArray(data.mistakes) ? data.mistakes : [])
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m) => ({ wrong: str(m.wrong), right: str(m.right), why: str(m.why) }))
    .filter((m) => m.wrong || m.right);
  const corrected = str(data.corrected);
  if (!corrected) throw new TutorError('The tutor’s answer could not be read. Try again.');
  return { verdict, corrected, mistakes, natural: str(data.natural) || undefined, comment: str(data.comment) };
}

async function failure(res: Response): Promise<TutorError> {
  let detail = '';
  try {
    detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    // no details
  }
  if (res.status === 401) return new TutorError('OpenRouter refused the key. Check it in Réglages.');
  if (res.status === 402) return new TutorError('The OpenRouter key has no credit left.');
  if (res.status === 429) return new TutorError('Too many requests just now. Wait a minute and try again.');
  if (res.status === 400 || res.status === 404) {
    return new TutorError(`OpenRouter did not accept the request${detail ? `: ${detail}` : ''}. Check the model name in Réglages.`);
  }
  return new TutorError(`The tutor is not available right now (error ${res.status}).`);
}

export async function correctText(key: string, model: string, req: TutorRequest, fetcher: Fetch = fetch): Promise<TutorReply> {
  let res: Response;
  try {
    res = await fetcher(`${API}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Lets OpenRouter show where the requests come from in its activity page.
        'HTTP-Referer': typeof location === 'undefined' ? 'https://croissant.app' : location.origin,
        'X-Title': 'Croissant',
      },
      body: JSON.stringify({
        model: model || DEFAULT_TUTOR_MODEL,
        temperature: 0.2,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMessage(req) },
        ],
      }),
    });
  } catch {
    throw new TutorError('No internet connection, so the tutor cannot read it now.');
  }
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseReply(body.choices?.[0]?.message?.content ?? '');
}

/** Checks a key without spending anything. Returns the credit left, when OpenRouter says. */
export async function checkKey(key: string, fetcher: Fetch = fetch): Promise<{ remaining: number | null }> {
  let res: Response;
  try {
    res = await fetcher(`${API}/key`, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    throw new TutorError('No internet connection.');
  }
  if (res.status === 401 || res.status === 403) throw new TutorError('OpenRouter refused this key.');
  if (!res.ok) return { remaining: null };
  const data = ((await res.json()) as { data?: { limit?: number | null; usage?: number; limit_remaining?: number | null } }).data;
  const remaining = data?.limit_remaining ?? (typeof data?.limit === 'number' ? data.limit - (data.usage ?? 0) : null);
  return { remaining: typeof remaining === 'number' ? remaining : null };
}
