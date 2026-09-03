/**
 * Shape of one entry in the bundled exercise catalogue.
 *
 * Generated from `exercises_db/` by `scripts/build-exercise-db.ts`. Each source
 * directory holds three files — `details.txt` (prose + muscle labels),
 * `target_muscles.svg` (the muscle-worked art) and `video.mp4` (the
 * demonstration) — and the generator turns the first two into the data below.
 * The video is NOT bundled through Metro; see plugins/withExerciseMedia.js.
 */
import type { Equipment, Muscle, TrackingType } from '@/domain/types';
import type { MuscleRegion } from '@/data/muscleArt/regions';

/** 1 = primary (worked), 2 = secondary (assisting). Absent = not worked. */
export type RegionLevel = 1 | 2;

/**
 * Which anatomical regions of the muscle art light up, and how strongly.
 *
 * This is stored alongside `primary`/`secondary` rather than derived from them
 * because the source artwork is finer-grained than the muscle labels: an
 * exercise labelled "Back" shades both the lat region and the erector region,
 * and no lossless mapping from the 15 source labels recovers that. Keeping the
 * region map verbatim means the app reproduces the source art exactly — a
 * property `scripts/build-exercise-db.ts` asserts byte-for-byte.
 */
export type RegionMap = Readonly<Partial<Record<MuscleRegion, RegionLevel>>>;

export interface Mistake {
  readonly title: string;
  readonly body: string;
}

export interface DbExercise {
  /** Stable identifier, and the directory name under `exercises_db/`. */
  readonly slug: string;
  readonly name: string;
  /** Source page the prose was taken from, shown as attribution. */
  readonly url: string;
  readonly trackingType: TrackingType;
  readonly equipment: Equipment;
  /** Our own taxonomy, for filters, statistics and the heatmap. */
  readonly primary: readonly Muscle[];
  readonly secondary: readonly Muscle[];
  /** Drives the muscle-worked art. See `RegionMap`. */
  readonly regions: RegionMap;
  /** Numbered how-to steps, in order. */
  readonly instructions: readonly string[];
  /** Common form mistakes; empty when the source page listed none. */
  readonly mistakes: readonly Mistake[];
}
