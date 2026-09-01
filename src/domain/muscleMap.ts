/**
 * Bridge from our muscle taxonomy to what `react-native-body-highlighter` can
 * actually draw.
 *
 * The library exposes 23 slugs, and they are NOT symmetric: `gluteal`,
 * `hamstring`, `lower-back` and `upper-back` exist only on the BACK view, while
 * `chest`, `abs`, `quadriceps`, `biceps` and `obliques` exist only on the FRONT.
 * So highlighting a row or a deadlift on the front view silently renders
 * nothing — `preferredSide()` exists to stop that happening.
 *
 * The slug and side tables below are duplicated from the package's own path
 * data. `muscleMap.test.ts` asserts they still match the installed version, so
 * an upgrade that changes the taxonomy fails a test rather than quietly
 * dropping highlights.
 */
import type { Muscle } from './types';

/** The 23 slugs `react-native-body-highlighter@3.x` can address. */
export type BodySlug =
  | 'abs'
  | 'adductors'
  | 'ankles'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'deltoids'
  | 'feet'
  | 'forearm'
  | 'gluteal'
  | 'hair'
  | 'hamstring'
  | 'hands'
  | 'head'
  | 'knees'
  | 'lower-back'
  | 'neck'
  | 'obliques'
  | 'quadriceps'
  | 'tibialis'
  | 'trapezius'
  | 'triceps'
  | 'upper-back';

export type BodySide = 'front' | 'back';

export const FRONT_SLUGS: readonly BodySlug[] = [
  'abs', 'adductors', 'ankles', 'biceps', 'calves', 'chest', 'deltoids', 'feet',
  'forearm', 'hair', 'hands', 'head', 'knees', 'neck', 'obliques', 'quadriceps',
  'tibialis', 'trapezius', 'triceps',
];

export const BACK_SLUGS: readonly BodySlug[] = [
  'adductors', 'ankles', 'calves', 'deltoids', 'feet', 'forearm', 'gluteal',
  'hair', 'hamstring', 'hands', 'head', 'lower-back', 'neck', 'trapezius',
  'triceps', 'upper-back',
];

/**
 * Our taxonomy is finer than the artwork. Where the library cannot distinguish
 * (all three deltoid heads share one `deltoids` path; lats have no path of
 * their own and fold into `upper-back`) the mapping is intentionally lossy and
 * the loss is recorded in `COLLAPSED_MUSCLES` so the UI can caption it.
 *
 * `abductors` is NOT a slug in this library despite appearing in some docs, so
 * glute medius work maps onto `gluteal`.
 */
const MUSCLE_TO_SLUG: Record<Muscle, BodySlug | null> = {
  chest: 'chest',
  lats: 'upper-back',
  upper_back: 'upper-back',
  lower_back: 'lower-back',
  traps: 'trapezius',
  front_delts: 'deltoids',
  side_delts: 'deltoids',
  rear_delts: 'deltoids',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearm',
  abs: 'abs',
  obliques: 'obliques',
  quads: 'quadriceps',
  hamstrings: 'hamstring',
  glutes: 'gluteal',
  calves: 'calves',
  adductors: 'adductors',
  abductors: 'gluteal',
  neck: 'neck',
  shins: 'tibialis',
  full_body: null,
  cardio: null,
};

/** Muscles that share a slug with another muscle, i.e. cannot be shown apart. */
export const COLLAPSED_MUSCLES: readonly Muscle[] = [
  'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts',
  'glutes', 'abductors',
];

export function muscleToSlug(muscle: Muscle): BodySlug | null {
  return MUSCLE_TO_SLUG[muscle];
}

export function slugExistsOn(slug: BodySlug, side: BodySide): boolean {
  return side === 'front' ? FRONT_SLUGS.includes(slug) : BACK_SLUGS.includes(slug);
}

/** Anatomical labels for our own taxonomy, for chart legends and filters. */
export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  lower_back: 'Lower back',
  traps: 'Traps',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Adductors',
  abductors: 'Abductors',
  neck: 'Neck',
  shins: 'Shins',
  full_body: 'Full body',
  cardio: 'Cardio',
};

export interface HighlightedPart {
  readonly slug: BodySlug;
  /** 1 = primary, 2 = secondary. Indexes into the `colors` array. */
  readonly intensity: number;
}

/**
 * Build the `data` prop for `<Body />` from an exercise's muscles.
 * Primary muscles win when a muscle appears in both lists (a slug collision
 * between, say, `lats` primary and `upper_back` secondary must not demote it).
 */
export function buildHighlight(
  primary: readonly Muscle[],
  secondary: readonly Muscle[] = [],
): HighlightedPart[] {
  const intensityBySlug = new Map<BodySlug, number>();

  for (const m of secondary) {
    const slug = muscleToSlug(m);
    if (slug) intensityBySlug.set(slug, 2);
  }
  for (const m of primary) {
    const slug = muscleToSlug(m);
    if (slug) intensityBySlug.set(slug, 1); // primary overrides secondary
  }

  return [...intensityBySlug].map(([slug, intensity]) => ({ slug, intensity }));
}

/**
 * Which view shows more of the highlighted muscle. Without this, back-dominant
 * exercises (rows, deadlifts, curls of the hamstring) highlight nothing on the
 * default front view.
 *
 * Primary muscles are weighted above secondary; front wins ties because it is
 * the more recognisable view.
 */
export function preferredSide(parts: readonly HighlightedPart[]): BodySide {
  let front = 0;
  let back = 0;
  for (const p of parts) {
    const weight = p.intensity === 1 ? 2 : 1;
    if (slugExistsOn(p.slug, 'front')) front += weight;
    if (slugExistsOn(p.slug, 'back')) back += weight;
  }
  return back > front ? 'back' : 'front';
}

/** Parts that will actually render on `side` — the rest are silently dropped. */
export function partsVisibleOn(
  parts: readonly HighlightedPart[],
  side: BodySide,
): HighlightedPart[] {
  return parts.filter((p) => slugExistsOn(p.slug, side));
}

/**
 * For the muscle heatmap: turn per-muscle set counts into highlight intensities
 * bucketed into `bucketCount` levels, where bucket 1 is the hottest.
 */
export function buildHeatmap(
  setsPerMuscle: ReadonlyMap<Muscle, number>,
  bucketCount = 4,
): HighlightedPart[] {
  const bySlug = new Map<BodySlug, number>();
  for (const [muscle, sets] of setsPerMuscle) {
    const slug = muscleToSlug(muscle);
    if (!slug || sets <= 0) continue;
    bySlug.set(slug, (bySlug.get(slug) ?? 0) + sets);
  }
  if (bySlug.size === 0) return [];

  const max = Math.max(...bySlug.values());
  if (max <= 0) return [];

  return [...bySlug].map(([slug, sets]) => {
    // ratio 1.0 -> bucket 1 (hottest); ratio near 0 -> bucket `bucketCount`.
    const ratio = sets / max;
    const bucket = Math.min(
      bucketCount,
      Math.max(1, bucketCount + 1 - Math.ceil(ratio * bucketCount)),
    );
    return { slug, intensity: bucket };
  });
}
