# Architecture notes

The decisions here are the ones that are not obvious from reading the code, or
that took a wrong turn first. Everything else should be legible in place.

## Invariants

**Weights are kilograms, distances metres, durations seconds, timestamps
epoch-milliseconds.** Below the UI boundary there are no other units.
`src/domain/units.ts` is the only module allowed to convert, and it is called at
render and parse time only. Mixing units in storage is how a tracker silently
corrupts years of history, and it is unrecoverable after the fact.

Plate *denominations* are the deliberate exception: a 20 kg plate and a 45 lb
plate are different physical objects, not conversions of each other, so the
inventory is stored in the unit stamped on the plates and the calculator solves
in that unit.

**Everything is soft-deleted.** `deleted = 1`, never `DELETE`. Built-in
exercises are archived rather than removed, because logged sets reference them
— `onDelete: 'restrict'`, so a hard delete would fail rather than orphan. This
is also how a catalogue *replacement* is handled: `seedExercises()` archives
every non-custom row whose slug the new catalogue does not contain, so the old
library disappears from the picker while the history pointing at it still
reads.

## Sync-readiness without a server

There is no backend. Every domain table nonetheless carries a UUIDv7 primary
key, `created_at`, `updated_at`, a `deleted` tombstone and a `dirty` flag, and
`recordChange()` writes a row to `sync_outbox` on every mutation. Nothing reads
that table.

This is not speculative generality — it is the one piece that genuinely cannot
be retrofitted. Adding a change log to an app already holding years of history
means either a lossy backfill or a full re-upload. One INSERT per mutation now
buys a clean delta-sync later. UUIDv7 rather than v4 because it is time-ordered,
so inserts land at the end of the B-tree instead of scattering.

`recordChange()` swallows its own errors on purpose: the outbox is bookkeeping,
and it must never be the reason a user loses a logged set.

## The logger writes through

Two speeds, deliberately:

- Completing, adding or deleting a set writes **immediately**. These represent
  work actually performed.
- Typing in a weight or rep field is **debounced ~400 ms**. Keystrokes are not
  yet facts, and a write per character drops frames.

`flushField()` forces a pending write out before any action that depends on the
value — completing a set does this first, so the stored numbers are the ones the
user confirmed.

The payoff is `findInProgressWorkout()`: a force-stop mid-session is recovered on
next launch. Phones get killed by OEM battery managers in cold gyms. Losing a
session the user already performed is the worst failure this app can have.

## MobX and live queries do different jobs

- **Drizzle `useLiveQuery`** for persisted reads. The SQLite connection is
  opened with `enableChangeListener`, so screens refresh with no manual
  invalidation and there is no second copy of the database to keep in sync.
- **MobX** only for ephemeral session state: the in-progress workout, the
  rest-timer clock, and the settings cache (read several times per set row, so it
  has to be synchronous).

Where a live query cannot express the shape needed — `listRoutines()` joins in
each routine's exercise names — the pattern is "watch the table as a change
signal, re-run the richer query". See `hooks/useRoutines.ts`.

## Gotcha: expo-sqlite is a SYNC Drizzle driver

`ExpoSQLiteDatabase extends BaseSQLiteDatabase<'sync', …>`. Two consequences,
one harmless and one that cost a real bug:

1. **Harmless.** `await db.select()…` works, because the query builders'
   `execute()` is declared `async` regardless of dialect.

2. **Not harmless.** `db.transaction()` **does not await its callback.** The
   implementation is:

   ```js
   this.run(sql.raw('begin'));
   const result = transaction(tx);   // return value ignored
   this.run(sql`commit`);
   ```

   An `async` callback therefore runs only up to its first `await`; the
   transaction commits empty, and every remaining statement executes
   *unprotected outside it*. A failure part-way then leaves the database wrecked
   — precisely what the transaction was there to prevent.

   **Inside a transaction, use a plain function and `.run()` on every
   statement**, which executes synchronously. `importBackup()` in
   `src/db/backup.ts` is the one place this matters, and it says so in a comment.

## Gotcha: the muscle map is not symmetric

`react-native-body-highlighter` exposes **23** slugs, and `gluteal`,
`hamstring`, `lower-back` and `upper-back` exist **only on the back view**;
`chest`, `abs`, `quadriceps`, `biceps` and `obliques` **only on the front**.
Defaulting to the front view would draw a deadlift as a blank figure, so
`preferredSide()` picks whichever view actually shows the muscles worked.

The slug tables are duplicated from the package's path data into
`domain/muscleMap.ts`, and `muscleMap.test.ts` asserts they still match the
installed version — a dependency bump that changes the taxonomy fails a test
instead of silently rendering blank bodies.

Note also that `abductors` is **not** a slug, despite appearing in some
documentation. Glute-medius work maps onto `gluteal`.

## Gotcha: rest timers must not count ticks

The countdown is always derived as `now - startedAt`, adjusted for paused spans.
The store's `now` ticks once a second **purely to trigger re-renders** and is
never the source of truth. A gym app spends most of its life backgrounded with
the screen off, where JS timers are throttled or frozen; a counter that
decrements on each tick drifts by minutes over a session.

`adjust()` changes the *duration*, not the start anchor, so elapsed time stays
honest and a large subtraction expires the timer rather than going negative.

## Exercise art

