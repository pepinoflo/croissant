// One view per kind of exercise. Each reports an Outcome and then stays on
// screen, locked, while the feedback is shown.

import { useEffect, useRef, useState } from 'preact/hooks';
import { pretty } from '../content/french';
import { tilesMatch } from '../exercises/generate';
import type {
  ChoiceExercise,
  FlashcardExercise,
  GenderExercise,
  MatchExercise,
  OpenExercise,
  Prompt,
  TypeExercise,
  UnscrambleExercise,
} from '../exercises/types';
import { sfx } from '../speech/sfx';
import { canSpeak, speak, stopSpeaking } from '../speech/tts';
import { correctText, type TutorReply } from '../ai/tutor';
import { canRecord, RecordError, startRecording, type Recording } from '../speech/recorder';
import { secrets, settings } from '../state/store';
import { checkAnswer, diffWords, type Verdict } from '../srs/grading';
import type { Grade } from '../srs/scheduler';
import { Button, Fr, Icon, Picture, SpeakButton } from './ui';

export interface Outcome {
  verdict: Verdict;
  /** Set when the learner rated herself (flashcards): used as is. */
  grade?: Grade;
  /** The spelling to show when the answer was accepted with a correction. */
  expected?: string;
  /** What she typed, for the word-by-word correction of a sentence. */
  given?: string;
  selfRated?: boolean;
  /** She said her answer was right after all (a sentence can be translated many ways). */
  overridden?: boolean;
}

interface ViewProps<E> {
  ex: E;
  locked: boolean;
  onAnswer: (outcome: Outcome) => void;
}

export function PromptView({ prompt, fill, state }: { prompt: Prompt; fill?: string; state?: 'right' | 'wrong' }) {
  return (
    <div class="prompt">
      <p class="instruction">{prompt.instruction}</p>
      {prompt.media && <Picture media={prompt.media} size={132} />}
      {prompt.audioOnly && prompt.speak && (
        <div class="listen">
          <SpeakButton text={prompt.speak} big label="Play again" />
          {canSpeak.value && (
            <button type="button" class="slow" onClick={() => speak(prompt.speak!, { slow: true })}>
              <Icon name="turtle" size={20} /> Slower
            </button>
          )}
        </div>
      )}
      {prompt.text && (
        <div class="prompt-text">
          {prompt.lang === 'fr' ? <Fr>{prompt.text}</Fr> : <span>{prompt.text}</span>}
          {prompt.speak && !prompt.audioOnly && <SpeakButton text={prompt.speak} />}
        </div>
      )}
      {prompt.cloze && (
        <p class="cloze fr" lang="fr">
          {pretty(prompt.cloze.before)}
          <span class={`blank ${fill ? 'blank-filled' : ''} ${state ? `blank-${state}` : ''}`}>{fill ? pretty(fill) : ' '}</span>
          {pretty(prompt.cloze.after)}
          {prompt.cloze.hint && <span class="hint"> ({prompt.cloze.hint})</span>}
        </p>
      )}
      {prompt.sub && <p class="prompt-sub">{prompt.sub}</p>}
    </div>
  );
}

