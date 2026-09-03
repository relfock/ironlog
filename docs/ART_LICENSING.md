# Art and catalogue licensing — obligations and open questions

IronLog bundles third-party material. This file records what that obliges us to
do, and what is still unresolved. It is short on purpose: every rule here is one
someone could break by accident with a well-intentioned commit.

Background research: `../ART_LICENSING_RESEARCH.md`. That document is a record
of the search that produced the **retired** Wikimedia Commons artwork; read the
note at its top before treating any of it as current.

## What we ship

| Asset | Source | Licence | Obligation |
|---|---|---|---|
| 1069 exercise names, instruction steps and common-mistake notes | pages under `https://fitbod.me/exercises/…`, one per exercise | **not established** | see below |
| The muscle-worked figure (one template + a per-exercise region map) | derived from the `target_muscles.svg` served by the same pages | **not established** | see below |
| 1069 demonstration videos | the `video.mp4` served by the same pages | **not established** | see below |
| Muscle-map body paths, used by the volume heatmap and the custom-exercise editor | [`react-native-body-highlighter`](https://github.com/HichamELBSI/react-native-body-highlighter) © 2022 ELABBASSI Hicham | **MIT** | Reproduce the notice |

## 1. The catalogue's licence is UNRESOLVED — settle it before distributing

Every entry in `src/data/exercises/` carries the `url` it was taken from, and
all 1069 are pages on `fitbod.me`, a commercial product. **No licence grant has
been identified for that material**, and none is asserted anywhere in this
repository. That is a fact about our source, not an opinion about it.

Concretely, none of the following is established: that the prose may be
redistributed, that the figure may be redistributed, that the video may be
redistributed, or that any of it may be modified.

Two consequences follow, and neither is optional:

- **The app must not claim a licence it does not have.** `CreditsScreen.tsx`
  names the source and links to it and stops there. Do not add a licence line,
  an "openly licensed" claim or a CC badge to it.
- **This has to be resolved before the app is distributed to anyone.** Either
  obtain permission, or replace the catalogue. The previous Commons set is gone
  from the tree but `ART_LICENSING_RESEARCH.md` still records what the
  alternatives were and why most of the popular ones are worse.

## 2. Unlike the retired artwork, this material IS modified

The Everkinetic illustrations shipped byte-identical, and that was the whole
basis of their licensing position: unmodified work distributed alongside our
code is a *collection*, so share-alike never reached our source.

The muscle figure does **not** have that property. All 1069 source files are
the same drawing with different `fill` attributes, so
`scripts/build-exercise-db.ts` strips the fills, keeps one template with an
`@<pathIndex>@` placeholder per path (`src/data/muscleArt/template.ts`), and
stores only which regions each exercise shades
(`src/data/exercises/types.ts`, `RegionMap`). The renderer substitutes theme
colours (`src/domain/muscleArt.ts`).

That is a genuine modification and a 58 MB → 53 KB win, and it is the right
engineering call. It just means the "we only redistribute, we never adapt"
argument is not available here. Whatever permission we end up with has to cover
adaptation.

## 3. The credits screen is derived, not hand-written

`CreditsScreen.tsx` computes its source list from the catalogue's own `url`
fields, so it cannot drift from what actually shipped when the catalogue is
regenerated. Keep it that way; a hand-written list goes stale silently.

## 4. The EULA must not forbid extracting bundled assets we do not own

This rule outlived the CC BY-SA artwork it was written for. A blanket "all
content in this application is proprietary" clause is false about anything we
merely bundle, and under a share-alike or "no additional restrictions" licence
it would itself be a breach. Any terms-of-use text has to describe only what we
actually own.

## If iOS is ever added

CC 4.0's anti-TPM clause is a live question on iOS, where Apple's FairPlay
encryption may count as an "effective technological measure"; it is not an issue
for Android, where Play signing is not DRM in that sense. This matters only if
CC-licensed material comes back into the bundle — but if it does, get a legal
opinion before shipping it in an App Store binary.

## What we deliberately did not use

From the research: `free-exercise-db` / `wrkout/exercises.json` (images **and**
instruction prose traced to bodybuilding.com), the entire GymVisual-derived
ExerciseDB/animated-GIF lineage, MuscleWiki, wger's laundered image licences,
and every Kaggle/HuggingFace image set.

The relevant lesson survives the source change: an exercise dataset being
popular with indie apps, or shipping under a permissive *repository* licence,
says nothing about whether its authors had the right to grant it.
