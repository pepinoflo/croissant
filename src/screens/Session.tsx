// A session: a sequence of introductions and exercises, with feedback after
// each answer and a summary at the end.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { frenchOf, GrammarCard, IntroCard } from '../components/cards';
import {
  ChoiceView,
  FlashcardView,
  GenderView,
  MatchView,
  OpenView,
  TypeView,
  UnscrambleView,
  type MatchResult,
  type Outcome,
} from '../components/exercises';
import { Bar, Button, Confetti, Croissant, Fr, Icon, SpeakButton } from '../components/ui';
import { pretty } from '../content/french';
import { catalog } from '../content/load';
import { needsIntro, type PhraseItem, type StudyItem, type VocabItem } from '../content/types';
import { generateExercise, generateMatch } from '../exercises/generate';
import type { Exercise, QuizExercise } from '../exercises/types';
import { KNOWN_XP, levelInfo, xpForAnswer } from '../game/xp';
import { sfx } from '../speech/sfx';
import { canSpeak, speak, stopSpeaking } from '../speech/tts';
import { diffWords, gradeFor } from '../srs/grading';
import type { Grade } from '../srs/scheduler';
import { nextUnseen, planSession, withNewItem, withoutQuiz, withRetry, type Step } from '../srs/session';
import {
  cards,
  completeSession,
  markGrammarSeen,
  navigate,
  profile,
  recentAccuracy,
  recordAnswers,
  settings,
  type SessionOutcome,
} from '../state/store';

const PRAISE = ['Bravo !', 'Parfait !', 'Très bien !', 'Exactement !', 'Super !', 'C’est ça !', 'Impeccable !'];

interface Feedback {
  outcome: Outcome;
  ex: QuizExercise;
  xp: number;
  praise: string;
}

/** An answer waiting to be saved: it is recorded when she moves on, so it can still be corrected. */
interface Pending {
  itemId: string;
  variant: string;
  xpKind: string;
  grade: Grade;
  xp: number;
  graded: boolean;
  wrong: boolean;
  comboBefore: number;
}

/** Whether "my answer was right too" is offered: free sentences can be said in more than one way. */
function canOverride(ex: QuizExercise, outcome: Outcome): boolean {
  if (outcome.verdict !== 'wrong' || !outcome.given?.trim()) return false;
  return (ex.kind === 'type' && !!ex.sentence) || (ex.kind === 'unscramble' && ex.traps > 0);
}

function Correction({ given, expected }: { given: string; expected: string }) {
  const parts = diffWords(given, expected);
  return (
    <span class="correction">
      <span class="sheet-hint">You wrote:</span>
      <span class="given" lang="fr">
        {pretty(given)}
      </span>
      <span class="sheet-hint">Correct sentence (the words to check are marked):</span>
      <span class="fr diff" lang="fr">
        {parts.map((p, i) => (
          <>
            {i > 0 && ' '}
            <span key={i} class={p.ok ? '' : 'diff-miss'}>
              {pretty(p.word)}
            </span>
          </>
        ))}
      </span>
    </span>
  );
}

function ExerciseView({ ex, locked, onAnswer }: { ex: QuizExercise; locked: boolean; onAnswer: (o: Outcome) => void }) {
  switch (ex.kind) {
    case 'choice':
      return <ChoiceView ex={ex} locked={locked} onAnswer={onAnswer} />;
    case 'type':
      return <TypeView ex={ex} locked={locked} onAnswer={onAnswer} />;
    case 'unscramble':
      return <UnscrambleView ex={ex} locked={locked} onAnswer={onAnswer} />;
    case 'flashcard':
      return <FlashcardView ex={ex} locked={locked} onAnswer={onAnswer} />;
    case 'gender':
      return <GenderView ex={ex} locked={locked} onAnswer={onAnswer} />;
    case 'open':
      return <OpenView ex={ex} locked={locked} onAnswer={onAnswer} />;
  }
}

