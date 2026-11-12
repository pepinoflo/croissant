# Croissant 🥐

A five-minute daily French review game for the iPad, built from the notes of a weekly French class rather than from a generic course.

- **Address:** https://pepinoflo.github.io/croissant/
- **No server, no account.** It is a website made of plain files, hosted for free on GitHub Pages. Progress is stored on the iPad itself.
- **Works offline** once it has been opened one time.

## Putting it on the iPad

Do this once, on her iPad:

1. Open **Safari** and go to https://pepinoflo.github.io/croissant/
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. From now on, open Croissant from its icon on the home screen. It runs full screen, like any other app.

Install it *before* the first session: progress made in the Safari tab is not carried over to the home-screen app.

Optional, for a nicer voice in the listening exercises: on the iPad, go to **Settings → Accessibility → Spoken Content → Voices → French** and download an *Enhanced* voice. Then choose it in Croissant under **Réglages → French voice**.

## How she uses it

- **Aujourd'hui** shows today's session: the items due for review plus a few new ones. One finished session a day keeps the streak going and earns the day's croissant.
- A missed day uses up a **streak freeze** (the snowflakes) instead of breaking the streak. A new freeze is earned every five days in a row, up to two.
- **Leçons** is a tidy version of the class notes, with a *Practise this lesson* button on each one.
- **Vrai ou faux ?** is a 60-second bonus game. It gives a little XP and does not change the review schedule.
- **Progrès** shows the level, the calendar, what is mastered, and the badges.

### Backups

Progress lives only on the iPad, in Safari's built-in storage. If the iPad is lost or replaced, or the app is deleted, it is gone unless there is a backup.

- **Back up:** *Réglages → Back up*, then choose **Save to Files** and pick iCloud Drive. The app reminds her once a week.
- **Restore** (new iPad, or after reinstalling): *Réglages → Restore from a backup*, pick the file. It shows what the backup contains and asks before replacing anything.

## Adding a lesson each week

1. Put that week's notes in `lessons/inbox/`: photos of handwritten pages (`.jpg`, `.png`), typed notes (`.md`, `.txt`) or a PDF.
2. In this folder, start Claude Code and run:

   ```
   /add-lesson
   ```

3. Claude reads the notes, then asks you to confirm anything it could not read, the corrections it made to the French, and the personal details it replaced with neutral ones.
4. It writes the lesson, checks it, runs the tests, moves the notes to `lessons/archive/`, commits and pushes.
5. About two minutes later the site is updated. The next time she opens the app with an internet connection, the home screen shows **"A new version is ready"** with an *Update* button.

Adding lessons never touches her progress: every word and sentence has a permanent id, and the checks refuse any change that would remove or rename one.

### Privacy

The site and this repository are public. The raw notes are never committed: `lessons/inbox/` and `lessons/archive/` are ignored by git and stay on this computer. Lesson files contain only generalised sentences (no names, places lived, family details).

## One-time setup on a new computer

You need [Node.js](https://nodejs.org) 22 or later, `git`, and the GitHub CLI (`gh`).

```bash
git clone https://github.com/pepinoflo/croissant.git
cd croissant
npm install
npm run dev        # the app at http://localhost:5173
```

To look at it from the iPad while developing, both devices must be on the same Wi-Fi; `npm run dev` prints a "Network" address to open in Safari.

## Deploying

There is nothing to do by hand. Every push to `main` runs `.github/workflows/deploy.yml`, which validates the lessons, runs the tests, builds the site and publishes it to GitHub Pages. If a check fails, the live site is left as it was.

- Watch a deployment: `gh run watch`
- First-time setup of a fresh repository: *Settings → Pages → Source: GitHub Actions* (or `gh api -X POST repos/pepinoflo/croissant/pages -f build_type=workflow`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the app locally, reloading as files change |
| `npm run validate` | Check every lesson file against the schema and the rules |
| `npm run lessons:lock` | Validate, then record new item ids in `lessons/ids.lock.json` |
| `npm test` | Run the tests |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm run check` | Validate, test and build: everything the deployment runs |
| `npm run icons` | Redraw the app icon and launch screens after changing the logo |

## How it is organised

```
lessons/                 one JSON file per class: the content of the app
  schema/                the lesson format (JSON Schema, version 1)
  ids.lock.json          every id ever published; protects progress
  inbox/                 put new notes here (not committed)
  archive/               processed notes (not committed)
src/
  content/               lesson types and French text helpers
  srs/                   scheduling (FSRS), session planning, answer checking
  exercises/             turns lesson items into exercises
  game/                  streak, XP and levels, badges
  storage/               on-device database, export and import
  speech/                French voice and sound effects
  screens/, components/  the interface
  styles/                one stylesheet and the display font
scripts/                 lesson validator, icon generator
tests/                   scheduling, grading, sessions, backup, lessons
public/                  icons, launch screens, vocabulary pictures
.claude/commands/        the /add-lesson command
.github/workflows/       check and deploy
```

### How review works

Scheduling uses **FSRS**, the algorithm behind modern Anki. It tracks how well each item is remembered and brings it back just before it would be forgotten: an item answered wrongly returns the next day, one answered correctly returns after a few days, then a couple of weeks, then months. FSRS was chosen over the older SM-2 because it needs fewer reviews for the same retention and copes well with skipped days and with late reviews.

Answers are graded automatically: wrong → comes back tomorrow; right apart from an accent, a typo or the article → accepted, the correct spelling is shown, and it returns a little sooner; right → normal interval; right, typed from memory and without hesitation → a longer interval.

The kind of exercise follows how well an item is known: first recognising it (multiple choice, pictures, flashcards), then recalling it with support (listening, building the sentence from tiles, masculine or feminine), then producing it (typing, dictation). Sessions also adapt: more new items when recent answers are mostly right and little is due, fewer when she is struggling, none while a backlog of reviews is waiting.

### The lesson format

`lessons/schema/lesson.v1.schema.json` is the reference. In short, a lesson is a list of items of five kinds:

```json
{ "id": "l05.v.poireau", "type": "vocab", "fr": "poireau", "en": "leek", "pos": "noun", "gender": "m", "image": "img/vocab/poireau.svg" }
{ "id": "l05.p.c-est-combien", "type": "phrase", "fr": "C'est combien ?", "en": "How much is it?" }
{ "id": "l02.c.aller-present", "type": "conjugation", "verb": "aller", "en": "to go", "tense": "présent", "forms": { "je": "vais", "tu": "vas", "il": "va", "nous": "allons", "vous": "allez", "ils": "vont" } }
{ "id": "l10.x.ma-mere", "type": "cloze", "fr": "Je téléphone à {{ma}} mère.", "en": "I phone my mother.", "distractors": ["mon", "mes", "ton"] }
{ "id": "l10.g.possessifs", "type": "grammar", "title": "Les adjectifs possessifs", "body": "…" }
```

You can edit a lesson by hand (fix a translation, add a note, add items). Run `npm run check` afterwards. The one thing never to do is change or remove an existing `id`.

## If something goes wrong

- **The new lesson does not appear on the iPad.** Check that the deployment succeeded (`gh run list`). Then open the app with an internet connection, wait a few seconds, and close and reopen it; the *Update* banner appears on the home screen.
- **No sound in listening exercises.** Check the iPad is not on silent, then *Réglages → Test the voice*.
- **Progress has disappeared.** iOS can clear a web app's storage if the app is removed from the home screen. Restore the latest backup from *Réglages*.
- **A French mistake in a lesson.** Fix it in the lesson's JSON file, run `npm run check`, commit and push.
