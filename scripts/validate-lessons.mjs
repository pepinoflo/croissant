#!/usr/bin/env node
// Checks every lesson file against the schema and the rules the app relies on.
//
//   npm run validate        check everything, including the id lock
//   npm run lessons:lock    check, then record any new ids in lessons/ids.lock.json
//
// The id lock is what protects progress: once an id has been published, removing
// or renaming it would orphan what has been learned on the iPad, so that is an error.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LESSONS_DIR = join(ROOT, 'lessons');
export const LOCK_FILE = join(LESSONS_DIR, 'ids.lock.json');
const SCHEMA_FILE = join(LESSONS_DIR, 'schema', 'lesson.v1.schema.json');
const PUBLIC_DIR = join(ROOT, 'public');

const TYPE_LETTER = { vocab: 'v', phrase: 'p', conjugation: 'c', cloze: 'x', grammar: 'g' };
const CLOZE = /\{\{(.+?)\}\}/;

const norm = (s) =>
  s
    .normalize('NFC')
    .toLocaleLowerCase('fr')
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:…«»"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function readLessonFiles(dir = LESSONS_DIR) {
  return readdirSync(dir)
    .filter((f) => /^l\d{2}-.*\.json$/.test(f))
    .sort()
    .map((file) => ({ file, lesson: JSON.parse(readFileSync(join(dir, file), 'utf8')) }));
}

export function readLock(file = LOCK_FILE) {
  if (!existsSync(file)) return { ids: [], retired: [] };
  const lock = JSON.parse(readFileSync(file, 'utf8'));
  return { ids: lock.ids ?? [], retired: lock.retired ?? [] };
}

/**
 * @param {{file: string, lesson: any}[]} entries
 * @param {{ids: string[], retired: string[]}} lock
 * @returns {{errors: string[], warnings: string[], ids: string[]}}
 */
