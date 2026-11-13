// The list of lessons, and one lesson shown as a tidy version of the class notes.

import { ConjugationTable, GrammarCard } from '../components/cards';
import { Bar, Button, Fr, Icon, Picture, SpeakButton } from '../components/ui';
import { grammarOf, studyItemsOf } from '../content/catalog';
import { canonical, clozeParts, conjugationTitle, pretty, vocabDisplay } from '../content/french';
import { catalog } from '../content/load';
import type { Lesson, StudyItem } from '../content/types';
import { stageOf, type Stage } from '../srs/scheduler';
import { cards, navigate } from '../state/store';

const STAGE_LABEL: Record<Stage, string> = {
  new: 'not met yet',
  learning: 'learning',
  familiar: 'familiar',
  mastered: 'mastered',
};

export function lessonProgress(lesson: Lesson): { total: number; seen: number; mastered: number } {
  const items = studyItemsOf(lesson);
  let seen = 0;
  let mastered = 0;
  for (const item of items) {
    const stage = stageOf(cards.value.get(item.id));
    if (stage !== 'new') seen++;
    if (stage === 'mastered') mastered++;
  }
  return { total: items.length, seen, mastered };
}

export function Lessons() {
  return (
    <div class="page">
      <header class="page-head">
        <div>
          <p class="eyebrow">{catalog.lessons.length} lessons from class</p>
          <h1 lang="fr">Leçons</h1>
        </div>
      </header>
      <div class="lesson-grid">
        {[...catalog.lessons].reverse().map((lesson) => {
          const p = lessonProgress(lesson);
          return (
            <button key={lesson.id} type="button" class="card lesson-card" onClick={() => navigate({ name: 'lesson', id: lesson.id })}>
              <span class="lesson-emoji">{lesson.emoji}</span>
              <div class="grow">
                <p class="eyebrow">Leçon {lesson.order}</p>
                <strong class="lesson-title" lang="fr">
                  {pretty(lesson.title)}
                </strong>
                <p class="quiet">{lesson.titleEn}</p>
                <Bar value={p.total ? p.seen / p.total : 0} tone="good" />
                <p class="quiet small">
                  {p.seen} of {p.total} met{p.mastered > 0 ? ` · ${p.mastered} mastered` : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ item }: { item: StudyItem }) {
  const stage = stageOf(cards.value.get(item.id));
  const dot = <span class={`dot dot-${stage}`} title={STAGE_LABEL[stage]} aria-label={STAGE_LABEL[stage]} />;

  if (item.type === 'conjugation') {
    return (
      <li class="row row-block">
        <details>
          <summary>
            {dot}
            <Fr>{conjugationTitle(item)}</Fr>
            <span class="row-en">{item.en}</span>
            <Icon name="chevron" size={18} />
          </summary>
          <ConjugationTable item={item} />
          {item.note && <p class="note">{pretty(item.note)}</p>}
        </details>
      </li>
    );
  }
  if (item.type === 'cloze') {
    const parts = clozeParts(item);
    return (
      <li class="row">
        {dot}
        <span class="row-main">
          <span class="fr" lang="fr">
            {pretty(parts.before)}
            <mark>{pretty(parts.answer)}</mark>
            {pretty(parts.after)}
          </span>
          <span class="row-en">{item.en}</span>
        </span>
        <SpeakButton text={parts.full} />
      </li>
    );
  }
  if (item.type === 'sentence' || item.type === 'transform' || item.type === 'question') {
    const fr = item.type === 'question' ? item.fr : canonical(item.fr);
    return (
      <li class="row">
        {dot}
        <span class="row-main">
          {item.type === 'transform' && (
            <span class="row-from">
              <span lang="fr">{pretty(item.from)}</span> → <span class="quiet">{pretty(item.task)}</span>
            </span>
          )}
          <Fr>{fr}</Fr>
          <span class="row-en">{item.en}</span>
          {item.type === 'question' && (
            <span class="row-model">
              e.g. <span lang="fr">{pretty(item.models[0])}</span>
            </span>
          )}
        </span>
        <SpeakButton text={fr} />
      </li>
    );
  }
  const fr = item.type === 'vocab' ? vocabDisplay(item) : item.fr;
  const media = item.type === 'vocab' && (item.emoji || item.image) ? { emoji: item.emoji, image: item.image } : null;
  return (
    <li class="row">
      {dot}
      {media && <Picture media={media} size={40} />}
      <span class="row-main">
        <Fr>{fr}</Fr>
        <span class="row-en">{item.en}</span>
        {item.note && <span class="note">{pretty(item.note)}</span>}
      </span>
      <SpeakButton text={fr} />
    </li>
  );
}

export function LessonDetail({ id }: { id: string }) {
  const lesson = catalog.lessons.find((l) => l.id === id);
  if (!lesson) {
    return (
      <div class="page">
        <Button onClick={() => navigate({ name: 'lessons' })}>Back to lessons</Button>
      </div>
    );
  }
  const p = lessonProgress(lesson);
  const grammar = grammarOf(lesson);

  // Group consecutive items under their heading, as in the notes.
  const groups: { title: string; items: StudyItem[] }[] = [];
  for (const item of studyItemsOf(lesson)) {
    const title = item.group ?? '';
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }

  return (
    <div class="page lesson">
      <button type="button" class="back" onClick={() => navigate({ name: 'lessons' })}>
        <Icon name="back" size={20} /> Leçons
      </button>
      <header class="lesson-head card">
        <span class="lesson-emoji lesson-emoji-big">{lesson.emoji}</span>
        <div class="grow">
          <p class="eyebrow">Leçon {lesson.order}</p>
          <h1 lang="fr">{pretty(lesson.title)}</h1>
          <p>{lesson.summary}</p>
          <Bar value={p.total ? p.seen / p.total : 0} tone="good" />
          <p class="quiet small">
            {p.seen} of {p.total} met · {p.mastered} mastered
          </p>
          <Button onClick={() => navigate({ name: 'session', focusLessonId: lesson.id })}>Practise this lesson</Button>
        </div>
      </header>

      {grammar.length > 0 && (
        <section>
          <h2 class="section-title">Grammaire</h2>
          <div class="grammar-list">
            {grammar.map((g) => (
              <GrammarCard key={g.id} item={g} />
            ))}
          </div>
        </section>
      )}

      {groups.map((group, i) => (
        <section key={i}>
          {group.title && (
            <h2 class="section-title" lang="fr">
              {pretty(group.title)}
            </h2>
          )}
          <ul class="rows card">
            {group.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}

      <p class="legend">
        <span class="dot dot-new" /> not met yet
        <span class="dot dot-learning" /> learning
        <span class="dot dot-familiar" /> familiar
        <span class="dot dot-mastered" /> mastered
      </p>
    </div>
  );
}
