import type { Palette } from './tokens';

/**
 * Four-colour scale for the muscle heatmap, hottest first. The 21+ "Very high"
 * zone is a distinct dark blue to signal diminishing returns, Optimal is red,
 * Moderate pink and Low orange — separate hue families so adjacent zones never
 * blend into each other on the body map.
 *
 * Index 0 = Very high, 1 = Optimal, 2 = Moderate, 3 = Low — matching
 * `WEEKLY_SETS_ZONES.heatLevel` decremented by one.
 */
export function buildBodyHeatScale(palette: Palette): string[] {
  const { bodyVeryHigh, bodyHeatOptimal, bodyHeatModerate, bodyHeatLow } = palette;
  return [bodyVeryHigh, bodyHeatOptimal, bodyHeatModerate, bodyHeatLow];
}