// The home screen: today's session, the week, streak and level.

import { Bar, Button, Croissant, Icon, Ring } from '../components/ui';
import { studyItemsOf } from '../content/catalog';
import { catalog } from '../content/load';
import { MAX_FREEZES } from '../game/streak';
import { levelInfo } from '../game/xp';
import { addDays, weekdayOf } from '../srs/day';
import { stageOf } from '../srs/scheduler';
import { countItems, newAllowance, SIZES } from '../srs/session';
import { backupDue } from '../storage/backup';
import {
  cards,
  clock,
  days,
  loadError,
  lostStreak,
  navigate,
  profile,
  recentAccuracy,
  saveBackup,
  settings,
  snoozeBackup,
  today,
  updateReady,
} from '../state/store';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const SPRINT_MIN_ITEMS = 8;

function greeting(hour: number): string {
  if (hour < 5) return 'Bonne nuit';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/** True in Safari on an iPhone or iPad when the app has not been added to the home screen. */
function needsInstall(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.userAgent.includes('Macintosh') && nav.maxTouchPoints > 1);
  return ios && nav.standalone === false;
}

function Week() {
  const monday = addDays(today.value, -weekdayOf(today.value));
  return (
    <div class="week" aria-label="This week">
      {WEEKDAYS.map((label, i) => {
        const key = addDays(monday, i);
        const rec = days.value.get(key);
        const done = (rec?.sessions ?? 0) > 0;
        const isToday = key === today.value;
        return (
          <div key={key} class={`week-day ${isToday ? 'is-today' : ''} ${done ? 'is-done' : ''}`}>
            <span class="week-mark">
              {done ? <Croissant size={40} /> : rec?.frozen ? <Icon name="snow" size={26} /> : <Croissant size={40} muted />}
            </span>
            <span class="week-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Today() {
  const now = clock.value;
  const p = profile.value;
  const counts = countItems(catalog, cards.value, now);
  const size = settings.value.sessionSize;
  const reviews = Math.min(counts.due, SIZES[size].reviews);
  const fresh = Math.min(counts.unseen, newAllowance(size, counts.due, recentAccuracy.value));
  const record = days.value.get(today.value);
  const doneToday = (record?.sessions ?? 0) > 0;
  const level = levelInfo(p.xp);
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now));
  const goal = Math.max(1, reviews + fresh);
  const latest = [...catalog.lessons].reverse().find((l) => studyItemsOf(l).some((i) => stageOf(cards.value.get(i.id)) === 'new'))
    ?? catalog.lessons[catalog.lessons.length - 1];
  const latestItems = latest ? studyItemsOf(latest) : [];
  const latestSeen = latestItems.filter((i) => stageOf(cards.value.get(i.id)) !== 'new').length;
  const firstTime = p.totals.sessions === 0 && counts.seen === 0;
  const sprintOpen = counts.seen >= SPRINT_MIN_ITEMS;

  return (
    <div class="page today">
      <header class="page-head">
        <div>
          <p class="eyebrow" lang="fr">{date}</p>
          <h1 lang="fr">{greeting(new Date(now).getHours())} !</h1>
        </div>
        <button type="button" class="level-chip" onClick={() => navigate({ name: 'progress' })}>
          <span class="level-num">{level.level}</span>
          <span lang="fr">{level.title}</span>
        </button>
      </header>

      {loadError.value && <div class="banner banner-bad">{loadError.value}</div>}

      {updateReady.value && (
        <div class="banner banner-accent">
          <span>A new version is ready — it may include new lessons.</span>
          <Button kind="secondary" onClick={() => updateReady.value?.()}>
            Update
          </Button>
        </div>
      )}

      {needsInstall() && (
        <div class="banner">
          <Icon name="share" size={22} />
          <span>
            <strong>Install Croissant first:</strong> tap the Share button, then “Add to Home Screen”. Progress made here in
            Safari is not carried over to the installed app.
          </span>
        </div>
      )}

      {lostStreak.value > 1 && (
        <div class="banner">
          <span>
            Your {lostStreak.value}-day streak has ended. It happens to everyone — a new one starts with today’s session.
          </span>
          <button type="button" class="link" onClick={() => (lostStreak.value = 0)}>
            OK
          </button>
        </div>
      )}

      {backupDue(p, now) && (
        <div class="banner">
          <Icon name="download" size={22} />
          <span>It has been a week since the last backup. Save a copy of your progress?</span>
          <span class="banner-actions">
            <button type="button" class="link" onClick={() => snoozeBackup(2)}>
              Later
            </button>
            <Button kind="secondary" onClick={() => void saveBackup()}>
              Back up
            </Button>
          </span>
        </div>
      )}

      <section class="hero card">
        <Ring value={doneToday ? 1 : Math.min(0.95, (record?.answers ?? 0) / goal)} size={132}>
          <Croissant size={64} muted={!doneToday && (record?.answers ?? 0) === 0} />
        </Ring>
        <div class="hero-text">
          {doneToday ? (
            <>
              <h2>Today’s croissant is earned</h2>
              <p>
                {counts.due > 0
                  ? `${counts.due} more ${counts.due === 1 ? 'item is' : 'items are'} ready if you feel like another round.`
                  : 'Everything is up to date. Come back tomorrow — or play a bonus round.'}
              </p>
            </>
          ) : firstTime ? (
            <>
              <h2>Bienvenue !</h2>
              <p>
                Five minutes a day with the words and sentences from your own French class. The first session introduces{' '}
                {fresh} of them.
              </p>
            </>
          ) : (
            <>
              <h2>Today’s session</h2>
              <p>
                <strong>{reviews}</strong> to review · <strong>{fresh}</strong> new · about {SIZES[size].minutes} min
              </p>
            </>
          )}
          <Button kind={doneToday ? 'secondary' : 'primary'} onClick={() => navigate({ name: 'session' })}>
            {doneToday ? 'Encore une session' : 'C’est parti !'}
          </Button>
        </div>
      </section>

      <section class="card">
        <Week />
      </section>

      <div class="duo">
        <section class="card stat-card">
          <span class={`stat-icon ${p.streak.current > 0 ? 'stat-icon-hot' : ''}`}>
            <Icon name="flame" size={30} />
          </span>
          <div>
            <strong class="stat-big">
              {p.streak.current} {p.streak.current === 1 ? 'jour' : 'jours'}
            </strong>
            <p class="quiet">
              {p.streak.current === 0 ? 'Finish a session to start a streak' : `Best: ${p.streak.best}`}
            </p>
          </div>
          <div class="freezes" title="Streak freezes: each one covers a missed day">
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span key={i} class={`freeze ${i < p.streak.freezes ? 'freeze-on' : ''}`}>
                <Icon name="snow" size={20} />
              </span>
            ))}
          </div>
        </section>

        <section class="card stat-card">
          <span class="stat-icon stat-icon-level">{level.level}</span>
          <div class="grow">
            <strong class="stat-big" lang="fr">
              {level.title}
            </strong>
            <Bar value={level.progress} />
            <p class="quiet">
              {level.span - level.into} XP to level {level.level + 1}
            </p>
          </div>
        </section>
      </div>

      <div class="duo">
        <button type="button" class="card action-card" disabled={!sprintOpen} onClick={() => navigate({ name: 'sprint' })}>
          <span class="stat-icon stat-icon-bolt">
            <Icon name="bolt" size={28} />
          </span>
          <div class="grow">
            <strong class="stat-big" lang="fr">
              Vrai ou faux ?
            </strong>
            <p class="quiet">
              {sprintOpen
                ? p.sprintBest > 0
                  ? `60-second sprint · best score ${p.sprintBest}`
                  : '60-second sprint · a bonus game'
                : 'A bonus game — unlocks after your first session'}
            </p>
          </div>
          <Icon name="chevron" />
        </button>

        {latest && (
          <button type="button" class="card action-card" onClick={() => navigate({ name: 'lesson', id: latest.id })}>
            <span class="lesson-emoji">{latest.emoji}</span>
            <div class="grow">
              <strong class="stat-big" lang="fr">
                {latest.title}
              </strong>
              <Bar value={latestItems.length ? latestSeen / latestItems.length : 0} tone="good" />
              <p class="quiet">
                Leçon {latest.order} · {latestSeen} of {latestItems.length} met
              </p>
            </div>
            <Icon name="chevron" />
          </button>
        )}
      </div>
    </div>
  );
}
