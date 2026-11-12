// An indexed view over all lessons.

import { isStudyItem, type GrammarItem, type Item, type Lesson, type StudyItem } from './types';

export interface Catalog {
  /** Lessons in class order. */
  lessons: Lesson[];
  items: Map<string, Item>;
  lessonOf: Map<string, Lesson>;
  /** Every item that gets scheduled, in lesson then authored order. */
  study: StudyItem[];
}

export function buildCatalog(input: Lesson[]): Catalog {
  const lessons = [...input].sort((a, b) => a.order - b.order);
  const items = new Map<string, Item>();
  const lessonOf = new Map<string, Lesson>();
  const study: StudyItem[] = [];
  for (const lesson of lessons) {
    for (const item of lesson.items) {
      if (items.has(item.id)) throw new Error(`Duplicate item id: ${item.id}`);
      items.set(item.id, item);
      lessonOf.set(item.id, lesson);
      if (isStudyItem(item)) study.push(item);
    }
  }
  return { lessons, items, lessonOf, study };
}

export function studyItemsOf(lesson: Lesson): StudyItem[] {
  return lesson.items.filter(isStudyItem);
}

export function grammarOf(lesson: Lesson): GrammarItem[] {
  return lesson.items.filter((i): i is GrammarItem => i.type === 'grammar');
}