function FeedbackSheet({
  feedback,
  retry,
  onNext,
  onOverride,
}: {
  feedback: Feedback;
  retry: boolean;
  onNext: () => void;
  onOverride: () => void;
}) {
  const { outcome, ex, xp } = feedback;
  const v = outcome.verdict;
  const tone = v === 'wrong' ? 'bad' : v === 'exact' ? 'good' : 'near';
  const title = outcome.overridden
    ? 'D’accord, c’est noté !'
    : v === 'exact'
      ? feedback.praise
      : v === 'wrong'
        ? 'Pas tout à fait'
        : v === 'gender'
          ? 'Le bon mot, mais…'
          : 'Presque parfait !';
  const expected = outcome.expected ?? ex.answer.fr;
  const sentence = (ex.kind === 'type' && ex.sentence) || (ex.kind === 'unscramble' && ex.traps > 0);
  const showCorrection = sentence && !!outcome.given?.trim() && v !== 'exact';
  const hint =
    v === 'accent'
      ? 'Mind the accents:'
      : v === 'typo'
        ? 'A small slip. It is spelled:'
        : v === 'gender'
          ? 'Check the gender:'
          : v === 'wrong'
            ? 'The answer:'
            : null;
  return (
    <div class={`sheet sheet-${tone}`} role="status">
      <div class="sheet-body">
        <div class="sheet-head">
          <span class="sheet-icon">
            <Icon name={v === 'wrong' ? 'close' : 'check'} size={22} />
          </span>
          <strong>{title}</strong>
          {xp > 0 && <span class="xp-chip">+{xp} XP</span>}
          {retry && v !== 'wrong' && <span class="xp-chip xp-chip-quiet">practice</span>}
        </div>
        <div class="sheet-answer">
          {showCorrection ? (
            <>
              <Correction given={outcome.given!} expected={expected} />
              <SpeakButton text={expected} />
            </>
          ) : (
            <>
              {hint && !outcome.overridden && <span class="sheet-hint">{hint}</span>}
              <span class="sheet-fr">
                <Fr>{sentence ? expected : ex.answer.fr}</Fr>
                <SpeakButton text={sentence ? expected : ex.answer.fr} />
              </span>
            </>
          )}
          <span class="sheet-en">{ex.answer.en}</span>
          {ex.answer.note && <span class="note">{pretty(ex.answer.note)}</span>}
        </div>
      </div>
      <div class="sheet-actions">
        {canOverride(ex, outcome) && (
          <Button kind="ghost" onClick={onOverride}>
            My answer was right too
          </Button>
        )}
        <Button kind={tone === 'bad' ? 'bad' : 'good'} onClick={onNext} wide>
          Continuer
        </Button>
      </div>
    </div>
  );
}

function Summary({
  outcome,
  xp,
  answers,
  correct,
  minutes,
  missed,
  extra,
  onAgain,
}: {
  outcome: SessionOutcome;
  xp: number;
  answers: number;
  correct: number;
  minutes: number;
  missed: StudyItem[];
  extra: boolean;
  onAgain: () => void;
}) {
  const accuracy = answers ? Math.round((correct / answers) * 100) : 100;
  const level = levelInfo(profile.value.xp);
  const leveledUp = outcome.levelAfter > outcome.levelBefore;
  return (
    <div class="summary">
      <Confetti />
      <div class="summary-hero">
        <Croissant size={112} />
        <h1>{accuracy === 100 ? 'Sans faute !' : 'Session terminée !'}</h1>
        <p class="lead">
          {outcome.streakExtended
            ? outcome.streak === 1
              ? 'Your streak starts today.'
              : `${outcome.streak} days in a row. Today’s croissant is yours.`
            : extra
              ? 'Extra practice — everything was already up to date.'
              : 'One more for today. Lovely.'}
        </p>
      </div>
      <div class="tiles">
        <div class="tile-stat">
          <strong>+{xp + outcome.bonusXp}</strong>
          <span>XP</span>
        </div>
        <div class="tile-stat">
          <strong>{accuracy}%</strong>
          <span>correct</span>
        </div>
        <div class="tile-stat">
          <strong>
            <Icon name="flame" size={22} /> {outcome.streak}
          </strong>
          <span>day streak</span>
        </div>
        <div class="tile-stat">
          <strong>{Math.max(1, minutes)}</strong>
          <span>min</span>
        </div>
      </div>
      {leveledUp && (
        <div class="banner banner-accent">
          <strong>Niveau {level.level} !</strong> You are now « {level.title} ».
        </div>
      )}
      {outcome.freezeEarned && (
        <div class="banner">
          <Icon name="snow" size={20} /> You earned a streak freeze: it will cover a missed day.
        </div>
      )}
      {outcome.achievements.map((a) => (
        <div class="banner banner-accent" key={a.id}>
          <span class="banner-emoji">{a.emoji}</span>
          <span>
            <strong>{a.title}</strong> — {a.description}
          </span>
        </div>
      ))}
      {missed.length > 0 && (
        <section class="missed">
          <h2>To look at again</h2>
          <ul>
            {missed.map((item) => (
              <li key={item.id}>
                <Fr>{frenchOf(item)}</Fr>
                <span>{item.en}</span>
                <SpeakButton text={frenchOf(item)} />
              </li>
            ))}
          </ul>
          <p class="quiet">They will come back tomorrow.</p>
        </section>
      )}
      <div class="summary-actions">
        <Button kind="secondary" onClick={onAgain}>
          Encore une !
        </Button>
        <Button onClick={() => navigate({ name: 'today' })}>Terminer</Button>
      </div>
    </div>
  );
}

