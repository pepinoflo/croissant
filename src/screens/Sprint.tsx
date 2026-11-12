// "Vrai ou faux ?" — a 60-second bonus game. It uses items already met, gives
// a little XP, and leaves the review schedule alone.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button, Confetti, Fr, Icon } from '../components/ui';
import { vocabDisplay } from '../content/french';
import { catalog } from '../content/load';
import type { PhraseItem, VocabItem } from '../content/types';
import type { Achievement } from '../game/achievements';
import { sfx } from '../speech/sfx';
import { normalize } from '../srs/grading';
import { cards, navigate, profile, recordSprint } from '../state/store';

const SECONDS = 60;

interface Round {
  id: string;
  fr: string;
  shown: string;
  truth: string;
  isTrue: boolean;
}

type Word = VocabItem | PhraseItem;

function makeRound(pool: Word[], previous?: string): Round {
  let item = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < 5 && item.id === previous; i++) item = pool[Math.floor(Math.random() * pool.length)];
  const fr = item.type === 'vocab' ? vocabDisplay(item) : item.fr;
  const isTrue = Math.random() < 0.5;
  let shown = item.en;
  if (!isTrue) {
    const meanings = new Set([item.en, ...(item.enAlt ?? [])].map(normalize));
    const others = pool.filter((o) => o.type === item.type && !meanings.has(normalize(o.en)));
    // A noun for a noun, a verb for a verb: otherwise the wrong ones are too easy to spot.
    const alike = others.filter((o) => o.type === 'vocab' && item.type === 'vocab' && o.pos === item.pos);
    const from = alike.length >= 3 ? alike : others;
    if (from.length) shown = from[Math.floor(Math.random() * from.length)].en;
  }
  return { id: item.id, fr, shown, truth: item.en, isTrue: shown === item.en };
}

export function Sprint() {
  const pool = useMemo(
    () =>
      catalog.study.filter(
        (i): i is Word => (i.type === 'vocab' || i.type === 'phrase') && (cards.peek().get(i.id)?.reps ?? 0) > 0 && i.fr.length <= 40,
      ),
    [],
  );
  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready');
  const [round, setRound] = useState<Round | null>(null);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const [flash, setFlash] = useState<null | 'good' | 'bad'>(null);
  const [result, setResult] = useState<{ best: boolean; achievements: Achievement[] } | null>(null);
  const scoreRef = useRef(0);
  const endsAt = useRef(0);

  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        setResult(recordSprint(scoreRef.current));
        setPhase('done');
        sfx.complete();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [phase]);

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setLeft(SECONDS);
    setResult(null);
    endsAt.current = Date.now() + SECONDS * 1000;
    setRound(makeRound(pool));
    setPhase('playing');
  };

  const answer = (saysTrue: boolean) => {
    if (!round || flash) return;
    const right = saysTrue === round.isTrue;
    if (right) {
      scoreRef.current++;
      setScore(scoreRef.current);
      sfx.correct();
    } else {
      sfx.wrong();
    }
    setFlash(right ? 'good' : 'bad');
    // A miss shows the real meaning for a moment; a hit moves on at once.
    setTimeout(
      () => {
        setFlash(null);
        setRound(makeRound(pool, round.id));
      },
      right ? 180 : 1100,
    );
  };

  return (
    <div class="session sprint">
      <header class="session-top">
        <button type="button" class="icon-btn" aria-label="Close" onClick={() => navigate({ name: 'today' })}>
          <Icon name="close" />
        </button>
        <div class={`bar bar-accent ${left <= 10 ? 'bar-urgent' : ''}`}>
          <div class="bar-fill" style={{ width: `${(left / SECONDS) * 100}%` }} />
        </div>
        <span class="combo combo-on">
          <Icon name="bolt" size={18} />
          {score}
        </span>
      </header>

      <div class="session-scroll">
        {phase === 'ready' && (
          <div class="empty">
            <span class="stat-icon stat-icon-bolt stat-icon-xl">
              <Icon name="bolt" size={48} />
            </span>
            <h1 lang="fr">Vrai ou faux ?</h1>
            <p>
              A French word and a meaning appear. Do they go together? You have {SECONDS} seconds — as many as you can.
            </p>
            {profile.value.sprintBest > 0 && <p class="quiet">Best score: {profile.value.sprintBest}</p>}
            <Button onClick={start}>C’est parti !</Button>
          </div>
        )}

        {phase === 'playing' && round && (
          <div class="stage sprint-stage">
            <p class="instruction">{left} s</p>
            <div class={`sprint-card ${flash ? `is-${flash}` : ''}`}>
              <Fr class="sprint-fr">{round.fr}</Fr>
              <span class="sprint-eq">=</span>
              <span class="sprint-en">{flash === 'bad' ? round.truth : round.shown}</span>
              {flash === 'bad' && <span class="quiet">the real meaning</span>}
            </div>
            <div class="options options-gender">
              <button type="button" class="option option-false" onClick={() => answer(false)}>
                <span class="gender-article">Faux</span>
              </button>
              <button type="button" class="option option-true" onClick={() => answer(true)}>
                <span class="gender-article">Vrai</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div class="empty">
            {result?.best && score > 0 && <Confetti />}
            <span class="stat-icon stat-icon-bolt stat-icon-xl">{score}</span>
            <h1>{result?.best && score > 0 ? 'Nouveau record !' : 'Temps écoulé !'}</h1>
            <p>
              {score} right in {SECONDS} seconds · +{score * 2} XP · best {profile.value.sprintBest}
            </p>
            {result?.achievements.map((a) => (
              <div class="banner banner-accent" key={a.id}>
                <span class="banner-emoji">{a.emoji}</span>
                <span>
                  <strong>{a.title}</strong> — {a.description}
                </span>
              </div>
            ))}
            <div class="summary-actions">
              <Button kind="secondary" onClick={start}>
                Rejouer
              </Button>
              <Button onClick={() => navigate({ name: 'today' })}>Terminer</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
