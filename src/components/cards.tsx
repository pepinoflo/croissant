// Cards that present lesson content: a word, a phrase, a verb table, a grammar point.

import { conjugationTitle, PRONOUN_LABEL, pretty, vocabDisplay, withPronoun } from '../content/french';
import { PERSONS, type ConjugationItem, type GrammarItem, type PhraseItem, type StudyItem, type VocabItem } from '../content/types';
import { Fr, Picture, RichText, SpeakButton } from './ui';

const REGISTER: Record<string, string> = { informal: 'informal', neutral: 'everyday', formal: 'formal' };

export function frenchOf(item: StudyItem): string {
  if (item.type === 'vocab') return vocabDisplay(item);
  if (item.type === 'phrase') return item.fr;
  if (item.type === 'conjugation') return conjugationTitle(item);
  return item.fr.replace(/\{\{(.+?)\}\}/, '$1');
}

function WordCard({ item }: { item: VocabItem | PhraseItem }) {
  const fr = item.type === 'vocab' ? vocabDisplay(item) : item.fr;
  const media = item.type === 'vocab' && (item.emoji || item.image) ? { emoji: item.emoji, image: item.image } : null;
  return (
    <div class="intro-card">
      {media && <Picture media={media} size={128} />}
      <div class="prompt-text">
        <Fr>{fr}</Fr>
        <SpeakButton text={fr} />
      </div>
      <p class="intro-en">{item.en}</p>
      {item.type === 'vocab' && item.pos === 'noun' && item.gender !== 'mf' && (
        <span class={`chip chip-${item.gender}`}>{item.gender === 'f' ? 'féminin' : 'masculin'}{item.plural ? ' · pluriel' : ''}</span>
      )}
      {item.type === 'phrase' && item.register && <span class="chip">{REGISTER[item.register]}</span>}
      {item.note && <p class="note">{pretty(item.note)}</p>}
      {item.type === 'vocab' && item.example && (
        <p class="example">
          <Fr>{item.example.fr}</Fr>
          <span>{item.example.en}</span>
        </p>
      )}
    </div>
  );
}

export function ConjugationTable({ item }: { item: ConjugationItem }) {
  return (
    <table class="conj">
      <tbody>
        {PERSONS.map((p) => (
          <tr key={p}>
            <th>{PRONOUN_LABEL[p]}</th>
            <td>
              <Fr>{item.forms[p]}</Fr>
            </td>
            <td class="conj-speak">
              <SpeakButton text={withPronoun(p, item.forms[p])} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConjugationCard({ item }: { item: ConjugationItem }) {
  return (
    <div class="intro-card">
      <div class="prompt-text">
        <Fr>{item.verb}</Fr>
      </div>
      <p class="intro-en">
        {item.en} · <span lang="fr">{item.tense}</span>
      </p>
      <ConjugationTable item={item} />
      {item.note && <p class="note">{pretty(item.note)}</p>}
    </div>
  );
}

/** How a new item is presented the first time it appears in a session. */
export function IntroCard({ item }: { item: StudyItem }) {
  if (item.type === 'conjugation') return <ConjugationCard item={item} />;
  if (item.type === 'cloze') return null;
  return <WordCard item={item} />;
}

export function GrammarCard({ item }: { item: GrammarItem }) {
  return (
    <article class="grammar">
      <header>
        <h3 lang="fr">{pretty(item.title)}</h3>
        {item.titleEn && <p class="grammar-en">{item.titleEn}</p>}
      </header>
      <RichText text={item.body} />
      {item.table && (
        <div class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                {item.table.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} lang="fr">
                      {pretty(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {item.examples && (
        <ul class="examples">
          {item.examples.map((e, i) => (
            <li key={i}>
              <Fr>{e.fr}</Fr>
              <span>{e.en}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
