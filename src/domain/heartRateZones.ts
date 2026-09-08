/**
 * Heart-rate zones as fractions of max HR, plus the profile-based max-HR
 * estimate that anchors them.
 *
 * The five-band split and its palette are shared by every HR surface — the
 * post-workout chart behind it, the live session graph on the cardio card and
 * the zone pill next to the live bpm — so a "zone" means the same thing
 * everywhere and the ceiling only ever has to be derived once.
 */
import type { Sex } from './types';

export interface HrZone {
  /** Lower bound as a fraction of max HR (inclusive). */
  readonly min: number;
  /** Upper bound as a fraction of max HR (exclusive). */
  readonly max: number;
  /** Shorthand label, e.g. "Z2". */
  readonly label: string;
  /** Everyday name, e.g. "Fat burn". */
  readonly name: string;
  readonly color: string;
}

/** Five-zone model (% of max HR). Matches WHOOP's HR-max-relative bands. */
export const HR_ZONES: readonly HrZone[] = [
  { min: 0.5, max: 0.6, label: 'Z1', name: 'Recovery', color: '#3D7BFF' },
  { min: 0.6, max: 0.7, label: 'Z2', name: 'Fat burn', color: '#1FAA54' },
  { min: 0.7, max: 0.8, label: 'Z3', name: 'Tempo', color: '#F0C800' },
  { min: 0.8, max: 0.9, label: 'Z4', name: 'Threshold', color: '#FF8D1F' },
  { min: 0.9, max: 1.05, label: 'Z5', name: 'VO₂ max', color: '#E63B3B' },
];

/** 1-based zone index (1 = Z1) for a heart rate, or null when out of range. */
export function zoneIndexForHr(hr: number, maxHr: number): number | null {
  if (!Number.isFinite(hr) || !Number.isFinite(maxHr) || hr <= 0 || maxHr <= 0) {
    return null;
  }
  const ratio = hr / maxHr;
  for (let i = 0; i < HR_ZONES.length; i++) {
    const zone = HR_ZONES[i];
    if (zone !== undefined && ratio >= zone.min && ratio < zone.max) return i + 1;
  }
  return null;
}

/** The zone a heart rate sits in, or null when out of range. */
export function hrZone(hr: number, maxHr: number): HrZone | null {
  const index = zoneIndexForHr(hr, maxHr);
  if (index === null) return null;
  return HR_ZONES[index - 1] ?? null;
}

/**
 * Estimated max HR from age and sex. Uses the sex-specific regression that is
 * best supported for the general adult population — Tanaka et al. for everyone
 * except the Gulati model for women — rather than the legacy 220 − age. Null
 * when the age is unknown, so callers can degrade ("set your profile").
 */
export function estimateMaxHr(age: number, sex: Sex | null | undefined): number | null {
  if (!Number.isFinite(age) || age <= 0 || age > 120) return null;
  return sex === 'female'
    ? Math.round(206 - 0.88 * age) // Gulati et al. (2010)
    : Math.round(208 - 0.7 * age); // Tanaka et al. (2001); male default
}