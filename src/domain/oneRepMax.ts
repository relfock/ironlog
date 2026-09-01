/**
 * Estimated one-rep max.
 *
 * Both formulas degrade badly at high rep counts, so estimates above
 * `MAX_RELIABLE_REPS` are reported but flagged, and Brzycki is clamped because
 * its denominator hits zero at 37 reps and goes negative beyond that.
 */
import { stripFloatNoise } from './units';

export type OneRepMaxFormula = 'epley' | 'brzycki';

/** Beyond this, an estimate is extrapolation rather than measurement. */
export const MAX_RELIABLE_REPS = 12;

/** Brzycki's denominator is 37 − reps, so 37 reps is a divide-by-zero. */
const BRZYCKI_REP_CEILING = 36;

/**
 * @param weightKg load lifted
 * @param reps completed reps at that load
 * @returns estimated 1RM in kg, or null when the inputs cannot support one
 */
export function estimateOneRepMax(
  weightKg: number,
  reps: number,
  formula: OneRepMaxFormula = 'epley',
): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps <= 0) return null;

  // A single rep IS the one-rep max; no formula should inflate it.
  if (reps === 1) return stripFloatNoise(weightKg);

  if (formula === 'epley') {
    return stripFloatNoise(weightKg * (1 + reps / 30));
  }

  const r = Math.min(reps, BRZYCKI_REP_CEILING);
  return stripFloatNoise(weightKg * (36 / (37 - r)));
}

/** True when the rep count is high enough that the estimate is unreliable. */
export function isExtrapolated(reps: number): boolean {
  return reps > MAX_RELIABLE_REPS;
}

/**
 * Inverse: what load should be usable for `reps`, given a 1RM?
 * Used by the warm-up calculator and by rep-target suggestions.
 */
export function weightForReps(
  oneRepMaxKg: number,
  reps: number,
  formula: OneRepMaxFormula = 'epley',
): number | null {
  if (!Number.isFinite(oneRepMaxKg) || oneRepMaxKg <= 0) return null;
  if (!Number.isFinite(reps) || reps <= 0) return null;
  if (reps === 1) return stripFloatNoise(oneRepMaxKg);

  if (formula === 'epley') {
    return stripFloatNoise(oneRepMaxKg / (1 + reps / 30));
  }
  const r = Math.min(reps, BRZYCKI_REP_CEILING);
  return stripFloatNoise((oneRepMaxKg * (37 - r)) / 36);
}
