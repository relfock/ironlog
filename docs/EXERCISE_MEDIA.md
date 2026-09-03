# Exercise demonstration clips

1069 silent H.264 clips, one per catalogue slug, shipped **inside the APK**. No
remote fetch, no on-demand download, no asset pack: the app is sideloaded, never
served through Play, so there is no store to satisfy and nothing to gain from
splitting the payload. Everything below is a consequence of that decision.

The source of truth is `exercises_db/<slug>/video.mp4` — 1080p60, ~1.3 Mbps,
mostly ~15 s. 1069 files, **3,696,266,253 bytes (3.44 GiB)**.

## The pipeline

```
exercises_db/<slug>/video.mp4          source corpus, untracked
        │  npm run media:stage         hard links, flattens + renames
        ▼
media/exercises/<slug>.mp4             staging tree, gitignored
        │  plugins/withExerciseMedia   assets.srcDir + noCompress
        ▼
APK: assets/exercises/<slug>.mp4       stored, uncompressed
        │
        ▼
file:///android_asset/exercises/<slug>.mp4     what ExerciseVideo plays
```

Three pieces:

- **`scripts/stage-media.ts`** (`npm run media:stage`) builds `media/exercises/`.
- **`plugins/withExerciseMedia.js`** appends two blocks to
  `android/app/build.gradle`.
- **`src/components/ExerciseVideo.tsx`** plays one clip by slug.

## Why not Metro

Metro compiles a bundled asset into an Android **resource**, and a resource has
no readable file path in a release build — `expo-asset` hands back a bare
resource name, reports the asset as already downloaded, and never produces a
file. It works in development, where Metro serves an `http://` URL, and fails
only in production. That is the same trap recorded under "bundled non-image
assets are unreadable in release builds" in `docs/ARCHITECTURE.md`, which is
where the retired artwork pipeline learned it the hard way.

Raw Android assets keep a real path. media3's `DefaultDataSource` dispatches on
`uri.getPath().startsWith("/android_asset/")` and hands the read to
`AssetDataSource`, so `file:///android_asset/exercises/<slug>.mp4` needs no
indirection at all. Metro would also have to walk and hash 1069 binary files on
every start, for nothing.

## Why hard links

The corpus is 3.44 GiB and the staging step exists only to flatten
`<slug>/video.mp4` into `<slug>.mp4`. `link(2)` writes a directory entry
pointing at the existing inode: staging 1069 clips takes **0.4 s and 80 KB of
new disk**. Copying would cost 3.44 GiB and minutes of IO, on every clone and
after every `git clean`.

Consequences worth knowing:

- **A staged file shares its inode with the source.** Anything that writes
  _through_ the staged path rewrites the pristine corpus. This is why
  `compress-media.ts` encodes to a temp file and `rename(2)`s over the staged
  name — replacing the directory entry, never the bytes behind it.
- `stage-media.ts` leaves any staged file that is _not_ a link to its source
  alone (that is what a compress run produces) and reports it as `kept`. Pass
  `--relink` to force it back to a link.
- It also prunes staged clips whose slug has left the catalogue, so the tree
  cannot drift.
- `du -sh media/exercises` reports 3.5 G. That is the _apparent_ size shared with
  `exercises_db/`, not additional consumption; `df` before and after a stage run
  differs only by the directory entries.

## Why `noCompress 'mp4'` is mandatory

`AssetDataSource` opens the entry with `AssetManager.open(path, ACCESS_RANDOM)`
and seeks by calling `InputStream.skip()`. On a DEFLATEd asset that means
re-inflating from byte zero for every seek — and a looping player seeks on every
wrap. H.264-in-MP4 is already compressed, so storing it uncompressed costs
essentially nothing and buys cheap random access.

The gradle the plugin emits, and why it is written exactly this way (checked
against **AGP 8.12.0**, the version this project resolves — `javap` on
`gradle-api-8.12.0.jar`):

```gradle
android {
    sourceSets {
        main {
            assets.srcDir '../../media'
        }
    }
    androidResources {
        noCompress 'mp4'
    }
}
```

- `androidResources { }` is the AGP 8.x block. `aaptOptions { }` is the AGP 7
  name for the same object and is gone.
- Both calls are the **additive method** forms. `AndroidResources` declares
  `getNoCompress()` and no setter, and `AndroidSourceDirectorySet` declares
  `srcDir(Object)`/`setSrcDirs(Iterable)` but no `getSrcDirs()`, so the
  `+= [...]` idiom leans on legacy implementation classes rather than the public
  DSL. `srcDir` and `noCompress` both append, verified in bytecode.
- `assets.srcDir` takes a path relative to the `:app` project dir, so
  `../../media` resolves to `<projectRoot>/media` and the generated file stays
  machine-independent.
- The plugin guards on a marker comment, so a re-run — or a duplicated entry in
  `app.json` — cannot append the block twice.

`android/` is `expo prebuild` output and is gitignored, which is the whole reason
this is a config plugin: an edit made in place would vanish on the next clone.
Same rationale as `plugins/withGradleMemory.js`.

**Staging is not run from the plugin.** A `withDangerousMod` that shelled out to
`stage-media.ts` would need `tsx` (a devDependency) and the 3.7 GiB corpus, and
neither is guaranteed on a build machine; a prebuild that dies inside a dangerous
mod is an opaque failure. Instead the plugin checks the tree and prints a loud
warning when it is empty, naming `npm run media:stage`. Run it once after a
fresh clone — it is idempotent, so running it again is free.

## The escape hatch: `npm run media:compress`

Opt-in, never part of a build. It re-encodes the **staged** clips to 720p30,
H.264 CRF 28, audio dropped, `+faststart`, two-second keyframes, parallel across
every core. 1080p60 is far more than a phone shows for a 15-second form loop.

