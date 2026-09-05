/**
 * Science-backed mapping of weekly training volume to the muscle heatmap.
 *
 * The hypertrophy literature consistently measures the training dose in
 * EFFECTIVE (hard, near-failure) SETS per muscle group per week, and shows a
 * dose–response that plateaus once the recommended zone is reached:
 *
 *  - Krieger (2010), J Strength Cond Res 24(4):1150. Meta-analysis: multiple
 *    sets (2–3 per exercise) produce roughly 40% more hypertrophy than single
 *    sets.
 *  - Schoenfeld, Contreras, Krieger et al. (2016), Med Sci Sports Exerc
 *    48(12):2470. RCT in trained men: 10 sets/week beat 5, which beat 3 for
 *    chest and arm growth.
 *  - Schoenfeld, Ogborn & Krieger (2017), J Strength Cond Res 31(9):2608.
 *    Meta-analysis of the dose–response: hypertrophy rises with weekly sets
 *    up to ~10 per muscle, then the curve flattens.
 *  - Common periodisation landmarks (e.g. Renaissance Periodization volume
 *    landmarks): 10–20 weekly work sets per muscle is the hypertrophy zone for
 *    most lifters; below ~5 is minimal; beyond ~20 returns diminish.
 *
 * TONNAGE (weight × reps) is deliberately NOT the driver. The growth response
 * is modelled on sets, and absolute tonnage is not comparable across lifters
 * or muscles (a 90 kg machine press is a different relative effort than a
 * 90 kg deadlift). The heatmap therefore shows your work sets per muscle for
 * the selected week against these fixed zones, so the same dose always lights
 * the same muscles at the same intensity.
 */

/** 1 = hottest, matching an intensity colour ramp indexed from `heatLevel - 1`. */
export interface WeeklySetsZone {
  /** 1 is hottest, 4 is coolest. 0 is "not lit" and never appears here. */
  readonly heatLevel: number;
  readonly label: string;
  /** Inclusive lower bound, in average weekly work sets. */
  readonly minWeeklySets: number;
  /** Exclusive upper bound; null = unbounded. */
  readonly maxWeeklySets: number | null;
}

/**
 * The four zones every heatmap intensity maps to. Ordered hottest-first so
 * `weeklySetsToHeatLevel` can scan from the top and legend renders top-first.
 */
export const WEEKLY_SETS_ZONES: readonly WeeklySetsZone[] = [
  { heatLevel: 1, label: 'Very high', minWeeklySets: 21, maxWeeklySets: null },
  { heatLevel: 2, label: 'Optimal', minWeeklySets: 10, maxWeeklySets: 21 },
  { heatLevel: 3, label: 'Moderate', minWeeklySets: 5, maxWeeklySets: 10 },
  { heatLevel: 4, label: 'Low', minWeeklySets: 1, maxWeeklySets: 5 },
];

/**
 * Weekly sets → heat level. `0` means the muscle is not lit at all; anything
 * above zero lit the muscle at some intensity, no matter how the rest of the
 * body is trained — this is what makes the heatmap absolute, not relative.
 */
export function weeklySetsToHeatLevel(weeklySets: number): number {
  if (Number.isNaN(weeklySets) || weeklySets <= 0) return 0;
  for (const z of WEEKLY_SETS_ZONES) {
    if (weeklySets >= z.minWeeklySets) {
      if (z.maxWeeklySets === null || weeklySets < z.maxWeeklySets) return z.heatLevel;
    }
  }
  const last = WEEKLY_SETS_ZONES[WEEKLY_SETS_ZONES.length - 1];
  return last?.heatLevel ?? 4;
}