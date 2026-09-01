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
exercises are archived rather than removed, because logged sets reference them.

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

See [ART_LICENSING.md](ART_LICENSING.md) — the rules there are licence
obligations, not preferences. The short version: the artwork ships
byte-identical, colour is applied at render time, and no build step may touch
`assets/art/`.

### Gotcha: bundled non-image assets are unreadable in release builds

The first implementation `require()`d the .svg files and read them with
expo-asset + expo-file-system. It worked perfectly in development and failed
completely in release, which is the worst possible failure shape.

Metro assets are compiled into Android *resources*, so in a release build
`Asset.fromModule(...)` yields a bare resource NAME —
`"assets_art_abrollout1"`, not a path. expo-asset sees a non-`android_res`
localUri, marks the asset `downloaded: true`, and never copies it; `new
File(uri).text()` then throws `IllegalArgumentException: URI is not absolute`.
In development Metro serves an http URL, so everything looked fine.

The markup is therefore embedded as JS string literals
(`scripts/build-art-registry.ts` → `src/data/art/`). It costs ~4.8 MB of bundle,
which for an app whose point is these illustrations is the right trade. It also
made `ExerciseArt` synchronous, removing a loading state and a failure path.

### Gotcha: react-native-svg cannot parse the artwork's transform

Every file uses `transform="matrix(.1 0 0-.1 0 960)"`. The SVG grammar allows a
minus sign to act as a number separator, and browsers render it correctly, but
react-native-svg's generated PEG parser requires a comma or whitespace and
throws. react-native-svg swallows the error, so the matrix is simply dropped —
costing the 0.1 scale and the Y-flip, which puts the artwork ten times too large
and upside down, i.e. off-canvas and apparently blank.

`src/domain/svgCompat.ts` inserts the missing whitespace in memory. Its test
runs react-native-svg's own parser to prove the input fails and the output
parses, and asserts that all 353 bundled files need the fix.

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
- **The body-map fallback is small in dense lists** (46 px). Legible but not
  ideal; a dedicated small glyph would be better.
