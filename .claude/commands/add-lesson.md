---
description: Turn new class notes in lessons/inbox/ into a lesson, then test, commit and push it
argument-hint: "[optional: lesson title or date]"
---

Add a new lesson to Croissant from the notes in `lessons/inbox/`. Extra instructions from the user, if any: $ARGUMENTS

The learner is at about **A2**, reads **English**, and reviews on an iPad. Everything she sees comes from these files, so accuracy matters more than volume.

## Rules that are never broken

- **Raw notes stay on this computer.** `lessons/inbox/` and `lessons/archive/` are git-ignored. Never copy note files, photos or their text verbatim into anything that is committed, and never `git add -f` them.
- **Nothing personal is published.** The site and the repository are public. Before anything is written to a lesson file, generalise every personal detail (step 4).
- **Item ids are permanent.** Progress on the iPad is stored against them. Never rename, reuse or delete an id in an existing lesson, and never renumber lessons. `lessons/ids.lock.json` and the tests enforce this.
- **Do not write the lesson file until the user has answered the questions in step 5.**

## 1. Read the inbox

List `lessons/inbox/` (ignore `.gitkeep`). If it is empty, say so and stop.

Read every file: Markdown and text directly, photos and PDFs with the Read tool. If a `.heic` photo cannot be opened, try converting it (`heif-convert`, or Python with `pillow-heif`); if that is not possible, ask the user to re-export it as JPEG and stop.

For handwriting, first transcribe exactly what is on the page, marking anything uncertain with `[?]`. Do not silently guess a word you cannot read.

## 2. Learn the format

Read `lessons/schema/lesson.v1.schema.json` and the most recent `lessons/lNN-*.json` as a model of style and density. The next lesson number is the highest existing `order` + 1.

Check what has already been taught so nothing is duplicated: search the existing lesson files for each word and sentence you plan to add. Something already present is skipped, not repeated (unless the notes clearly revisit it with a new meaning).

## 3. Extract the content

Work through the notes and collect:

- **Vocabulary** → `vocab`. `fr` is the word *without* its article (infinitive for verbs). Nouns need `gender` (`m`, `f`, or `mf`), plus `plural: true` for plural-only nouns and `article` when un/une is not natural (`du pain`, `l'école`, `les gens`). Give `pos`. Add `emoji` only when one clearly shows the thing itself; if none does and the word is concrete, either leave it without a picture or draw a small SVG in `public/img/vocab/` in the style of the existing ones (96×96 viewBox, dark `#2B3350` outline, flat fills) and reference it with `image`.
- **Phrases and sentences** → `phrase`, with `register` when the notes mark it as formal or informal. List equally correct variants in `frAlt`.
- **Verb tables** → `conjugation`: six forms, without the subject pronoun (`"je": "vais"`; reflexives keep theirs: `"me couche"`).
- **Grammar points** → `grammar`: a short explanation in English, a table if the notes have one, and examples. Link exercises to it with `"grammar": "<id>"` so it is shown as a reminder first.
- **Worksheet exercises** and practice sentences → `cloze`, one `{{answer}}` each, with an English translation of the whole sentence, a `hint` (usually the infinitive) and three `distractors`. Also write a few cloze items of your own for each grammar point, using the lesson's vocabulary.

Guidelines:

- Keep the teacher's wording wherever it is correct. Follow the order of the notes, and use `group` for the headings.
- Glosses are in English, short, and distinct from one another (two items in a lesson should not share the same `en`; use `enAlt` for extra meanings and synonyms).
- **Distractors must be wrong, not merely different.** "Je téléphone à ___ mère": `sa` is grammatical, so it cannot be a distractor; `mon` can. When several answers are right, put the others in `accept`.
- A `note` is one short line in English: a pronunciation trap, a false friend, the feminine form.
- Ids: `lNN.<letter>.<slug>` with `v` vocab, `p` phrase, `c` conjugation, `x` cloze, `g` grammar; slug in lowercase ASCII with hyphens (`l11.v.boulangerie`).
- Write apostrophes as straight `'`. The app displays them properly.
- Aim for roughly 35–70 items. A lesson is better short and right than long and padded.

## 4. Correct and generalise

**French.** The notes are a learner's notes and contain mistakes. Teach the correct form, and keep a list of every correction (what the notes said → what the lesson says, and why). Typical slips: verb endings (`je met` → `je mets`, `elle vas` → `elle va`), accents (`préféres` → `préfères`), agreement, missing elision, anglicisms. Where the notes use a regional form (for example Canadian `bleuet`), teach standard French from France and mention the variant in a `note`. Where the notes give only English, supply the French and list it as an addition.

**Privacy.** Go through every sentence and replace or drop anything that identifies her or her family: names of people, where they live or have lived, where they come from, employers and jobs of relatives, ages, dates of personal events, health, money, travel plans with dates. Keep the grammar and vocabulary of the sentence and swap the detail for a neutral one (a sentence naming the city they lived in and the year they moved becomes `Il y a dix ans, on habitait dans un autre pays`). Invented first names are fine. Keep a list of every such change.

## 5. Ask before writing

Show the user, concisely:

1. The proposed title (French), English subtitle, emoji and lesson number.
2. Everything illegible or unclear, each with your best reading, as questions.
3. The list of corrections to the French.
4. The list of privacy changes, and anything you were unsure whether to generalise.
5. The count of items by type.

Wait for the answers. Apply them.

## 6. Write and verify

1. Write `lessons/lNN-<slug>.json` (the file name is the lesson `id`).
2. Proofread: re-read every French string once more for nothing but gender, agreement, verb endings, accents and elision, and every cloze for a distractor that could be defended as correct.
3. `npm run validate` and fix what it reports.
4. `npm run lessons:lock` to record the new ids.
5. `npm test` and `npm run build`. Both must pass. If a test about existing lessons fails, you changed something you should not have: undo it.

## 7. Archive, commit, push

1. Move the source files from `lessons/inbox/` to `lessons/archive/<lesson id>/` (create the folder). They stay on this computer.
2. Run `git status --short` and confirm that nothing under `lessons/inbox/` or `lessons/archive/` is listed.
3. Stage only the new lesson file, `lessons/ids.lock.json` and any new picture. Commit with a message like `Add lesson NN: <title>`.
4. `git push`. GitHub then tests and redeploys the site (about two minutes); `gh run watch` shows it.

## 8. Report

Tell the user: the lesson number and title, how many items of each kind, the corrections and privacy changes that were applied, and that the iPad will offer the update the next time the app is opened with an internet connection (a banner on the home screen: "A new version is ready").
