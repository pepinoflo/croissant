import { describe, expect, it } from 'vitest';
import { correctText, parseReply, TutorError } from '../src/ai/tutor';

const reply = {
  verdict: 'good',
  corrected: 'Hier, je suis allée au marché.',
  mistakes: [{ wrong: 'je suis allé', right: 'je suis allée', why: 'Agreement: you are a woman.' }],
  natural: '',
  comment: 'Good use of the passé composé.',
};

describe('the writing tutor', () => {
  it('reads a reply, even inside a code fence or with words around it', () => {
    expect(parseReply(JSON.stringify(reply)).mistakes).toHaveLength(1);
    const fenced = parseReply('Here you go:\n```json\n' + JSON.stringify(reply) + '\n```');
    expect(fenced).toMatchObject({ verdict: 'good', corrected: reply.corrected, natural: undefined });
  });

  it('copes with odd values and refuses a reply with no corrected text', () => {
    expect(parseReply(JSON.stringify({ ...reply, verdict: 'excellent', mistakes: 'none' }))).toMatchObject({ verdict: 'good', mistakes: [] });
    expect(() => parseReply('{"verdict":"great"}')).toThrow(TutorError);
    expect(() => parseReply('Sorry, I cannot help.')).toThrow(TutorError);
  });

  it('sends her text and the task, and explains failures plainly', async () => {
    let sent: { model: string; messages: { content: string }[] } | null = null;
    const ok = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    }) as unknown as typeof fetch;
    const out = await correctText('sk-or-x', 'some/model', { task: 'Raconte ta journée.', taskEn: 'Tell your day.', text: 'Hier, je suis allé au marché.' }, ok);
    expect(out.verdict).toBe('good');
    expect(sent!.model).toBe('some/model');
    expect(sent!.messages[1].content).toContain('je suis allé au marché');

    const status = (code: number) => (async () => new Response('{}', { status: code })) as unknown as typeof fetch;
    await expect(correctText('k', 'm', { task: 't', taskEn: 't', text: 'x' }, status(401))).rejects.toThrow(/refused the key/);
    await expect(correctText('k', 'm', { task: 't', taskEn: 't', text: 'x' }, status(402))).rejects.toThrow(/no credit/);
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(correctText('k', 'm', { task: 't', taskEn: 't', text: 'x' }, offline)).rejects.toThrow(/No internet/);
  });
});