export function validateLessons(entries, lock = { ids: [], retired: [] }, opts = {}) {
  const publicDir = opts.publicDir ?? PUBLIC_DIR;
  const errors = [];
  const warnings = [];
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')));

  const allIds = new Map();
  const orders = new Map();
  const grammarIds = new Set();
  const grammarRefs = [];

  for (const { file, lesson } of entries) {
    const at = (msg) => errors.push(`${file}: ${msg}`);
    if (!validate(lesson)) {
      for (const e of validate.errors ?? []) {
        // oneOf produces a lot of noise; keep the specific messages.
        if (e.keyword === 'oneOf') continue;
        const where = e.instancePath || '/';
        const item = /^\/items\/(\d+)/.exec(where);
        const id = item ? lesson.items?.[Number(item[1])]?.id : undefined;
        at(`${where}${id ? ` (${id})` : ''} ${e.message}${e.params?.additionalProperty ? `: "${e.params.additionalProperty}"` : ''}`);
      }
      continue;
    }

    if (`${lesson.id}.json` !== file) at(`id "${lesson.id}" does not match the file name`);
    const num = lesson.id.slice(1, 3);
    if (Number(num) !== lesson.order) at(`order ${lesson.order} does not match the number in the id (${num})`);
    if (orders.has(lesson.order)) at(`order ${lesson.order} is already used by ${orders.get(lesson.order)}`);
    orders.set(lesson.order, file);

    for (const item of lesson.items) {
      const err = (msg) => at(`${item.id}: ${msg}`);
      if (allIds.has(item.id)) err(`duplicate id (also in ${allIds.get(item.id)})`);
      allIds.set(item.id, file);
      if (!item.id.startsWith(`l${num}.`)) err(`id must start with "l${num}."`);
      if (item.id.split('.')[1] !== TYPE_LETTER[item.type]) {
        err(`a ${item.type} id must use the letter "${TYPE_LETTER[item.type]}"`);
      }
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'string' && value !== value.trim()) err(`"${key}" has leading or trailing spaces`);
        if (typeof value === 'string' && /[’‘]/.test(value)) err(`"${key}" uses a curly apostrophe; write a straight ' (the app prettifies it)`);
      }

      if (item.type === 'vocab') {
        if (item.pos !== 'noun' && (item.gender || item.article || item.plural)) {
          err('gender, article and plural only apply to nouns');
        }
        if (item.pos === 'noun' && /^((un|une|des|du|le|la|les)\s|l'|d')/i.test(item.fr)) {
          err('"fr" must not include the article; use "article" or "gender"');
        }
        if (item.article === 'du' && item.gender !== 'm') err('"du" needs gender m');
        if ((item.article === 'de la' || item.article === 'la' || item.article === 'une') && item.gender !== 'f') {
          err(`article "${item.article}" needs gender f`);
        }
        if ((item.article === 'le' || item.article === 'un') && item.gender !== 'm') {
          err(`article "${item.article}" needs gender m`);
        }
        if (item.image && !existsSync(join(publicDir, item.image))) err(`image not found: public/${item.image}`);
        if (item.frAlt?.some((a) => norm(a) === norm(item.fr))) err('"frAlt" repeats "fr"');
        if (item.enAlt?.some((a) => norm(a) === norm(item.en))) err('"enAlt" repeats "en"');
      }

      if (item.type === 'phrase') {
        if (item.frAlt?.some((a) => norm(a) === norm(item.fr))) err('"frAlt" repeats "fr"');
      }

      if (item.type === 'cloze') {
        const m = CLOZE.exec(item.fr);
        const answers = [m[1], ...(item.accept ?? [])].map(norm);
        if (m[1] !== m[1].trim()) err('the {{answer}} has spaces inside the braces');
        for (const d of item.distractors) {
          if (answers.includes(norm(d))) err(`distractor "${d}" is also listed as a correct answer`);
        }
        if (new Set(answers).size !== answers.length) err('"accept" repeats the answer');
      }

      if (item.type === 'conjugation') {
        for (const [person, form] of Object.entries(item.forms)) {
          // "nous couchons" is fine (reflexive pronoun); "nous nous couchons" includes the subject.
          if (/^((je|tu|il|elle|on|ils|elles)\s|j'|nous nous\s|vous vous\s)/i.test(form)) {
            err(`form for "${person}" must not include the subject pronoun ("${form}")`);
          }
        }
      }

      if (item.type === 'grammar') {
        grammarIds.add(item.id);
        const cols = item.table?.headers.length;
        if (item.table?.rows.some((r) => r.length !== cols)) err('every table row must have as many cells as there are headers');
      }
      if (item.grammar) grammarRefs.push({ file, id: item.id, ref: item.grammar });
    }
  }

  for (const { file, id, ref } of grammarRefs) {
    if (!grammarIds.has(ref)) errors.push(`${file}: ${id}: "grammar" points to "${ref}", which is not a grammar card`);
  }

  // Published ids must still exist (or be explicitly retired).
  const retired = new Set(lock.retired);
  for (const id of lock.ids) {
    if (!allIds.has(id) && !retired.has(id)) {
      errors.push(
        `ids.lock.json: published id "${id}" no longer exists. Ids are permanent — restore it, or add it to "retired" in the lock file if the item was removed on purpose.`,
      );
    }
  }
  for (const id of retired) {
    if (allIds.has(id)) errors.push(`ids.lock.json: retired id "${id}" is in use again; ids must never be reused`);
  }

  return { errors, warnings, ids: [...allIds.keys()].sort() };
}

function main() {
  const lockMode = process.argv.includes('--lock');
  const entries = readLessonFiles();
  const lock = readLock();
  const { errors, warnings, ids } = validateLessons(entries, lock);

  for (const w of warnings) console.warn(`warning  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error    ${e}`);
    console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} found.`);
    process.exit(1);
  }

  const known = new Set(lock.ids);
  const fresh = ids.filter((id) => !known.has(id));
  const items = entries.reduce((n, e) => n + e.lesson.items.length, 0);
  console.log(`${entries.length} lessons, ${items} items: all valid.`);

  if (lockMode) {
    const next = { note: 'Every item id ever published. Never edit by hand except to move an id to "retired".', ids: [...new Set([...lock.ids, ...ids])].sort(), retired: lock.retired };
    writeFileSync(LOCK_FILE, JSON.stringify(next, null, 2) + '\n');
    console.log(`ids.lock.json updated: ${fresh.length} new id${fresh.length === 1 ? '' : 's'} recorded.`);
  } else if (fresh.length) {
    console.log(`${fresh.length} new id${fresh.length === 1 ? '' : 's'} not yet in ids.lock.json — run "npm run lessons:lock" before committing.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
