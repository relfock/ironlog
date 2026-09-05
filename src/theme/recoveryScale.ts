import type { Palette } from './tokens';

/**
 * Five-colour recovery ramp, coolest first (matching `RECOVERY_ZONES.level`):
 * index 0 = No data (grey), 1 = Fatigued (red), 2 = Recovering (orange),
 * 3 = Nearly recovered (yellow), 4 = Recovered (green).
 */
export function buildRecoveryScale(palette: Palette): string[] {
  const {
    bodyRecoveryData,
    bodyRecoveryFatigued,
    bodyRecoveryRecovering,
    bodyRecoveryNearly,
    bodyRecoveryRecovered,
  } = palette;
  return [
    bodyRecoveryData,
    bodyRecoveryFatigued,
    bodyRecoveryRecovering,
    bodyRecoveryNearly,
    bodyRecoveryRecovered,
  ];
}