export function Session({ focusLessonId, onAgain }: { focusLessonId?: string; onAgain: () => void }) {
  const plan = useMemo(
    () =>
      planSession({
        catalog,
        cards: cards.peek(),
        now: Date.now(),
        size: settings.peek().sessionSize,
        recentAccuracy: recentAccuracy.peek(),
        rng: Math.random,
        focusLessonId,
        seenGrammar: new Set(profile.peek().seenGrammar),
      }),
    [],
  );
  const [steps, setSteps] = useState<Step[]>(plan.steps);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [combo, setCombo] = useState(0);
  const [outcome, setOutcome] = useState<SessionOutcome | null>(null);
  const [leaving, setLeaving] = useState(false);
  const built = useRef(new Map<string, Exercise>());
  const replaced = useRef(0);
  const shownAt = useRef(Date.now());
  const stats = useRef({
    xp: 0,
    answers: 0,
    correct: 0,
    missed: new Set<string>(),
    xpBefore: profile.peek().xp,
    startedAt: Date.now(),
  });

  const step: Step | undefined = steps[index];
  // The latest steps and position, for callbacks that fire after a delay.
  const live = useRef({ steps, index });
  live.current = { steps, index };

  const exercise = useMemo<Exercise | null>(() => {
    if (!step || (step.kind !== 'quiz' && step.kind !== 'match')) return null;
    // Keyed by step, not position: steps can be added or removed ahead.
    const key = `${step.kind}:${step.itemId}:${step.retry ? 'r' : ''}`;
    const cached = built.current.get(key);
    if (cached) return cached;
    let ex: Exercise;
    if (step.kind === 'match') {
      const items = step.itemIds!.map((id) => catalog.items.get(id) as VocabItem | PhraseItem);
      ex = generateMatch(items, Math.random);
    } else {
      ex = generateExercise(
        catalog.items.get(step.itemId) as StudyItem,
        { catalog, cards: cards.peek(), rng: Math.random, canSpeak: canSpeak.peek(), recentAccuracy: recentAccuracy.peek() },
        // A second try uses the gentlest format: the point is to end on a success.
        { easier: step.retry },
      );
    }
    built.current.set(key, ex);
    return ex;
  }, [index, step]);

  // Say the French aloud when a new step appears.
  useEffect(() => {
    shownAt.current = Date.now();
    if (!step) return;
    if (step.kind === 'intro') {
      const item = catalog.items.get(step.itemId) as StudyItem;
      if (settings.peek().autoSpeak && item.type !== 'conjugation') speak(frenchOf(item));
    } else if (exercise && exercise.kind !== 'match') {
      const p = exercise.prompt;
      if (p.speak && (p.audioOnly || settings.peek().autoSpeak)) speak(p.speak);
    }
  }, [index]);

  useEffect(() => () => stopSpeaking(), []);

  const finish = () => {
    const result = completeSession({ xpBefore: stats.current.xpBefore, mistakes: stats.current.missed.size });
    setOutcome(result);
    if (result.levelAfter > result.levelBefore) sfx.levelUp();
    else sfx.complete();
  };

  const pending = useRef<Pending | null>(null);

  /** Saves the answer on screen, and plans a second try if it was wrong. */
  const commit = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    recordAnswers([{ itemId: p.itemId, grade: p.grade, xp: p.xp, variant: p.variant, graded: p.graded }]);
    const s = stats.current;
    if (p.graded) {
      s.answers++;
      s.xp += p.xp;
      if (!p.wrong) s.correct++;
    }
    if (p.wrong) {
      s.missed.add(p.itemId);
      const nextSteps = withRetry(live.current.steps, live.current.index);
      setSteps(nextSteps);
      live.current = { ...live.current, steps: nextSteps };
    }
  };

  const next = () => {
    commit();
    setFeedback(null);
    const now = live.current;
    if (now.index + 1 >= now.steps.length) finish();
    else setIndex(now.index + 1);
  };

  const answer = (o: Outcome) => {
    if (!step || !exercise || exercise.kind === 'match' || feedback || pending.current) return;
    const ex = exercise;
    const wrong = o.verdict === 'wrong';
    const graded = !step.retry;
    const grade =
      o.grade ??
      gradeFor(o.verdict, {
        production: ex.production,
        elapsedMs: Date.now() - shownAt.current,
        answerWords: ex.kind === 'type' ? ex.answerWords : ex.kind === 'unscramble' ? ex.tiles.length - ex.traps : 1,
        // Practice sentences are asked without an introduction: getting one
        // right at once the very first time means it was already known.
        firstSight: step.isNew && !step.retry && !needsIntro(catalog.items.get(ex.itemId) as StudyItem),
      });
    const xp = graded ? xpForAnswer(ex.xpKind, o.verdict, combo) : 0;
    pending.current = { itemId: ex.itemId, variant: ex.variant, xpKind: ex.xpKind, grade, xp, graded, wrong, comboBefore: combo };

    setCombo(wrong ? 0 : combo + 1);
    if (wrong) sfx.wrong();
    else if (o.verdict === 'exact') sfx.correct();
    else sfx.almost();

    if (o.selfRated) {
      // Flashcards and open answers have already shown the answer: move straight on.
      setTimeout(next, 250);
      return;
    }
    setFeedback({ outcome: o, ex, xp, praise: PRAISE[Math.floor(Math.random() * PRAISE.length)] });
    if (settings.peek().autoSpeak) speak(o.expected ?? ex.answer.fr);
  };

  /** "My answer was right too": counts it as right, with no second try. */
  const override = () => {
    const p = pending.current;
    if (!p || !feedback) return;
    p.grade = 'good';
    p.wrong = false;
    p.xp = p.graded ? xpForAnswer(p.xpKind, 'exact', p.comboBefore) : 0;
    setCombo(p.comboBefore + 1);
    setFeedback({ ...feedback, xp: p.xp, outcome: { ...feedback.outcome, verdict: 'exact', overridden: true } });
    sfx.correct();
  };

  /** "I already know this" on a new item: schedule it far ahead, skip its question, offer another. */
  const alreadyKnown = () => {
    if (!step || step.kind !== 'intro') return;
    recordAnswers([{ itemId: step.itemId, grade: 'easy', xp: KNOWN_XP, variant: 'known', graded: true, silent: true }]);
    stats.current.xp += KNOWN_XP;
    let nextSteps = withoutQuiz(steps, index, step.itemId);
    if (replaced.current < plan.newCount) {
      const planned = new Set(nextSteps.flatMap((s) => s.itemIds ?? [s.itemId]));
      const lessonId = catalog.lessonOf.get(step.itemId)?.id;
      const item = nextUnseen(catalog, cards.peek(), planned, lessonId, focusLessonId);
      if (item) {
        nextSteps = withNewItem(nextSteps, index, item);
        replaced.current++;
      }
    }
    setSteps(nextSteps);
    live.current = { steps: nextSteps, index };
    sfx.tap();
    next();
  };

  const matchDone = (results: MatchResult[]) => {
    const records = results.map((r) => ({
      itemId: r.itemId,
      grade: r.misses === 0 ? ('good' as const) : r.misses === 1 ? ('hard' as const) : ('again' as const),
      xp: r.misses >= 2 ? 0 : xpForAnswer('match', r.misses === 0 ? 'exact' : 'accent', 0),
      variant: 'match',
      graded: true,
    }));
    recordAnswers(records);
    const s = stats.current;
    for (const r of records) {
      s.answers++;
      s.xp += r.xp;
      if (r.grade === 'again') s.missed.add(r.itemId);
      else s.correct++;
    }
    sfx.correct();
    next();
  };

  if (outcome) {
    const s = stats.current;
    return (
      <div class="session">
        <div class="session-scroll">
          <Summary
            outcome={outcome}
            xp={s.xp}
            answers={s.answers}
            correct={s.correct}
            minutes={Math.round((Date.now() - s.startedAt) / 60000)}
            missed={[...s.missed].map((id) => catalog.items.get(id) as StudyItem)}
            extra={plan.mode === 'extra'}
            onAgain={onAgain}
          />
        </div>
      </div>
    );
  }

  if (!step) {
    return (
      <div class="session">
        <div class="session-scroll">
          <div class="empty">
            <Croissant size={96} muted />
            <h1>Nothing to practise yet</h1>
            <p>Once a lesson has been added, it will appear here.</p>
            <Button onClick={() => navigate({ name: 'today' })}>Back</Button>
          </div>
        </div>
      </div>
    );
  }

  const isCard = step.kind === 'intro' || step.kind === 'grammar';
  const item = catalog.items.get(step.itemId);

  return (
    <div class="session">
      <header class="session-top">
        <button type="button" class="icon-btn" aria-label="Leave the session" onClick={() => setLeaving(true)}>
          <Icon name="close" />
        </button>
        <Bar value={(index + (feedback ? 1 : 0)) / steps.length} />
        <span class={`combo ${combo >= 3 ? 'combo-on' : ''}`} aria-label={`${combo} in a row`}>
          <Icon name="flame" size={18} />
          {combo >= 3 ? combo : ''}
        </span>
      </header>

      <div class="session-scroll">
        <div class={`stage ${isCard ? 'stage-card' : ''}`} key={index}>
          {step.kind === 'intro' && item && item.type !== 'grammar' && (
            <>
              <p class="instruction">{item.type === 'conjugation' ? 'New verb' : item.type === 'phrase' ? 'New phrase' : 'New word'}</p>
              <IntroCard item={item} />
            </>
          )}
          {step.kind === 'grammar' && item?.type === 'grammar' && (
            <>
              <p class="instruction">A quick reminder</p>
              <GrammarCard item={item} />
            </>
          )}
          {step.kind === 'quiz' && exercise && exercise.kind !== 'match' && (
            <>
              {step.retry && <p class="retry-tag">Let’s try this one again</p>}
              <ExerciseView ex={exercise} locked={!!feedback} onAnswer={answer} />
            </>
          )}
          {step.kind === 'match' && exercise?.kind === 'match' && <MatchView ex={exercise} onDone={matchDone} />}
        </div>
      </div>

      {isCard && (
        <footer class="session-foot">
          {step.kind === 'intro' && (
            <Button kind="secondary" onClick={alreadyKnown}>
              Je connais déjà
            </Button>
          )}
          <Button
            wide
            onClick={() => {
              if (step.kind === 'grammar') markGrammarSeen(step.itemId);
              next();
            }}
          >
            {step.kind === 'grammar' ? 'Compris !' : 'À apprendre'}
          </Button>
        </footer>
      )}
      {feedback && <FeedbackSheet feedback={feedback} retry={!!step.retry} onNext={next} onOverride={override} />}

      {leaving && (
        <div class="dialog-backdrop" onClick={() => setLeaving(false)}>
          <div class="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Leave this session?</h2>
            <p>Your answers so far are saved. The streak only counts once a session is finished.</p>
            <div class="dialog-actions">
              <Button
                kind="ghost"
                onClick={() => {
                  commit();
                  navigate({ name: 'today' });
                }}
              >
                Leave
              </Button>
              <Button onClick={() => setLeaving(false)}>Keep going</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
