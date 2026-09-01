/**
 * Volume and set-count aggregation.
 *
 * "Volume" here means tonnage: load × reps, summed. Bodyweight movements are
 * only meaningful if the user's bodyweight is known, so it is an explicit
 * parameter rather than a hidden default — a push-up session should not silently
 * report zero volume, nor invent a 70 kg lifter.
 */
import type { LoggedSet, Muscle, TrackingType } from './types';
import { setTypeCountsForStats } from './types';
import { stripFloatNoise } from './units';

export interface VolumeContext {
  readonly trackingType: TrackingType;
  /** Required for bodyweight-derived tracking types; null if unknown. */
  readonly bodyweightKg: number | null;
  readonly countWarmups: boolean;
}

/**
 * Effective load moved by one rep of this set, in kg.
 * Returns null when the load genuinely cannot be determined.
 */
export function effectiveLoadKg(
  set: LoggedSet,
  trackingType: TrackingType,
  bodyweightKg: number | null,
): number | null {
  switch (trackingType) {
    case 'weight_reps':
      return set.weightKg;
    case 'bodyweight_reps':
      return bodyweightKg;
    case 'weighted_bodyweight':
      if (bodyweightKg === null) return null;
      return stripFloatNoise(bodyweightKg + (set.weightKg ?? 0));
    case 'assisted_bodyweight':
      if (bodyweightKg === null) return null;
      // weightKg holds the ASSISTANCE, which reduces the load.
      return stripFloatNoise(Math.max(0, bodyweightKg - (set.weightKg ?? 0)));
    case 'duration':
    case 'distance_duration':
      // Time and distance work carries no tonnage.
      return null;
  }
}

/** Tonnage for a single set, or 0 when it does not contribute. */
export function setVolumeKg(set: LoggedSet, ctx: VolumeContext): number {
  if (!set.completed) return 0;
  if (!setTypeCountsForStats(set.setType, ctx.countWarmups)) return 0;

  const load = effectiveLoadKg(set, ctx.trackingType, ctx.bodyweightKg);
  if (load === null || set.reps === null) return 0;
  return stripFloatNoise(load * set.reps);
}

export function totalVolumeKg(
  sets: readonly LoggedSet[],
  ctx: VolumeContext,
): number {
  return stripFloatNoise(
    sets.reduce((sum, s) => sum + setVolumeKg(s, ctx), 0),
  );
}

/** Completed sets that count toward stats. */
export function countedSets(
  sets: readonly LoggedSet[],
  countWarmups: boolean,
): LoggedSet[] {
  return sets.filter(
    (s) => s.completed && setTypeCountsForStats(s.setType, countWarmups),
  );
}

export function totalReps(sets: readonly LoggedSet[], countWarmups: boolean): number {
  return countedSets(sets, countWarmups).reduce((sum, s) => sum + (s.reps ?? 0), 0);
}

/**
 * Sets-per-muscle-group. A set is credited in full to each primary muscle and
 * at half weight to each secondary — the convention most hypertrophy literature
 * uses, and what makes "sets per muscle per week" comparable across exercises.
 */
export const SECONDARY_SET_CREDIT = 0.5;

export interface MuscleSetCredit {
  readonly primary: readonly Muscle[];
  readonly secondary: readonly Muscle[];
  readonly completedSets: number;
}

export function accumulateMuscleSets(
  entries: readonly MuscleSetCredit[],
): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  const add = (m: Muscle, n: number) => {
    out.set(m, stripFloatNoise((out.get(m) ?? 0) + n));
  };
  for (const e of entries) {
    for (const m of e.primary) add(m, e.completedSets);
    for (const m of e.secondary) add(m, e.completedSets * SECONDARY_SET_CREDIT);
  }
  return out;
}

/**
 * Muscle distribution as fractions of total credited sets, for the pie/donut
 * chart. Returns an empty map when nothing has been logged, so callers can show
 * an empty state rather than dividing by zero.
 */
export function muscleDistribution(
  setsPerMuscle: ReadonlyMap<Muscle, number>,
): Map<Muscle, number> {
  let total = 0;
  for (const v of setsPerMuscle.values()) total += v;
  const out = new Map<Muscle, number>();
  if (total <= 0) return out;
  for (const [m, v] of setsPerMuscle) out.set(m, stripFloatNoise(v / total));
  return out;
}
