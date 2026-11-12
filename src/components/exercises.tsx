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
  Prompt,
  TypeExercise,
  UnscrambleExercise,
} from '../exercises/types';
import { sfx } from '../speech/sfx';
import { canSpeak, speak } from '../speech/tts';
import { checkAnswer, type Verdict } from '../srs/grading';
import type { Grade } from '../srs/scheduler';
import { Button, Fr, Icon, Picture, SpeakButton } from './ui';

export interface Outcome {
  verdict: Verdict;
  /** Set when the learner rated herself (flashcards): used as is. */
  grade?: Grade;
  /** The spelling to show when the answer was accepted with a correction. */
  expected?: string;
  selfRated?: boolean;
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
  const input = useRef<HTMLInputElement>(null);

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
    onAnswer({ verdict: result.verdict, expected: result.expected });
  };

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
        <input
          ref={input}
          class={`type-input ${state ? `is-${state}` : ''}`}
          type="text"
          lang="fr"
          value={value}
          readOnly={locked}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          placeholder="Écris en français…"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="done"
          aria-label="Your answer in French"
        />
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
    const ok = tilesMatch(placed.map((i) => ex.tiles[i]), ex.accepted);
    setState(ok ? 'right' : 'wrong');
    onAnswer({ verdict: ok ? 'exact' : 'wrong' });
  };
  return (
    <>
      <PromptView prompt={ex.prompt} />
      <div class={`tray ${state ? `is-${state}` : ''}`} lang="fr">
        {placed.length === 0 && <span class="tray-hint">Tap the words in order</span>}
        {placed.map((i) => (
          <button
            key={i}
            type="button"
            class="tile"
            disabled={locked}
            onClick={() => {
              sfx.tap();
              setPlaced(placed.filter((p) => p !== i));
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
              sfx.tap();
              setPlaced([...placed, i]);
            }}
          >
            {pretty(t)}
          </button>
        ))}
      </div>
      {!locked && (
        <div class="type-actions">
          <Button kind="ghost" onClick={() => setPlaced([])} disabled={!placed.length}>
            Effacer
          </Button>
          <Button onClick={check} disabled={placed.length !== ex.tiles.length}>
            Vérifier
          </Button>
        </div>
      )}
    </>
  );
}

export function FlashcardView({ ex, locked, onAnswer }: ViewProps<FlashcardExercise>) {
  const [shown, setShown] = useState(false);
  const reveal = () => {
    setShown(true);
    if (ex.back.lang === 'fr') speak(ex.back.text);
  };
  return (
    <>
      <PromptView prompt={ex.prompt} />
      {!shown ? (
        <div class="flash-actions">
          <Button onClick={reveal} wide>
            Show the answer
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
          </div>
          {!locked && (
            <div class="rate">
              <p class="instruction">Did you know it?</p>
              <div class="rate-buttons">
                <Button kind="bad" onClick={() => onAnswer({ verdict: 'wrong', grade: 'again', selfRated: true })}>
                  Pas encore
                </Button>
                <Button kind="secondary" onClick={() => onAnswer({ verdict: 'accent', grade: 'hard', selfRated: true })}>
                  Presque
                </Button>
                <Button kind="good" onClick={() => onAnswer({ verdict: 'exact', grade: 'good', selfRated: true })}>
                  Je sais !
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
