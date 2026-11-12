// Level, calendar, mastery and badges.

import { frenchOf } from '../components/cards';
import { Bar, Fr, Icon } from '../components/ui';
import { pretty } from '../content/french';
import { catalog } from '../content/load';
import type { StudyItem } from '../content/types';
import { ACHIEVEMENTS } from '../game/achievements';
import { levelInfo } from '../game/xp';
import { addDays, weekdayOf } from '../srs/day';
import { stageOf, type Stage } from '../srs/scheduler';
import { cards, days, navigate, profile, today } from '../state/store';
import { lessonProgress } from './Lessons';

const WEEKS = 6;
const STAGES: Stage[] = ['mastered', 'familiar', 'learning', 'new'];
const STAGE_NAME: Record<Stage, string> = { mastered: 'Mastered', familiar: 'Familiar', learning: 'Learning', new: 'Not met yet' };

function Calendar() {
  const monday = addDays(today.value, -weekdayOf(today.value) - 7 * (WEEKS - 1));
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(monday, i));
  return (
    <div class="calendar" aria-label="Activity over the last six weeks">
      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
        <span key={i} class="calendar-head">
          {d}
        </span>
      ))}
      {cells.map((key) => {
        const rec = days.value.get(key);
        const future = key > today.value;
        const level = !rec || rec.sessions === 0 ? 0 : rec.sessions === 1 ? 1 : 2;
        return (
          <span
            key={key}
            class={`calendar-cell level-${level} ${rec?.frozen ? 'is-frozen' : ''} ${key === today.value ? 'is-today' : ''} ${future ? 'is-future' : ''}`}
            title={key}
          >
            {rec?.frozen ? <Icon name="snow" size={14} /> : Number(key.slice(8))}
          </span>
        );
      })}
    </div>
  );
}

export function Progress() {
  const p = profile.value;
  const level = levelInfo(p.xp);
  const counts: Record<Stage, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const item of catalog.study) counts[stageOf(cards.value.get(item.id))]++;
  const total = catalog.study.length || 1;
  const accuracy = p.totals.answers ? Math.round((p.totals.correct / p.totals.answers) * 100) : null;

  const tricky = catalog.study
    .map((item) => ({ item, card: cards.value.get(item.id) }))
    .filter((x): x is { item: StudyItem; card: NonNullable<typeof x.card> } => !!x.card && x.card.wrong >= 2)
    .sort((a, b) => b.card.wrong - a.card.wrong || a.card.stability - b.card.stability)
    .slice(0, 8);

  return (
    <div class="page">
      <header class="page-head">
        <div>
          <p class="eyebrow">Niveau {level.level}</p>
          <h1 lang="fr">{level.title}</h1>
        </div>
      </header>

      <section class="card">
        <Bar value={level.progress} />
        <p class="quiet">
          {p.xp} XP · {level.span - level.into} to level {level.level + 1}
        </p>
        <div class="tiles">
          <div class="tile-stat">
            <strong>
              <Icon name="flame" size={22} /> {p.streak.current}
            </strong>
            <span>day streak</span>
          </div>
          <div class="tile-stat">
            <strong>{p.streak.best}</strong>
            <span>best streak</span>
          </div>
          <div class="tile-stat">
            <strong>{total - counts.new}</strong>
            <span>items met</span>
          </div>
          <div class="tile-stat">
            <strong>{counts.mastered}</strong>
            <span>mastered</span>
          </div>
          <div class="tile-stat">
            <strong>{accuracy === null ? '–' : `${accuracy}%`}</strong>
            <span>correct</span>
          </div>
          <div class="tile-stat">
            <strong>{p.totals.sessions}</strong>
            <span>sessions</span>
          </div>
        </div>
      </section>

      <div class="duo duo-top">
        <section class="card">
          <h2 class="card-title">Last six weeks</h2>
          <Calendar />
        </section>

        <section class="card">
          <h2 class="card-title">What you know</h2>
          <div class="stack" role="img" aria-label="Share of items at each stage">
            {STAGES.map((s) => counts[s] > 0 && <span key={s} class={`stack-part stack-${s}`} style={{ flexGrow: counts[s] }} />)}
          </div>
          <ul class="stack-legend">
            {STAGES.map((s) => (
              <li key={s}>
                <span class={`dot dot-${s}`} /> {STAGE_NAME[s]} <strong>{counts[s]}</strong>
              </li>
            ))}
          </ul>
          <p class="quiet small">
            “Mastered” means it would still be remembered after three weeks without seeing it.
          </p>
        </section>
      </div>

      <section class="card">
        <h2 class="card-title">By lesson</h2>
        <ul class="lesson-bars">
          {catalog.lessons.map((lesson) => {
            const lp = lessonProgress(lesson);
            return (
              <li key={lesson.id}>
                <button type="button" onClick={() => navigate({ name: 'lesson', id: lesson.id })}>
                  <span class="lesson-bars-name">
                    <span>{lesson.emoji}</span> <span lang="fr">{pretty(lesson.title)}</span>
                  </span>
                  <span class="twobar">
                    <span class="twobar-seen" style={{ width: `${(lp.seen / (lp.total || 1)) * 100}%` }} />
                    <span class="twobar-mastered" style={{ width: `${(lp.mastered / (lp.total || 1)) * 100}%` }} />
                  </span>
                  <span class="quiet small">
                    {lp.seen}/{lp.total}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {tricky.length > 0 && (
        <section class="card">
          <h2 class="card-title">The tricky ones</h2>
          <ul class="rows">
            {tricky.map(({ item, card }) => (
              <li class="row" key={item.id}>
                <span class={`dot dot-${stageOf(card)}`} />
                <span class="row-main">
                  <Fr>{frenchOf(item)}</Fr>
                  <span class="row-en">{item.en}</span>
                </span>
                <span class="quiet small">missed {card.wrong}×</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="card">
        <h2 class="card-title">
          Badges{' '}
          <span class="quiet">
            {Object.keys(p.achievements).length}/{ACHIEVEMENTS.length}
          </span>
        </h2>
        <ul class="badges">
          {ACHIEVEMENTS.map((a) => {
            const got = a.id in p.achievements;
            return (
              <li key={a.id} class={`badge ${got ? 'badge-on' : ''}`}>
                <span class="badge-emoji">{got ? a.emoji : '·'}</span>
                <strong lang="fr">{a.title}</strong>
                <span class="quiet small">{a.description}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