Measured on a random 12-clip sample: **20.9 % of the original size**, so the full
corpus should land around **0.72 GiB** — a ~4.8x reduction, not the order of
magnitude one might hope for, because the source is already only ~1.3 Mbps.

It records what it produced in `media/.compress-state.json` and skips work on a
re-run; `npm run media:compress -- --force` re-encodes everything. It never edits
in place (see _Why hard links_), and `exercises_db/` is left byte-identical —
asserted by md5 during development.

Use it if the size ceiling below starts to bite.

## Size limits — read this before adding to the corpus

**An APK is a ZIP, and the supported ceiling is 4,294,967,295 bytes (2^32 − 1,
one byte under 4 GiB).** Beyond that a ZIP needs the ZIP64 extension, which
Android does not support. Verified against this project's own resolved
toolchain, not from memory:

| Component                                  | Behaviour past 4 GiB                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zipflinger` 8.12.0 (AGP's packager)       | Defaults to `Zip64.Policy.ALLOW`. Emits a ZIP64 footer once the central-directory offset exceeds 4294967295 or the entry count exceeds 65535. **Packaging silently succeeds** and hands on an APK that is no longer a valid Android package.                                                  |
| `apksig` 8.12.0 (signing, and `apksigner`) | `ApkUtilsLite.findZipSections` reads only the ZIP32 EOCD, where a ZIP64 archive stores `0xFFFFFFFF` as the CD offset. Throws `ZipFormatException: ZIP Central Directory start offset out of range`. **Signing fails.** (It also caps CD size at 2147483647 — unreachable with ~1100 entries.) |
| `apkzlib` 8.12.0                           | Unconditional. `ZFile` throws `IOException: File exceeds size limit of 4294967295.` on any input that large, and `Zip64NotSupportedException: Zip64 EOCD locator found but Zip64 format is not supported.` on ZIP64. Refuses outright.                                                        |
| Android Package Manager                    | `libziparchive` has no ZIP64 support, so a ZIP64 APK does not install.                                                                                                                                                                                                                        |
| `aapt2`                                    | **Not in the path.** Assets bypass aapt2 entirely in AGP 8.x — the linked `.ap_` for this project contains zero `assets/` entries; they are added by zipflinger at packaging time. So aapt2 is not a constraint here.                                                                         |

The failure mode to expect is therefore _signing_, not packaging, and the error
message will talk about ZIP offsets rather than size.

**Where we stand today:**

|                                                                  | bytes             |                      |
| ---------------------------------------------------------------- | ----------------- | -------------------- |
| Clips                                                            | 3,696,266,253     | 3.44 GiB             |
| Rest of the APK (measured `app-release.apk`, arm64-v8a + x86_64) | 92,131,113        | 87.9 MiB             |
| **Total**                                                        | **3,788,397,366** | **3.53 GiB**         |
| Ceiling                                                          | 4,294,967,295     | 4.00 GiB             |
| **Headroom**                                                     | **506,569,929**   | **483 MiB (11.8 %)** |

Stored-entry overhead — 1069 local file headers plus 4-byte alignment padding —
is under 200 KB and does not move this.

**There is no blocker at today's size, but the margin is 483 MiB and it only
shrinks.** In order of cheapness, the levers are:

1. Drop `x86_64` from `buildArchs` in `app.json`. It exists for the emulator;
   native libraries dominate the 87.9 MiB non-asset payload.
2. `npm run media:compress` — takes the clips to ~0.72 GiB and the problem
   disappears for good.
3. Only then consider splitting the corpus, which reintroduces everything this
   design exists to avoid.

**Build-time disk is the other cost.** AGP copies every asset into
`intermediates/assets/<variant>/` and again into
`intermediates/compressed_assets/<variant>/` (one `.jar` wrapper per asset) —
both directories exist and mirror each other today. That is roughly **7.4 GiB of
intermediates per variant**, so a debug and a release build together want ~15 GiB
on top of the 3.44 GiB staging tree.

## `ExerciseVideo`

```tsx
<ExerciseVideo slug={exercise.slug} width={320} fallback={<ExerciseArt … />} />
```

- **Muted, always.** The clips are silent; audio could only ever be an artefact,
  and a screen that starts making noise on open is hostile. Muted also lets the
  default `audioMixingMode` (`'auto'`) leave other apps' audio alone, so opening
  an exercise does not stop the user's music.
- **No native controls.** A scrubber, timecode and volume slider are noise on a
  silent 15-second loop. The one control worth having is stop-on-a-position, so
  the whole surface is a play/pause toggle instead.
- **Lifecycle.** `useVideoPlayer` owns the player and releases it on unmount, so
  there is nothing to release by hand. App backgrounding is already handled
  inside expo-video: its `VideoManager` pauses any playing view whose player has
  `staysActiveInBackground` false, which is the default. What expo-video does
  _not_ know about is navigation — a screen pushed onto a stack stays mounted —
  so the component subscribes to `focus`/`blur` and pauses on blur. It reads
  `NavigationContext` directly rather than calling `useIsFocused()`, so it still
  works outside a navigator (sheets, previews, tests) where that hook throws. A
  manual pause survives a blur/focus round trip.
- **No layout shift.** The box is sized from `width` and the fixed 16:9 source
  aspect before anything loads, and a themed panel covers it until
  `onFirstFrameRender`. Android's ExoPlayer shutter is off by default in
  expo-video, and it would paint black, which is wrong in light mode.
- **Missing file** surfaces as `status === 'error'` (`AssetDataSource` throws and
  the player never leaves that state), which renders `fallback` — the same
  branch a null slug takes.
