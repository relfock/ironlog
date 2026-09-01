/**
 * Warm-up set generator — Hevy's "Warm Up Calculator", with the plate/dumbbell
 * rounding it exposes as a preference.
 */
import type { SetType, TargetSet, WeightUnit } from './types';
import { fromKg, roundToStep, stripFloatNoise, toKg } from './units';
import { defaultPlateSetup, smallestIncrement, type PlateSetup } from './plateCalculator';

export interface WarmupStep {
  /** Fraction of the working weight, 0–1. */
  readonly percent: number;
  readonly reps: number;
}

/** A conventional ramp: high reps light, dropping to a single primer rep. */
export const DEFAULT_WARMUP_SCHEME: readonly WarmupStep[] = [
  { percent: 0.4, reps: 8 },
  { percent: 0.55, reps: 5 },
  { percent: 0.7, reps: 3 },
  { percent: 0.85, reps: 1 },
];

export type RoundingMode =
  /** Round to what the bar can actually hold (2 × smallest plate). */
  | { kind: 'barbell'; setup?: PlateSetup }
  /** Round to a fixed dumbbell/machine increment, expressed in `unit`. */
  | { kind: 'increment'; step: number; unit: WeightUnit }
  | { kind: 'none' };

export interface WarmupOptions {
  readonly scheme?: readonly WarmupStep[];
  readonly rounding?: RoundingMode;
  /**
   * Drop generated sets that land at or below the empty bar — a "warm-up" at
   * bar weight is already covered by the bar itself.
   */
  readonly skipAtOrBelowBar?: boolean;
}

/**
 * @param workingWeightKg the top working set's load, canonical kg
 * @returns warm-up sets, ascending, de-duplicated by weight
 */
export function generateWarmupSets(
  workingWeightKg: number,
  unit: WeightUnit,
  options: WarmupOptions = {},
): TargetSet[] {
  const scheme = options.scheme ?? DEFAULT_WARMUP_SCHEME;
  const rounding = options.rounding ?? { kind: 'barbell' as const };
  const skipAtOrBelowBar = options.skipAtOrBelowBar ?? true;

  if (!Number.isFinite(workingWeightKg) || workingWeightKg <= 0) return [];

  const barWeightInUnit =
    rounding.kind === 'barbell'
      ? (rounding.setup ?? defaultPlateSetup(unit)).barWeight
      : 0;

  const seen = new Set<number>();
  const out: TargetSet[] = [];

  for (const step of scheme) {
    const rawInUnit = fromKg(workingWeightKg, unit) * step.percent;
    // stripFloatNoise even when rounding is off: 100 * 0.55 is
    // 55.00000000000001 in binary floating point, and that must never reach
    // the database as a stored weight.
    const roundedInUnit = stripFloatNoise(applyRounding(rawInUnit, unit, rounding));

    if (roundedInUnit <= 0) continue;
    if (skipAtOrBelowBar && barWeightInUnit > 0 && roundedInUnit <= barWeightInUnit) {
      continue;
    }
    if (seen.has(roundedInUnit)) continue;
    seen.add(roundedInUnit);

    out.push({
      setType: 'warmup' satisfies SetType,
      weightKg: stripFloatNoise(toKg(roundedInUnit, unit)),
      reps: step.reps,
      repsMax: null,
      durationSec: null,
      distanceM: null,
      rpe: null,
    });
  }

  return out;
}

function applyRounding(
  valueInUnit: number,
  unit: WeightUnit,
  mode: RoundingMode,
): number {
  switch (mode.kind) {
    case 'none':
      return valueInUnit;
    case 'increment':
      return roundToStep(valueInUnit, mode.step);
    case 'barbell': {
      const setup = mode.setup ?? defaultPlateSetup(unit);
      const step = smallestIncrement(setup);
      if (step <= 0) return valueInUnit;
      // Round the loaded portion, then re-add the bar.
      const above = valueInUnit - setup.barWeight;
      if (above <= 0) return setup.barWeight;
      return setup.barWeight + roundToStep(above, step);
    }
  }
}
