import { useState } from 'preact/hooks';
import { Croissant, Icon } from './components/ui';
import { LessonDetail, Lessons } from './screens/Lessons';
import { Progress } from './screens/Progress';
import { Session } from './screens/Session';
import { Settings } from './screens/Settings';
import { Sprint } from './screens/Sprint';
import { Today } from './screens/Today';
import { navigate, ready, route, type Route } from './state/store';

const TABS: { name: Route['name']; label: string; icon: string }[] = [
  { name: 'today', label: 'Aujourd’hui', icon: 'home' },
  { name: 'lessons', label: 'Leçons', icon: 'book' },
  { name: 'progress', label: 'Progrès', icon: 'chart' },
  { name: 'settings', label: 'Réglages', icon: 'gear' },
];

export function App() {
  // Bumped to start a fresh session from the summary screen.
  const [run, setRun] = useState(0);
  const r = route.value;

  if (!ready.value) {
    return (
      <div class="boot">
        <Croissant size={96} />
      </div>
    );
  }

  if (r.name === 'session') {
    return <Session key={`${r.focusLessonId ?? 'daily'}-${run}`} focusLessonId={r.focusLessonId} onAgain={() => setRun(run + 1)} />;
  }
  if (r.name === 'sprint') return <Sprint />;

  const active = r.name === 'lesson' ? 'lessons' : r.name;
  return (
    <div class="shell">
      <nav class="tabs" aria-label="Sections">
        <span class="tabs-logo">
          <Croissant size={44} />
        </span>
        {TABS.map((t) => (
          <button
            key={t.name}
            type="button"
            class={`tab ${active === t.name ? 'is-active' : ''}`}
            aria-current={active === t.name ? 'page' : undefined}
            onClick={() => navigate({ name: t.name } as Route)}
          >
            <Icon name={t.icon} size={26} />
            <span lang="fr">{t.label}</span>
          </button>
        ))}
      </nav>
      <main class="main">
        {r.name === 'today' && <Today />}
        {r.name === 'lessons' && <Lessons />}
        {r.name === 'lesson' && <LessonDetail id={r.id} />}
        {r.name === 'progress' && <Progress />}
        {r.name === 'settings' && <Settings />}
      </main>
    </div>
  );
}
