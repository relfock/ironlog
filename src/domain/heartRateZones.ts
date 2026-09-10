/**
 * Heart-rate zones as fractions of max HR, plus the profile-based max-HR
 * estimate that anchors them.
 *
 * The model is six bands Z0…Z5 indexed from the bottom. The
 * boundaries are configurable per user (stored in Settings as `heartRateZones`)
 * and fall back to `DEFAULT_HR_ZONES` when unset. Every HR surface — the
 * post-workout chart, the live session graph on the cardio card, the zone pill,
 * the per-zone minute split — renders from the same resolved set, so a "zone"
 * always means the same thing and only ever has to be derived once.
 */
import type { Sex } from './types';

export interface HrZone {
  /** Lower bound as a fraction of max HR (inclusive). */
  readonly min: number;
  /** Upper bound as a fraction of max HR (exclusive). */
  readonly max: number;
  /** Shorthand label, e.g. "Z0". */
  readonly label: string;
  /** Everyday name, e.g. "Recovery". */
  readonly name: string;
  readonly color: string;
}

export type HrZoneSet = readonly HrZone[];

/**
 * Default six-zone model (fractions of max HR), with a leading Z0 for the
 * below-recovery range.
 *
 *   Z0  Resting      < 50%
 *   Z1  Recovery     50–60%
 *   Z2  Fat burn     60–70%
 *   Z3  Tempo        70–80%
 *   Z4  Threshold    80–90%
 *   Z5  VO₂ max      90%+
 */
export const DEFAULT_HR_ZONES: HrZoneSet = [
  { min: 0.3, max: 0.5, label: 'Z0', name: 'Resting', color: '#8AA2B0' },
  { min: 0.5, max: 0.6, label: 'Z1', name: 'Recovery', color: '#3D7BFF' },
  { min: 0.6, max: 0.7, label: 'Z2', name: 'Fat burn', color: '#1FAA54' },
  { min: 0.7, max: 0.8, label: 'Z3', name: 'Tempo', color: '#F0C800' },
  { min: 0.8, max: 0.9, label: 'Z4', name: 'Threshold', color: '#FF8D1F' },
  { min: 0.9, max: 1.05, label: 'Z5', name: 'VO₂ max', color: '#E63B3B' },
];

/** Backwards-compatible alias for callers that still import the old name. */
export const HR_ZONES: HrZoneSet = DEFAULT_HR_ZONES;

/** Hard ceiling for a boundary as a fraction of max HR (top of Z5). */
export const MAX_ZONE_FRACTION = 1.05;

/** The only configurable part of a zone — its lower/upper % of max HR. */
export interface ZoneBoundary {
  readonly min: number;
  readonly max: number;
}

/**
 * Rebuild a full zone set from user-edited boundaries (fractions of max HR),
 * keeping the canonical labels, names and colours by index. Missing or empty
 * input falls back to the defaults, and any boundary outside 0…1 is clamped so
 * a malformed stored value cannot break rendering.
 */
export function zoneSetFromBoundaries(
  zones: readonly { min: number; max: number }[] | undefined | null,
  template: HrZoneSet = DEFAULT_HR_ZONES,
): HrZoneSet {
  if (zones === undefined || zones === null || zones.length !== template.length) {
    return template;
  }
  const clamp = (v: number): number =>
    Number.isFinite(v) ? Math.min(MAX_ZONE_FRACTION, Math.max(0, v)) : 0;
  return template.map((tz, i) => {
    const z = zones[i];
    if (z === undefined) return tz;
    const min = clamp(z.min);
    let max = clamp(z.max);
    if (max <= min) max = Math.min(MAX_ZONE_FRACTION, min + 0.001);
    return { min, max, label: tz.label, name: tz.name, color: tz.color };
  });
}

/**
 * Whole-bpm boundary for a zone fraction, rounded to an integer. Null when the
 * estimated max HR is unknown, so callers can degrade ("set your profile").
 */
export function boundaryFractionToBpm(
  fraction: number,
  maxHr: number | null,
): number | null {
  if (maxHr === null || !Number.isFinite(fraction) || !Number.isFinite(maxHr)) {
    return null;
  }
  return Math.round(fraction * maxHr);
}

/**
 * Reconstruct a fraction boundary from a whole-bpm value, clamped into
 * 0…MAX_ZONE_FRACTION. A null/empty BPM maps to 0 — validation in the editor
 * is responsible for rejecting incomplete input before this is saved.
 */
export function bpmToBoundaryFraction(bpm: number | null, maxHr: number): number {
  if (bpm === null || !Number.isFinite(bpm) || !Number.isFinite(maxHr) || maxHr <= 0) {
    return 0;
  }
  return Math.min(MAX_ZONE_FRACTION, Math.max(0, bpm / maxHr));
}

/** 0-based zone index (0 = Z0) for a heart rate, or null when out of range. */
export function zoneIndexForHr(
  hr: number,
  maxHr: number,
  zones: HrZoneSet = DEFAULT_HR_ZONES,
): number | null {
  if (!Number.isFinite(hr) || !Number.isFinite(maxHr) || hr <= 0 || maxHr <= 0) {
    return null;
  }
  const ratio = hr / maxHr;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (zone !== undefined && ratio >= zone.min && ratio < zone.max) return i;
  }
  // Tolerate the very top of the highest band (e.g. ratio === Z5.max exactly)
  // without let-ing anything above the ceiling fall into Z5.
  const top = zones[zones.length - 1];
  if (top !== undefined && ratio >= top.min && ratio <= top.max) {
    return zones.length - 1;
  }
  return null;
}

/** The zone a heart rate sits in, or null when out of range. */
export function hrZone(
  hr: number,
  maxHr: number,
  zones: HrZoneSet = DEFAULT_HR_ZONES,
): HrZone | null {
  const index = zoneIndexForHr(hr, maxHr, zones);
  if (index === null) return null;
  return zones[index] ?? null;
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

/**
 * Per-zone time-in-zone split, in seconds, over a cardio segment's HR samples.
 *
 * Each interval between two consecutive samples is credited to the zone of the
 * sample at the start of the interval, so a segment whose samples are 5 s apart
 * still totals the segment length, not 5 s × N. Gaps over 60 s are ignored so a
 * paused session does not inflate recovery time. Returns null when there is
 * nothing useful to split (no samples or no max HR).
 */
export function zoneSplitSeconds(
  samples: readonly { recordedAt: number; bpm: number }[],
  maxHr: number,
  zones: HrZoneSet = DEFAULT_HR_ZONES,
): number[] | null {
  if (samples.length === 0 || !Number.isFinite(maxHr) || maxHr <= 0) return null;

  const totals = zones.map(() => 0);
  let prevZone: number | null = null;
  let prevAt: number | null = null;

  for (const s of samples) {
    const at = s.recordedAt;
    if (prevAt !== null && at >= prevAt) {
      const gap = (at - prevAt) / 1000;
      if (gap >= 0 && gap <= 60 && prevZone !== null) {
        totals[prevZone] = (totals[prevZone] ?? 0) + gap;
      }
    }
    prevAt = at;
    const index = zoneIndexForHr(s.bpm, maxHr, zones);
    if (index === null) {
      // A sample outside every band still anchors the next interval's clock.
      prevZone = null;
      continue;
    }
    prevZone = index;
  }

  return totals;
}
