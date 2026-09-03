# IronLog

An Android workout tracker: log sessions, build routines, browse a
1069-exercise library, and track progress with charts and personal records.

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
  domain/       Pure TypeScript rules. No React, no DB. Heavily unit-tested.
  db/           Drizzle schema, migrations, repositories, backup
  stores/       MobX: active workout, settings, timers
  hooks/        Live queries and derived data
  screens/      One folder per feature area
  components/   Shared UI, muscle map, body map, exercise video, charts
  data/         Generated exercise catalogue and muscle-art template
scripts/        Catalogue and muscle-template generators
exercises_db/   Source corpus (1069 dirs), NOT bundled — see plugins/
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

Every exercise has a combined front+back **"muscles worked" figure** and a
**demonstration video**.

All 1069 source figures turned out to be the *same* drawing with different
`fill` attributes, so the app ships **one** 53 KB template with an
`@<pathIndex>@` placeholder per path (`src/data/muscleArt/template.ts`) plus a
per-exercise map of which of its 23 regions to shade
(`RegionMap` in `src/data/exercises/types.ts`). Theme colours are substituted at
render time by `src/domain/muscleArt.ts`. That is 58 MB of near-duplicate SVG
reduced to 53 KB, and it reproduces the source shading exactly — a property the
generator asserts.

Custom exercises have no region map, so they fall back to projecting their
muscle labels onto the same figure. `react-native-body-highlighter` (**MIT**) is
still used, but only for the volume heatmap and the custom-exercise editor.

**The catalogue's licence is not established.** The prose, figures and videos
are derived from `fitbod.me` pages, one per exercise, recorded in each entry's
`url`. No grant has been identified and none is claimed. Read
[`docs/ART_LICENSING.md`](docs/ART_LICENSING.md) before writing any terms of use
or adding a licence line to the Credits screen — and settle this before
distributing the app.

## Setup

Requires JDK 21, Node 20+, and the Android SDK (platform 36, build-tools 36).

```bash
npm install
npm run prebuild          # generates android/
npm run android           # build + install on a connected device
```

## Verification

```bash
npm run verify            # typecheck + lint + unit tests
cd android && ./gradlew assembleRelease
```

Verified on an Android 36 emulator: migrations, seeding the exercise catalogue,
the exercise library and its artwork, logging a set (volume, rest timer, live PR
banner), **force-stop mid-workout followed by correct resume**, finishing, and
history.

The domain layer is pure functions with known-good fixtures: 1RM values against
published Epley/Brzycki tables, plate solves against hand-computed loads, PR
detection over a scripted set sequence, rest-timer behaviour across simulated
backgrounding, and streak logic across DST boundaries.

Three test suites exist to catch specific classes of mistake:

- `src/domain/muscleMap.test.ts` asserts the slug tables still match the
  installed `react-native-body-highlighter`, so a dependency bump that changes
  the taxonomy fails a test instead of silently rendering blank bodies.
- `src/domain/muscleArt.test.ts` asserts the 81 template paths partition exactly
  into regions, silhouette and shorts. An unclaimed path renders with an empty
  fill — a hole in the figure — so a regenerated template that drifts fails a
  test instead of shipping.
- `src/domain/svgCompat.test.ts` runs react-native-svg's *own* transform parser
  to prove the compact `matrix(.1 0 0-.1 …)` form fails it and that the
  normalised output parses. Nothing shipped needs the fix today; the test is
  what makes it noticed if a regenerated template reintroduces the form.

## Not built

Deliberately out of scope, none requiring rework to add: cloud sync and
accounts, the whole social layer, progress photos, home-screen widget, Wear OS,
web app, AI coach, monthly report / year-in-review, and any paid tier — every
feature is unlocked.