One drawing, not 1069. Every `target_muscles.svg` in `exercises_db/` turned out
to be the *same* front+back figure with different `fill` attributes, so
`scripts/build-exercise-db.ts` strips the fills to get one template with an
`@<pathIndex>@` placeholder per path, and stores per exercise only which of its
23 regions are shaded and how strongly (`RegionMap`). The renderer substitutes
theme colours in a single regex pass (`domain/muscleArt.ts`).

Keeping the region map verbatim, rather than deriving it from our own muscle
labels, is deliberate: the source art is finer-grained than the 15 labels the
pages use — an exercise labelled "Back" shades the lat *and* erector regions —
and no lossless mapping recovers that. Custom exercises have no region map and
fall back to projecting their muscle labels onto the same figure, which is
lossy and only they pay for.

The painted document is cached by *region signature* plus palette rather than by
exercise, because two exercises that work the same muscles produce the same 53 KB
string, and the props driving it are fresh arrays on every list render. A
`useMemo` inside the component cannot carry a result across rows; the cache in
`domain/muscleArt.ts` can.

The licence of this material is **not settled** — see
[ART_LICENSING.md](ART_LICENSING.md). That is a blocker for distribution, not a
todo.

### Gotcha: bundled non-image assets are unreadable in release builds

Learned from the retired Commons artwork, and the reason the muscle template is
a `.ts` file full of string literal rather than a bundled `.svg`.

The first implementation `require()`d the .svg files and read them with
expo-asset + expo-file-system. It worked perfectly in development and failed
completely in release, which is the worst possible failure shape.

Metro assets are compiled into Android *resources*, so in a release build
`Asset.fromModule(...)` yields a bare resource NAME —
`"assets_art_abrollout1"`, not a path. expo-asset sees a non-`android_res`
localUri, marks the asset `downloaded: true`, and never copies it; `new
File(uri).text()` then throws `IllegalArgumentException: URI is not absolute`.
In development Metro serves an http URL, so everything looked fine.

Embedding the markup in the JS bundle also makes the renderer synchronous,
removing a loading state and a failure path. It cost ~4.8 MB when it was 353
illustrations; the one shared template costs 53 KB. The videos are the case
where this does not apply — they are far too large to embed and are shipped as
real files instead (`plugins/withExerciseMedia.js`).

The same trap hits the "rest done" notification chime. The rest timer used to
`require()` the `.wav` and hand the *bundled* sound name to a notification
channel; in release the compiled resource is invisible to the platform's
sound lookup, so the alert bubbled up silently. The chime is now shipped as a
real `res/raw/rest-ding.wav` resource by `plugins/withNotificationSound.js`, and
the channel resolves it by basename. (A channel's sound is also cached by
Android — changing the sound on a channel requires a new channel id, so the
`rest-timer` channel was re-created as `rest-timer-sound-v2`.)

### Gotcha: react-native-svg cannot parse a compact transform

The Everkinetic files used `transform="matrix(.1 0 0-.1 0 960)"`. The SVG
grammar allows a minus sign to act as a number separator, and browsers render it
correctly, but react-native-svg's generated PEG parser requires a comma or
whitespace and throws. react-native-svg swallows the error, so the matrix is
simply dropped — costing the 0.1 scale and the Y-flip, which puts the artwork
ten times too large and upside down, i.e. off-canvas and apparently blank.

`src/domain/svgCompat.ts` inserts the missing whitespace in memory. **Nothing
shipped calls it now**: the muscle template's only transforms are
`translate(0,0)` and `translate(182,0)`, so `MuscleMap` skips a 53 KB scan that
would find nothing. What keeps the module alive is `muscleArt.test.ts` asserting
`needsSvgNormalisation(MUSCLE_ART_TEMPLATE) === false` — a regenerated template
that reintroduces the compact form fails a test rather than rendering blank, and
the fix is already written.

### Gotcha: "is this day in the future" is a DAY comparison

`calendarColumns` anchors each heatmap cell to 12:00 local so the date survives
DST shifts. Comparing that anchor against `Date.now()` marked TODAY as future
every morning before noon, so the current day never lit up. The comparison has
to be `startOfLocalDay(cell) > startOfLocalDay(now)`. This is why the grid
construction lives in `domain/streak.ts` with tests rather than inline in the
component — a screenshot does not reliably reveal a missing 12 px square.

## Two jest projects

`domain` runs pure TypeScript on plain node — no React Native transform, no
jsdom — so it starts in milliseconds. `app` uses the `jest-expo` preset for
anything touching RN or SQLite.

`src/db` is split between them: `backupFormat.ts` is deliberately free of any
database import precisely so its validation rules can be tested here rather than
only on a device. `client.ts` opens SQLite at module load, which would make
anything importing it untestable on node.

## Known rough edges

- **Set deletion is long-press, not swipe.** Hevy uses swipe-to-delete; a
  gesture-based implementation is a polish pass. Long-press with a confirm is
  robust and accessible in the meantime.
- **Exercise reordering is a menu, not drag-and-drop** ("Move up" / "Move
  down"), for the same reason.
- **Tab icons are emoji.** A licensed icon set is a later pass.
- **The muscle figure is small in dense lists** (54–64 px). The drawing is
  height-constrained, so cropping to a single figure would not make it any
  larger — a dedicated small glyph is the real fix.
