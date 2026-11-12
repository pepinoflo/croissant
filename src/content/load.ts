// Lessons are plain JSON files in /lessons, bundled into the app at build time.
// Adding a file there and redeploying is all it takes to add a lesson.

import { buildCatalog } from './catalog';
import type { Lesson } from './types';

const modules = import.meta.glob<Lesson>('../../lessons/l*.json', { eager: true, import: 'default' });

export const catalog = buildCatalog(Object.values(modules));
