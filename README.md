# IronLog

An Android workout tracker: log sessions, build routines, browse a 230-exercise
library, and track progress with charts and personal records.

Functionally a clone of [Hevy](https://www.hevyapp.com/), built on the same
stack, with the **social half deliberately left out** — no feed, followers,
likes, comments, leaderboards, routine sharing or coach chat.

Everything lives on the device. There is no account and nothing is uploaded.

## Stack

Matches Hevy's own ([their write-up](https://www.hevyapp.com/how-we-built-hevy/)):

| | |
|---|---|
| Framework | React Native 0.86 via **Expo SDK 57** (prebuild + custom dev client) |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` |
| State | **MobX 7** for session state; **Drizzle `useLiveQuery`** for persisted reads |
| Navigation | **React Navigation 7** (native stack + bottom tabs) |
| Charts | **Victory Native XL 42** (Skia + Reanimated) |
| Database | **expo-sqlite** + **Drizzle ORM**, WAL mode |

One deliberate deviation: Hevy predates it, but **Realm is dead** (deprecated
Sept 2024, EOL 30 Sept 2025), so local persistence is SQLite + Drizzle.

## Architecture

```
src/
  domain/       Pure TypeScript rules. No React, no DB. 195 unit tests.
  db/           Drizzle schema, migrations, repositories, backup
  stores/       MobX: active workout, settings, timers
  hooks/        Live queries and derived data
  screens/      One folder per feature area
  components/   Shared UI, body map, exercise art, charts
scripts/        Commons art harvest, asset registry, bundle verification
assets/art/     353 exercise SVGs (unmodified) + manifest.json
```

Three ideas carry most of the design:

**1. Weights are kilograms. Everywhere.** Distances are metres, durations
seconds, timestamps epoch-ms. Conversion happens in exactly one place
(`domain/units.ts`) at the UI boundary. Mixing units in storage is how workout
apps silently corrupt years of history.

**2. The logger writes through to SQLite.** Completing, adding or deleting a set
writes immediately; typing in a field is debounced ~400 ms. A force-stop
mid-session is recovered on next launch by `findInProgressWorkout()`. Phones get
killed in cold gyms — losing a session the user already performed is the worst
failure this app can have.

**3. The schema is sync-ready but there is no server.** Every table carries a
UUIDv7 primary key, `updated_at`, a `deleted` tombstone and a `dirty` flag, plus
a `sync_outbox` that is written and never read. Retrofitting a change log onto an
app holding years of history means a lossy backfill; one INSERT per mutation now
avoids that. Backup is JSON export/import.

**4. Rest timers are wall-clock anchored.** The countdown is always
`now - startedAt`, never an accumulated tick, so it stays correct through the
OS freezing JS timers while the phone is in a pocket.

## Exercise art

230 exercises. **179 have real illustrations**; the other 51 fall back to a
highlighted muscle map, so nothing renders blank.

- **353 SVGs** by Everkinetic, harvested from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Weight_training_diagrams), **CC BY-SA 3.0**
- **Muscle map** from `react-native-body-highlighter`, **MIT**

The illustrations ship **byte-identical** to what Commons served, embedded as
string literals in `src/data/art/` and asserted equal to their source files by
test. They contain no `fill` attribute at all, so the app tints them at render
time for light/dark mode without ever editing one — which keeps them a
*collection* rather than Adapted Material under CC BY-SA, and keeps share-alike
away from the app's own code.

**Read [`docs/ART_LICENSING.md`](docs/ART_LICENSING.md) before touching
`assets/art/` or writing any terms of use.** It records four rules that are easy
to break by accident, including one that would put us in breach of the licence.

Coverage is generated: [`docs/art-coverage.md`](docs/art-coverage.md).

## Setup

Requires JDK 21, Node 20+, and the Android SDK (platform 36, build-tools 36).

```bash
npm install
npm run prebuild          # generates android/
npm run android           # build + install on a connected device
```

## Verification

```bash
npm run verify            # typecheck + lint + 252 unit tests
npm run verify:bundle     # proves all 353 SVGs ship unmodified, and are in the APK
cd android && ./gradlew assembleRelease
```

Verified on an Android 36 emulator: migrations, seeding 230 exercises, the
exercise library and its artwork, logging a set (volume, rest timer, live PR
banner), **force-stop mid-workout followed by correct resume**, finishing, and
history.

The domain layer is pure functions with known-good fixtures: 1RM values against
published Epley/Brzycki tables, plate solves against hand-computed loads, PR
detection over a scripted set sequence, rest-timer behaviour across simulated
backgrounding, and streak logic across DST boundaries.

Two test suites exist to catch specific classes of mistake:

- `src/domain/muscleMap.test.ts` asserts the slug tables still match the
  installed `react-native-body-highlighter`, so a dependency bump that changes
  the taxonomy fails a test instead of silently rendering blank bodies.
- `scripts/art.test.ts` re-hashes every bundled SVG against `manifest.json`,
  asserts each embedded string is byte-identical to its file, and asserts none
  contains a `fill`, `style`, `<style>`, `base64` or `<image>` — the licensing
  invariant.
- `src/domain/svgCompat.test.ts` runs react-native-svg's *own* transform parser
  to prove the artwork's compact `matrix(.1 0 0-.1 …)` fails it and that the
  normalised output parses. Without that fix every illustration renders blank in
  a release build.

## Not built

Deliberately out of scope, none requiring rework to add: cloud sync and
accounts, the whole social layer, progress photos, home-screen widget, Wear OS,
web app, AI coach, monthly report / year-in-review, and any paid tier — every
feature is unlocked.
