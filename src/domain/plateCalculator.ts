/**
 * Plate calculator — "which plates go on the bar to reach this weight".
 *
 * Plate denominations are held in the unit they are physically stamped with
 * (a 20 kg plate and a 45 lb plate are different objects, not conversions of
 * each other), so the solve happens in that unit and only the incoming target
 * is converted.
 *
 * The solve is greedy: largest plate first, bounded by how many pairs the user
 * owns. Greedy is not provably optimal for arbitrary denominations, but for
 * every real-world plate set (which is "canonical" in the coin-change sense)
 * it is optimal, and it matches what lifters actually do at the rack.
 */
import type { WeightUnit } from './types';
import { fromKg, roundToStep, stripFloatNoise } from './units';

export interface PlateDenomination {
  /** Denomination in `PlateSetup.unit`. */
  readonly weight: number;
  /** How many *pairs* are available. Use Infinity for "plenty". */
  readonly pairs: number;
}

export interface PlateSetup {
  readonly unit: WeightUnit;
  /** Bar weight expressed in `unit`. */
  readonly barWeight: number;
  readonly plates: readonly PlateDenomination[];
}

export interface PlateGroup {
  readonly weight: number;
  readonly count: number;
}

export interface PlateSolution {
  /** Plates to load on ONE side, largest first. */
  readonly perSide: readonly PlateGroup[];
  /** Total bar weight actually achieved, in `unit`. */
  readonly achievedTotal: number;
  /** How far short of target the achievable load falls, in `unit`. */
  readonly remainder: number;
  readonly exact: boolean;
  /** Target is below the bare bar — nothing to load. */
  readonly belowBar: boolean;
  readonly unit: WeightUnit;
}

export const DEFAULT_KG_PLATES: readonly PlateDenomination[] = [
  { weight: 25, pairs: Infinity },
  { weight: 20, pairs: Infinity },
  { weight: 15, pairs: Infinity },
  { weight: 10, pairs: Infinity },
  { weight: 5, pairs: Infinity },
  { weight: 2.5, pairs: Infinity },
  { weight: 1.25, pairs: Infinity },
];

export const DEFAULT_LB_PLATES: readonly PlateDenomination[] = [
  { weight: 45, pairs: Infinity },
  { weight: 35, pairs: Infinity },
  { weight: 25, pairs: Infinity },
  { weight: 10, pairs: Infinity },
  { weight: 5, pairs: Infinity },
  { weight: 2.5, pairs: Infinity },
];

export function defaultPlateSetup(unit: WeightUnit): PlateSetup {
  return unit === 'kg'
    ? { unit, barWeight: 20, plates: DEFAULT_KG_PLATES }
    : { unit, barWeight: 45, plates: DEFAULT_LB_PLATES };
}

/**
 * @param targetKg desired total bar weight, in canonical kg
 */
export function solvePlates(targetKg: number, setup: PlateSetup): PlateSolution {
  const target = stripFloatNoise(fromKg(targetKg, setup.unit));
  const { unit, barWeight } = setup;

  if (!Number.isFinite(target) || target < barWeight) {
    return {
      perSide: [],
      achievedTotal: barWeight,
      remainder: stripFloatNoise(Math.max(0, barWeight - Math.max(target, 0))),
      exact: Math.abs(target - barWeight) < 1e-6,
      belowBar: target < barWeight,
      unit,
    };
  }

  let remainingPerSide = stripFloatNoise((target - barWeight) / 2);
  const perSide: PlateGroup[] = [];

  const sorted = [...setup.plates].sort((a, b) => b.weight - a.weight);
  for (const plate of sorted) {
    if (remainingPerSide < plate.weight - 1e-9) continue;
    const wanted = Math.floor(stripFloatNoise(remainingPerSide / plate.weight));
    const count = Math.min(wanted, plate.pairs);
    if (count <= 0) continue;
    perSide.push({ weight: plate.weight, count });
    remainingPerSide = stripFloatNoise(remainingPerSide - count * plate.weight);
  }

  const loadedPerSide = perSide.reduce((sum, g) => sum + g.weight * g.count, 0);
  const achievedTotal = stripFloatNoise(barWeight + loadedPerSide * 2);

  return {
    perSide,
    achievedTotal,
    // Per-side shortfall doubles on the bar.
    remainder: stripFloatNoise(remainingPerSide * 2),
    exact: remainingPerSide < 1e-9,
    belowBar: false,
    unit,
  };
}

/** Smallest total-weight step this setup can express (both sides of the bar). */
export function smallestIncrement(setup: PlateSetup): number {
  const usable = setup.plates.filter((p) => p.pairs > 0).map((p) => p.weight);
  if (usable.length === 0) return 0;
  return stripFloatNoise(Math.min(...usable) * 2);
}

/** Nearest weight this plate setup can actually load, in the setup's unit. */
export function snapToLoadable(targetInUnit: number, setup: PlateSetup): number {
  const step = smallestIncrement(setup);
  if (step <= 0) return targetInUnit;
  if (targetInUnit <= setup.barWeight) return setup.barWeight;
  const above = targetInUnit - setup.barWeight;
  return stripFloatNoise(setup.barWeight + roundToStep(above, step));
}

/** "2×20 + 1×5" for a compact per-side summary. */
export function formatPerSide(solution: PlateSolution): string {
  if (solution.perSide.length === 0) return 'bar only';
  return solution.perSide.map((g) => `${g.count}×${g.weight}`).join(' + ');
}
