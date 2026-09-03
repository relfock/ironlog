/**
 * The anatomy of the muscle-worked artwork.
 *
 * Every one of the 1069 `target_muscles.svg` files in `exercises_db/` is the
 * SAME 54 KB drawing — a male figure shown front (x 0..182) and back
 * (x 182..364) side by side in a 364x379 viewBox. Stripping the `fill`
 * attributes makes all 1069 files byte-identical, so the only thing that varies
 * per exercise is which of the 81 paths are shaded. That is why the app ships
 * ONE template plus a per-exercise region map (see `RegionMap`) instead of
 * 58 MB of near-duplicate SVG.
 *
 * The source files use three muscle colours:
 *   #F2305A  primary   — the muscle the exercise targets
 *   #41BD98  secondary — assisting muscles
 *   #7F8097  inactive
 * plus two fixed body colours (#343542 silhouette, #b2b4e0 shorts) that never
 * change. `PATH_GROUPS` below partitions all 81 paths; the partition is exact
 * and every group is single-coloured in every one of the 1069 files, which
 * `scripts/build-exercise-db.ts` re-checks on every regeneration.
 *
 * Group membership was derived from the source data rather than guessed: for
 * each path, the set of exercises shading it primary is EXACTLY the set whose
 * `details.txt` names the corresponding muscle as primary.
 */

/** A shadeable region of the artwork. Front/back halves are separate paths. */
export type MuscleRegion =
  | 'abs'
  | 'obliques'
  | 'biceps'
  | 'delts_front'
  | 'lats_front'
  | 'traps_front'
  | 'chest'
  | 'forearms_front'
  | 'abductors_front'
  | 'adductors_front'
  | 'quads'
  | 'calves_front'
  | 'neck'
  | 'delts_back'
  | 'traps_back'
  | 'lats_back'
  | 'triceps'
  | 'forearms_back'
  | 'glutes'
  | 'hamstrings'
  | 'abductors_back'
  | 'calves_back'
  | 'lower_back';

/** Paths that are never shaded: the silhouette and the shorts. */
export const STATIC_PATHS = {
  /** Body outline, `#343542` in the source. Front figure, then back figure. */
  silhouette: [0, 42],
  /** Shorts, `#b2b4e0` in the source. */
  shorts: [1],
} as const;

/**
 * Path indices (in document order) belonging to each region.
 *
 * Indices 59 and 60 sit in the back figure and are `#7F8097` in all 1069 files
 * — an unlabelled region the source never targets — so they are grouped as
 * inactive rather than invented into a muscle.
 */
export const PATH_GROUPS: Readonly<Record<MuscleRegion, readonly number[]>> = {
  // --- front figure -------------------------------------------------------
  abs: [2, 3, 4, 5],
  obliques: [6, 7, 8, 9, 10, 11],
  biceps: [12, 13],
  delts_front: [14, 15],
  lats_front: [16, 17],
  traps_front: [18, 19],
  chest: [20, 21],
  forearms_front: [22, 23, 24, 25],
  abductors_front: [26, 27],
  adductors_front: [28, 29],
  quads: [30, 31, 32, 33, 34, 35],
  calves_front: [36, 37, 38, 39],
  neck: [40, 41],
  // --- back figure --------------------------------------------------------
  delts_back: [43, 44],
  traps_back: [45, 46],
  lats_back: [47, 48, 49, 50],
  triceps: [51, 52, 53, 54],
  forearms_back: [55, 56, 57, 58],
  glutes: [61, 62],
  hamstrings: [63, 64, 65, 66, 67, 68, 69, 70],
  abductors_back: [71, 72],
  calves_back: [73, 74, 75, 76, 77, 78],
  lower_back: [79, 80],
};

/** Paths in the artwork that no region owns and no exercise ever shades. */
export const INACTIVE_PATHS: readonly number[] = [59, 60];

/** Total paths in the template. Asserted by the generator. */
export const PATH_COUNT = 81;

/** Regions drawn on the front figure; the rest are on the back figure. */
export const FRONT_REGIONS: readonly MuscleRegion[] = [
  'abs', 'obliques', 'biceps', 'delts_front', 'lats_front', 'traps_front',
  'chest', 'forearms_front', 'abductors_front', 'adductors_front', 'quads',
  'calves_front', 'neck',
];

/**
 * Our `Muscle` taxonomy projected onto the artwork.
 *
 * Used for CUSTOM exercises, which carry muscle labels but no region map. Seed
 * exercises use their stored `regions` instead, because it is strictly more
 * faithful to the source art (see `RegionMap`).
 *
 * `shins`, `full_body` and `cardio` have no counterpart in this drawing and map
 * to nothing rather than to a plausible-but-wrong region.
 */
export const MUSCLE_TO_REGIONS: Readonly<
  Record<string, readonly MuscleRegion[]>
> = {
  chest: ['chest'],
  lats: ['lats_front', 'lats_back'],
  upper_back: ['lats_back'],
  lower_back: ['lower_back'],
  traps: ['traps_front', 'traps_back'],
  front_delts: ['delts_front'],
  side_delts: ['delts_front', 'delts_back'],
  rear_delts: ['delts_back'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms_front', 'forearms_back'],
  abs: ['abs'],
  obliques: ['obliques'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  calves: ['calves_front', 'calves_back'],
  adductors: ['adductors_front'],
  abductors: ['abductors_front', 'abductors_back'],
  neck: ['neck'],
  shins: [],
  full_body: [],
  cardio: [],
};

/**
 * The 15 muscle labels used by `details.txt`, mapped to ONE muscle in our
 * taxonomy each.
 *
 * Deliberately one-to-one. Mapping "Shoulders" onto all three deltoid heads
 * would triple-count shoulder work in the volume heatmap against a single count
 * for chest work, so each source label picks a single representative and the
 * finer distinctions stay available for custom exercises only.
 */
export const SOURCE_LABEL_TO_MUSCLE: Readonly<Record<string, string>> = {
  Abs: 'abs',
  Abductors: 'abductors',
  Adductors: 'adductors',
  Back: 'lats',
  Biceps: 'biceps',
  Calves: 'calves',
  Chest: 'chest',
  Forearms: 'forearms',
  Glutes: 'glutes',
  Hamstrings: 'hamstrings',
  'Lower Back': 'lower_back',
  Quadriceps: 'quads',
  Shoulders: 'side_delts',
  Trapezius: 'traps',
  Triceps: 'triceps',
};

/**
 * Which region each source label shades, for the generator's cross-check.
 * Mirrors `PATH_GROUPS` and is asserted against the real files.
 */
export const SOURCE_LABEL_TO_REGIONS: Readonly<
  Record<string, readonly MuscleRegion[]>
> = {
  Abs: ['abs'],
  Abductors: ['abductors_front', 'abductors_back'],
  Adductors: ['adductors_front'],
  Back: ['lats_front', 'lats_back', 'lower_back'],
  Biceps: ['biceps'],
  Calves: ['calves_front', 'calves_back'],
  Chest: ['chest'],
  Forearms: ['forearms_front', 'forearms_back'],
  Glutes: ['glutes'],
  Hamstrings: ['hamstrings'],
  'Lower Back': ['lower_back'],
  Quadriceps: ['quads'],
  Shoulders: ['delts_front', 'delts_back'],
  Trapezius: ['traps_front', 'traps_back'],
  Triceps: ['triceps'],
};
