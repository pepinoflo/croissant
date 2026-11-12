import { buildCatalog, type Catalog } from '../src/content/catalog';
import type { Lesson } from '../src/content/types';
// @ts-expect-error plain JS module shared with the command-line validator
import { readLessonFiles } from '../scripts/validate-lessons.mjs';

export function loadLessons(): { file: string; lesson: Lesson }[] {
  return readLessonFiles();
}

export function loadCatalog(): Catalog {
  return buildCatalog(loadLessons().map((e) => e.lesson));
}

/** Small deterministic random generator, so tests are repeatable. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