export function ChoiceView({ ex, locked, onAnswer }: ViewProps<ChoiceExercise>) {
  const [picked, setPicked] = useState<number | null>(null);
  const correctLabel = ex.options[ex.correctIndex].label;
  return (
    <>
      <PromptView
        prompt={ex.prompt}
        fill={locked && ex.prompt.cloze ? correctLabel : undefined}
        state={locked ? (picked === ex.correctIndex ? 'right' : 'wrong') : undefined}
      />
      <div class={`options options-${ex.layout}`}>
        {ex.options.map((o, i) => {
          const state = !locked ? '' : i === ex.correctIndex ? 'is-right' : i === picked ? 'is-wrong' : 'is-dim';
          return (
            <button
              key={i}
              type="button"
              class={`option ${state}`}
              disabled={locked}
              onClick={() => {
                setPicked(i);
                onAnswer({ verdict: i === ex.correctIndex ? 'exact' : 'wrong' });
              }}
            >
              {o.media ? <Picture media={o.media} size={104} /> : o.lang === 'fr' ? <Fr>{o.label!}</Fr> : <span>{o.label}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'û', 'î', 'ï', 'ô', 'œ', '’', '-'];

export function AccentBar({ onInsert }: { onInsert: (ch: string) => void }) {
  return (
    <div class="accents" role="group" aria-label="Accented letters">
      {ACCENTS.map((ch) => (
        <button
          key={ch}
          type="button"
          class="accent-key"
          // pointerdown + preventDefault keeps the keyboard open and the caret where it is.
          onPointerDown={(e) => {
            e.preventDefault();
            onInsert(ch === '’' ? "'" : ch);
          }}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

export function TypeView({ ex, locked, onAnswer }: ViewProps<TypeExercise>) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<'right' | 'wrong' | undefined>();
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus without scrolling the page; on iPad this also raises the keyboard.
    input.current?.focus({ preventScroll: true });
  }, []);

  const insert = (ch: string) => {
    const el = input.current;
    if (!el || locked) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const submit = (given: string) => {
    if (locked) return;
    const result = checkAnswer(given, ex.accepted, ex.check);
    setState(result.verdict === 'wrong' ? 'wrong' : 'right');
    input.current?.blur();
    onAnswer({ verdict: result.verdict, expected: result.expected, given });
  };

  const field = {
    ref: input,
    class: `type-input ${ex.sentence ? 'type-input-long' : ''} ${state ? `is-${state}` : ''}`,
    lang: 'fr',
    value,
    readOnly: locked,
    onInput: (e: Event) => setValue((e.target as HTMLInputElement).value),
    placeholder: ex.sentence ? 'Écris la phrase en français…' : 'Écris en français…',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: ex.sentence ? 'sentences' : 'off',
    spellcheck: false,
    enterkeyhint: 'done',
    'aria-label': 'Your answer in French',
  } as const;

  return (
    <>
      <PromptView prompt={ex.prompt} fill={ex.prompt.cloze ? (locked ? ex.accepted[0] : value) : undefined} state={locked ? state : undefined} />
      <form
        class="type"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit(value);
        }}
      >
        {ex.sentence ? (
          <textarea
            {...field}
            rows={3}
            onKeyDown={(e) => {
              // Return checks the answer, as in the one-line box.
              if (e.key === 'Enter') {
                e.preventDefault();
                if (value.trim()) submit(value);
              }
            }}
          />
        ) : (
          <input {...field} type="text" />
        )}
        {!locked && (
          <>
            <AccentBar onInsert={insert} />
            <div class="type-actions">
              <Button kind="ghost" onClick={() => submit('')}>
                Je ne sais pas
              </Button>
              <Button type="submit" disabled={!value.trim()}>
                Vérifier
              </Button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

export function UnscrambleView({ ex, locked, onAnswer }: ViewProps<UnscrambleExercise>) {
  const [placed, setPlaced] = useState<number[]>([]);
  const [state, setState] = useState<'right' | 'wrong' | undefined>();
  const used = new Set(placed);
  const check = () => {
    const words = placed.map((i) => ex.tiles[i]);
    const ok = tilesMatch(words, ex.accepted);
    setState(ok ? 'right' : 'wrong');
    onAnswer({ verdict: ok ? 'exact' : 'wrong', given: words.join(' ') });
  };
  return (
    <>
      <PromptView prompt={ex.prompt} />
      <div class={`tray ${state ? `is-${state}` : ''}`} lang="fr">
        {placed.length === 0 && (
          <span class="tray-hint">{ex.traps ? 'Tap the words in order. Not every word is needed.' : 'Tap the words in order'}</span>
        )}
        {placed.map((i) => (
          <button
            key={i}
            type="button"
            class="tile"
            disabled={locked}
            onClick={() => {
              setPlaced((now) => now.filter((p) => p !== i));
              sfx.tap();
            }}
          >
            {pretty(ex.tiles[i])}
          </button>
        ))}
      </div>
      <div class="bank" lang="fr">
        {ex.tiles.map((t, i) => (
          <button
            key={i}
            type="button"
            class={`tile ${used.has(i) ? 'tile-used' : ''}`}
            disabled={locked || used.has(i)}
            onClick={() => {
              setPlaced((now) => (now.includes(i) ? now : [...now, i]));
              sfx.tap();
            }}
          >
            {pretty(t)}
          </button>
        ))}
      </div>
      {!locked && (
        <div class="type-actions">
          {placed.length ? (
            <Button kind="ghost" onClick={() => setPlaced([])}>
              Effacer
            </Button>
          ) : (
            // Always a way forward, whatever happens with the tiles.
            <Button kind="ghost" onClick={check}>
              Je ne sais pas
            </Button>
          )}
          <Button onClick={check} disabled={ex.traps ? placed.length < 2 : placed.length !== ex.tiles.length}>
            Vérifier
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * Record yourself, hear it straight back, compare with the French voice, and
 * try again as often as you like. Hidden where the browser cannot record.
 */
export function Recorder({ compare }: { compare?: string }) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'ready'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<Recording | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (state !== 'recording') return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(
    () => () => {
      rec.current?.cancel();
      audio.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  if (!canRecord()) return null;

  const play = () => {
    if (!audio.current || !urlRef.current) return;
    stopSpeaking();
    audio.current.currentTime = 0;
    audio.current.play().catch(() => undefined);
  };

  const start = async () => {
    setError(null);
    stopSpeaking();
    audio.current?.pause();
    setState('starting');
    try {
      rec.current = await startRecording();
      setState('recording');
    } catch (err) {
      setError(err instanceof RecordError ? err.message : 'The microphone could not be started.');
      setState(urlRef.current ? 'ready' : 'idle');
    }
  };

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    // Created during the tap, so the iPad lets it play once the recording is ready.
    const el = audio.current ?? new Audio();
    audio.current = el;
    const next = await r.stop();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setUrl(next);
    el.src = next;
    setState('ready');
    play();
  };

  return (
    <div class="recorder">
      {state === 'recording' ? (
        <Button kind="bad" onClick={() => void stop()}>
          <span class="rec-dot" /> Stop · {seconds}s
        </Button>
      ) : (
        <Button kind={url ? 'ghost' : 'secondary'} disabled={state === 'starting'} onClick={() => void start()}>
          <Icon name="mic" size={20} /> {url ? 'Record again' : 'Record yourself'}
        </Button>
      )}
      {url && state !== 'recording' && (
        <Button kind="secondary" onClick={play}>
          <Icon name="play" size={20} /> Listen to yourself
        </Button>
      )}
      {url && compare && canSpeak.value && state !== 'recording' && (
        <Button kind="secondary" onClick={() => speak(compare)}>
          <Icon name="speaker" size={20} /> French voice
        </Button>
      )}
      {error && <p class="quiet small recorder-error">{error}</p>}
    </div>
  );
}

export function FlashcardView({ ex, locked, onAnswer }: ViewProps<FlashcardExercise>) {
  const [shown, setShown] = useState(false);
  const said = ex.xpKind === 'say';
  const reveal = () => {
    setShown(true);
    if (ex.back.lang === 'fr') speak(ex.back.text);
  };
  return (
    <>
      <PromptView prompt={ex.prompt} />
      {!shown ? (
        <div class={`flash-actions ${said ? 'flash-actions-say' : ''}`}>
          {said && <p class="say-cue">Say the whole sentence aloud — record yourself if you like — then check.</p>}
          {said && <Recorder />}
          <Button onClick={reveal} wide>
            {said ? 'I said it — show me' : 'Show the answer'}
          </Button>
        </div>
      ) : (
        <>
          <div class="flash-back">
            {ex.back.media && <Picture media={ex.back.media} size={96} />}
            <div class="prompt-text">
              {ex.back.lang === 'fr' ? <Fr>{ex.back.text}</Fr> : <span>{ex.back.text}</span>}
              {ex.back.lang === 'fr' && <SpeakButton text={ex.back.text} />}
            </div>
            {ex.answer.note && <p class="note">{ex.answer.note}</p>}
            {said && (
              <>
                <p class="quiet small">Record yourself saying it, listen, compare with the French voice, and try again.</p>
                <Recorder compare={ex.back.text} />
              </>
            )}
          </div>
          {!locked && (
            <div class="rate">
              <p class="instruction">{said ? 'Did you say it right?' : 'Did you know it?'}</p>
              <div class="rate-buttons">
                <Button kind="bad" onClick={() => onAnswer({ verdict: 'wrong', grade: 'again', selfRated: true })}>
                  Pas encore
                </Button>
                <Button kind="secondary" onClick={() => onAnswer({ verdict: 'accent', grade: 'hard', selfRated: true })}>
                  {said ? 'Avec des fautes' : 'Presque'}
                </Button>
                <Button kind="good" onClick={() => onAnswer({ verdict: 'exact', grade: 'good', selfRated: true })}>
                  {said ? 'Parfait !' : 'Je sais !'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

const wordsIn = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** What the tutor would grade it, as one of the three self-rating buttons. */
const SUGGESTED: Record<TutorReply['verdict'], 'again' | 'hard' | 'good'> = { great: 'good', good: 'hard', retry: 'again' };

function TutorPanel({ given, reply }: { given: string; reply: TutorReply }) {
  const parts = diffWords(given, reply.corrected);
  return (
    <div class="tutor">
      <p class="tutor-comment">
        <Icon name="sparkle" size={20} /> {reply.comment}
      </p>
      {reply.mistakes.length > 0 ? (
        <>
          <p class="sheet-hint">Corrected (the changes are marked):</p>
          <p class="fr diff tutor-text" lang="fr">
            {parts.map((p, i) => (
              <>
                {i > 0 && ' '}
                <span key={i} class={p.ok ? '' : 'diff-miss'}>
                  {pretty(p.word)}
                </span>
              </>
            ))}
            <SpeakButton text={reply.corrected} />
          </p>
          <ul class="tutor-mistakes">
            {reply.mistakes.map((m, i) => (
              <li key={i}>
                <span lang="fr" class="tutor-wrong">
                  {pretty(m.wrong)}
                </span>{' '}
                →{' '}
                <span lang="fr" class="tutor-right">
                  {pretty(m.right)}
                </span>
                {m.why && <span class="quiet small"> — {m.why}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p class="tutor-ok">No mistakes. Bravo !</p>
      )}
      {reply.natural && (
        <p class="tutor-natural">
          <span class="sheet-hint">More natural:</span> <Fr>{reply.natural}</Fr> <SpeakButton text={reply.natural} />
        </p>
      )}
    </div>
  );
}

export function OpenView({ ex, locked, onAnswer }: ViewProps<OpenExercise>) {
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<'write' | 'checking' | 'done'>('write');
  const [reply, setReply] = useState<TutorReply | null>(null);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const key = secrets.value.openrouterKey;
  const shown = phase !== 'write';
  const rate = (verdict: Verdict, grade: Grade) => onAnswer({ verdict, grade, selfRated: true, given: value });
  const count = wordsIn(value);

  const insert = (ch: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + ch + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const askTutor = async () => {
    if (!key || !value.trim()) return;
    setPhase('checking');
    setTutorError(null);
    try {
      setReply(
        await correctText(key, settings.peek().tutorModel, {
          task: ex.task.fr,
          taskEn: ex.task.en,
          points: ex.points,
          minWords: ex.minWords,
          text: value,
        }),
      );
    } catch (err) {
      setTutorError((err as Error).message);
    }
    setPhase('done');
  };

  const suggested = reply ? SUGGESTED[reply.verdict] : null;
  const mark = (g: 'again' | 'hard' | 'good') => (suggested === g ? ' ✓' : '');

  return (
    <>
      <PromptView prompt={ex.prompt} />
      {ex.points && ex.points.length > 0 && (
        <ul class="points">
          {ex.points.map((p) => (
            <li key={p}>{pretty(p)}</li>
          ))}
        </ul>
      )}
      <div class="type">
        <textarea
          ref={input}
          class={`type-input type-input-long ${ex.long ? 'type-input-letter' : ''}`}
          lang="fr"
          rows={ex.long ? 7 : 3}
          value={value}
          readOnly={shown}
          onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)}
          placeholder={ex.long ? 'Écris ton texte ici…' : 'Écris ta réponse en français…'}
          autocomplete="off"
          autocapitalize="sentences"
          spellcheck={false}
          aria-label="Your answer in French"
        />
        {ex.long && (
          <p class={`word-count ${ex.minWords && count >= ex.minWords ? 'is-enough' : ''}`}>
            {count} {count === 1 ? 'word' : 'words'}
            {ex.minWords ? ` · about ${ex.minWords} asked` : ''}
          </p>
        )}
        {!ex.long && <Recorder />}
        {!shown && (
          <>
            <AccentBar onInsert={insert} />
            <div class="type-actions">
              {key && value.trim() ? (
                <>
                  <Button kind="ghost" onClick={() => setPhase('done')}>
                    See examples
                  </Button>
                  <Button onClick={() => void askTutor()}>
                    <Icon name="sparkle" size={20} /> Corriger
                  </Button>
                </>
              ) : (
                <Button onClick={() => setPhase('done')} wide>
                  {value.trim() ? 'Compare with examples' : 'I said it — show examples'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      {phase === 'checking' && (
        <p class="tutor-wait" role="status">
          <Icon name="sparkle" size={20} /> Le tuteur lit ton texte…
        </p>
      )}
      {phase === 'done' && (
        <>
          {reply && <TutorPanel given={value} reply={reply} />}
          {tutorError && <div class="banner banner-bad">{tutorError} Compare with the examples instead.</div>}
          <details class="flash-back models" open={!reply}>
            <summary class="instruction">{ex.models.length > 1 ? 'Examples' : 'An example'}</summary>
            <ul>
              {ex.models.map((m) => (
                <li key={m}>
                  <Fr>{m}</Fr>
                  <SpeakButton text={m} />
                </li>
              ))}
            </ul>
            <p class="quiet small">{ex.answer.en}</p>
          </details>
          {!locked && (
            <div class="rate">
              <p class="instruction">{reply ? 'The tutor suggests ✓ — you decide:' : 'How was your answer?'}</p>
              <div class="rate-buttons">
                <Button kind="bad" onClick={() => rate('wrong', 'again')}>
                  Pas encore{mark('again')}
                </Button>
                <Button kind="secondary" onClick={() => rate('accent', 'hard')}>
                  Avec des fautes{mark('hard')}
                </Button>
                <Button kind="good" onClick={() => rate('exact', 'good')}>
                  Correcte !{mark('good')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function GenderView({ ex, locked, onAnswer }: ViewProps<GenderExercise>) {
  const [picked, setPicked] = useState<'m' | 'f' | null>(null);
  const cls = (g: 'm' | 'f') => (!locked ? '' : g === ex.gender ? 'is-right' : g === picked ? 'is-wrong' : 'is-dim');
  const pick = (g: 'm' | 'f') => {
    setPicked(g);
    onAnswer({ verdict: g === ex.gender ? 'exact' : 'wrong' });
  };
  return (
    <>
      <PromptView prompt={ex.prompt} />
      <div class="options options-gender">
        <button type="button" class={`option option-m ${cls('m')}`} disabled={locked} onClick={() => pick('m')}>
          <span class="fr gender-article">un · le</span>
          <span class="gender-name">masculin</span>
        </button>
        <button type="button" class={`option option-f ${cls('f')}`} disabled={locked} onClick={() => pick('f')}>
          <span class="fr gender-article">une · la</span>
          <span class="gender-name">féminin</span>
        </button>
      </div>
    </>
  );
}

export interface MatchResult {
  itemId: string;
  misses: number;
}

export function MatchView({ ex, onDone }: { ex: MatchExercise; onDone: (results: MatchResult[]) => void }) {
  const [left, setLeft] = useState<number | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [shake, setShake] = useState<[number, number] | null>(null);
  const misses = useRef<number[]>(ex.pairs.map(() => 0));

  const attempt = (l: number, r: number) => {
    if (l === r) {
      sfx.match();
      speak(ex.pairs[l].fr);
      const next = [...matched, l];
      setMatched(next);
      setLeft(null);
      setRight(null);
      if (next.length === ex.pairs.length) {
        setTimeout(() => onDone(ex.pairs.map((p, i) => ({ itemId: p.itemId, misses: misses.current[i] }))), 650);
      }
    } else {
      sfx.wrong();
      misses.current[l]++;
      setShake([l, r]);
      setTimeout(() => {
        setShake(null);
        setLeft(null);
        setRight(null);
      }, 450);
    }
  };

  const pickLeft = (i: number) => {
    if (shake) return;
    sfx.tap();
    setLeft(i);
    if (right !== null) attempt(i, right);
  };
  const pickRight = (i: number) => {
    if (shake) return;
    sfx.tap();
    setRight(i);
    if (left !== null) attempt(left, i);
  };

  const cls = (i: number, selected: number | null, side: 0 | 1) =>
    matched.includes(i) ? 'is-matched' : shake && shake[side] === i ? 'is-shake' : selected === i ? 'is-selected' : '';

  return (
    <>
      <div class="prompt">
        <p class="instruction">Match the pairs</p>
      </div>
      <div class="match">
        <div class="match-col">
          {ex.pairs.map((p, i) => (
            <button key={p.itemId} type="button" class={`option match-card ${cls(i, left, 0)}`} disabled={matched.includes(i)} onClick={() => pickLeft(i)}>
              <Fr>{p.fr}</Fr>
            </button>
          ))}
        </div>
        <div class="match-col">
          {ex.rightOrder.map((i) => (
            <button key={ex.pairs[i].itemId} type="button" class={`option match-card ${cls(i, right, 1)}`} disabled={matched.includes(i)} onClick={() => pickRight(i)}>
              <span>{ex.pairs[i].en}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
