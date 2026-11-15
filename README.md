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
- Tapped the wrong answer? The **↶ button** at the top of a session takes back the last answer, even after *Continuer*, and asks the question again. An answer is only saved once she has moved one question further.
- **À toi d'écrire**: each lesson has two writing tasks, a short text to write on the lesson's theme (a message, an email, a little story) and a short English text to translate. At most one comes up per session. She can type, or tap **Parler** to speak instead of typing (or use the microphone key on the iPad keyboard). The writing tutor corrects it if it is set up (below); otherwise she compares it with an example.

### Backups

Progress lives only on the iPad, in Safari's built-in storage. If the iPad is lost or replaced, or the app is deleted, it is gone unless there is a backup.

**Automatic backup (recommended).** Once switched on, a copy of all progress is saved after every finished session (and every *Vrai ou faux ?* round) to a private [gist](https://gist.github.com) on your GitHub account. If there is no internet at that moment, it is sent the next time the app is opened online. GitHub keeps every revision of the gist, so older backups can still be found there. To switch it on, once:

1. On github.com: your picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Name it `Croissant backup`, pick the longest expiration offered, leave *Repository access* on *Public repositories*, and under **Account permissions** set **Gists** to **Read and write**. Nothing else. Generate it and copy it.
2. Get it to the iPad (AirDrop it as a note, or paste it into a note synced by iCloud), then in Croissant: *Réglages → Automatic backup*, paste it, tap **Turn on**.
3. If a backup already exists (a new iPad, or after reinstalling), Croissant shows what it contains and offers to restore it.

The token stays in the app's storage on the iPad. It is not in the code or in this repository, and never goes into a backup file. It can only read and write gists: at worst someone who got hold of it could read or change your gists, and you can revoke it on github.com at any time. When it expires, Réglages says so; generate a new one and paste it in.

Croissant never overwrites an online backup that has more answers than the iPad (after progress was lost or erased, for instance): it says so in Réglages and lets her restore it, or replace it on purpose.

**Backup file.** *Réglages → Back up*, then **Save to Files** and pick iCloud Drive. Without automatic backup, the app reminds her once a week. **Restore** (new iPad, or after reinstalling): *Réglages → Restore from a backup*, pick the file. It shows what the backup contains and asks before replacing anything.

### The writing tutor (optional)

Texts and open answers can be corrected by an AI model through [OpenRouter](https://openrouter.ai): her text comes back corrected, with each mistake explained in English, a more natural version when useful, and a suggested self-rating (she has the last word). Without it, she compares her text with the example answers.

1. On openrouter.ai: **Keys → Create key**. Name it `Croissant` and give it a **credit limit** (a few dollars is plenty: one correction costs about a cent).
2. Get the key to the iPad as above, then *Réglages → Writing tutor*, paste it, tap **Turn on**. Croissant checks the key and shows the credit left.
3. The model is set in the same place (`anthropic/claude-sonnet-5.5` by default). If OpenRouter says the model is unknown, copy the exact name from openrouter.ai/models.

About security: the site is public and has no server, so a key cannot be hidden in the code; that is why it is typed in on the iPad instead, where only the app can read it. It is never committed, never in a backup file, and only sent to OpenRouter. The credit limit is what keeps the risk small: a leaked key could cost at most that amount, and it can be deleted on openrouter.ai at any time. The alternative, a small proxy server holding the key (for example a free Cloudflare Worker), would keep the key off the iPad, but it is one more thing to run and secure, and the proxy's address would itself need protecting.

## Adding a lesson each week

1. Put that week's notes in `lessons/inbox/`: photos of handwritten pages (`.jpg`, `.png`), typed notes (`.md`, `.txt`) or a PDF.
2. In this folder, start Claude Code and run:

   ```
   /add-lesson
   ```

3. Claude reads the notes, then asks you to confirm anything it could not read, the corrections it made to the French, and the personal details it replaced with neutral ones.
4. It writes the lesson, checks it, runs the tests, moves the notes to `lessons/archive/`, commits and pushes.
5. About two minutes later the site is updated. The next time she opens the app with an internet connection, the home screen shows **"A new version is ready"** with an *Update* button.

### Without this computer

The same command works in a cloud session at [claude.ai/code](https://claude.ai/code): choose the `croissant` repository, type `/add-lesson`, and paste the notes after it in the same message. Two differences: the lesson arrives as a pull request, and it goes live once you agree to merge it; and the pasted notes are kept in that session's history in your Claude account rather than in `lessons/archive/` (they are still never committed).

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
  storage/               on-device database, export and import, automatic backup to a gist
  ai/                    the writing tutor (OpenRouter)
  speech/                French voice, voice input and sound effects
  screens/, components/  the interface
  styles/                one stylesheet and the display font
scripts/                 lesson validator, icon generator
tests/                   scheduling, grading, sessions, backup, lessons, tutor
public/                  icons, launch screens, vocabulary pictures
.claude/commands/        the /add-lesson command
.github/workflows/       check and deploy
```

### How review works

Scheduling uses **FSRS**, the algorithm behind modern Anki. It tracks how well each item is remembered and brings it back just before it would be forgotten: an item answered wrongly returns the next day, one answered correctly returns after a few days, then a couple of weeks, then months. FSRS was chosen over the older SM-2 because it needs fewer reviews for the same retention and copes well with skipped days and with late reviews.

Answers are graded automatically: wrong → comes back tomorrow; right apart from an accent, a typo or the article → accepted, the correct spelling is shown, and it returns a little sooner; right → normal interval; right, typed from memory and without hesitation → a longer interval.

The kind of exercise follows how well an item is known, and moves quickly to producing French, since understanding is the easy part for her: first recognising or building it (multiple choice, pictures, word tiles), then producing it with support (a word bank with trap words such as a wrong ending or article, saying it out loud, typing it), then producing it freely (writing whole sentences, dictation). One good answer is usually enough to move on.

Each lesson also has practice material that goes beyond the notes: sentences to translate into French (mostly typed from scratch rather than built from word tiles, which is closer to reading), sentences to rewrite (negative, another tense, another person), open questions to answer in her own words, and two writing tasks (a short text on a theme, and a short text to translate), corrected by the writing tutor or compared with example answers. Typed sentences are corrected word by word, and since a sentence can often be said several ways, a wrong verdict can be overruled with *My answer was right too*. Sessions also adapt: more new items when recent answers are mostly right and little is due, fewer when she is struggling, none while a backlog of reviews is waiting.

### The lesson format

`lessons/schema/lesson.v1.schema.json` is the reference. In short, a lesson is a list of items of nine kinds:

```json
{ "id": "l05.v.poireau", "type": "vocab", "fr": "poireau", "en": "leek", "pos": "noun", "gender": "m", "image": "img/vocab/poireau.svg" }
{ "id": "l05.p.c-est-combien", "type": "phrase", "fr": "C'est combien ?", "en": "How much is it?" }
{ "id": "l02.c.aller-present", "type": "conjugation", "verb": "aller", "en": "to go", "tense": "présent", "forms": { "je": "vais", "tu": "vas", "il": "va", "nous": "allons", "vous": "allez", "ils": "vont" } }
{ "id": "l10.x.ma-mere", "type": "cloze", "fr": "Je téléphone à {{ma}} mère.", "en": "I phone my mother.", "distractors": ["mon", "mes", "ton"] }
{ "id": "l10.g.possessifs", "type": "grammar", "title": "Les adjectifs possessifs", "body": "…" }
{ "id": "l01.s.ou-es-tu-alle", "type": "sentence", "fr": "Où es-tu allé le week-end dernier ?", "en": "Where did you go last weekend?", "frAlt": ["Tu es [allé|allée] où le week-end dernier ?"], "traps": ["as", "aller"] }
{ "id": "l08.t.imp-faire-ski", "type": "transform", "task": "Mets la phrase à l'imparfait.", "taskEn": "Put the sentence in the imparfait.", "from": "Je fais du ski.", "fr": "Je faisais du ski.", "en": "I used to go skiing." }
{ "id": "l06.q.ce-week-end", "type": "question", "fr": "Qu'est-ce que tu vas faire ce week-end ?", "en": "What are you going to do this weekend?", "models": ["Samedi, je vais faire du shopping.", "Je vais visiter un musée."] }
{ "id": "l06.w.invitation", "type": "writing", "fr": "Écris un message pour inviter une amie à sortir samedi.", "en": "Write a message inviting a friend out on Saturday.", "points": ["ça te dit de… ?", "the futur proche"], "minWords": 35, "models": ["Coucou Julie ! Tu es libre samedi soir ? …"] }
{ "id": "l01.w.traduire-demenagement", "type": "writing", "fr": "Traduis ce texte en français.", "en": "Translate this text into French.", "source": "Ten years ago, we lived in a small town…", "models": ["Il y a dix ans, on habitait dans une petite ville…"] }
```

Each lesson has a permanent **number**, in its file name and in every item id (`l04-en-cuisine.json`, `l04.v.passoire`), and an **`order`**, its place in the course (*Leçon 5* in the app). They usually match, but lessons can be moved around by changing only `order`: lesson 4 (cooking) now comes after lesson 5 (shopping), and lesson 8 (planning a trip) before lessons 6 and 7. The number never changes, because progress is stored against the item ids. A new lesson takes the next free number and the next order.

In sentences, `[a|b]` lists variants that are all accepted (the first is displayed), and `traps` are wrong words added to the word bank.

You can edit a lesson by hand (fix a translation, add a note, add items). Run `npm run check` afterwards. The one thing never to do is change or remove an existing `id`.

## If something goes wrong

- **The new lesson does not appear on the iPad.** Check that the deployment succeeded (`gh run list`). Then open the app with an internet connection, wait a few seconds, and close and reopen it; the *Update* banner appears on the home screen.
- **No sound in listening exercises.** Check the iPad is not on silent, then *Réglages → Test the voice*.
- **Progress has disappeared.** iOS can clear a web app's storage if the app is removed from the home screen. In *Réglages*, paste the GitHub token again to find the automatic backup and restore it, or restore the latest backup file.
- **A French mistake in a lesson.** Fix it in the lesson's JSON file, run `npm run check`, commit and push.
