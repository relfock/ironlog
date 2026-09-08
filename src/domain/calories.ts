/**
 * Energy expenditure during cardio sessions.
 *
 * Primary model: the Keytel et al. (2005) heart-rate equations, which estimate
 * kcal/min from HR plus age, sex and bodyweight — personalized, and it sees how
 * hard the athlete is actually working. Fallback: a fixed-MET estimate scaled
 * by bodyweight (kcal/min = MET × 3.5 × kg / 200) for the no-strap case, where
 * effort is unknowable so we assume a moderate pace.
 *
 * All functions are pure and return null when an input is missing, so the UI
 * can point the user at Settings instead of inventing a number.
 */
import type { Sex } from './types';
import { stripFloatNoise } from './units';

export interface CalorieProfile {
  readonly sex: Sex | null;
  /** Whole years; null when the user hasn't set a birth year. */
  readonly age: number | null;
  /** Bodyweight in kg; null when unknown. */
  readonly bodyweightKg: number | null;
}

/**
 * Keytel curve (hours per week-corrected LS regressions), kcal per minute at
 * the given HR. Unknown sex falls back to the average of the male and female
 * models so the estimate still works before the profile is fully filled in;
 * returns null when HR, age or bodyweight is unknown.
 */
export function keytelKcalPerMin(
  hr: number,
  profile: CalorieProfile,
): number | null {
  const { sex, age, bodyweightKg } = profile;
  if (!Number.isFinite(hr) || hr <= 0 || age === null || bodyweightKg === null) {
    return null;
  }

  const male = (-55.0969 + 0.6309 * hr + 0.1988 * bodyweightKg + 0.2017 * age) / 4.184;
  if (sex === 'male') return Math.max(0, male);

  const female =
    (-20.4022 + 0.4472 * hr - 0.1263 * bodyweightKg + 0.074 * age) / 4.184;
  if (sex === 'female') return Math.max(0, female);

  return Math.max(0, (male + female) / 2);
}

/** MET-based kcal per minute for an upright-elliptical intensity. */
export function metKcalPerMin(met: number, bodyweightKg: number): number | null {
  if (!Number.isFinite(met) || met <= 0) return null;
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null;
  return stripFloatNoise((met * 3.5 * bodyweightKg) / 200);
}

/** Compedium-of-Physical-Activities upright-elliptical intensities. */
export const ELLIPTICAL_METS = {
  light: 3.5,
  moderate: 5.0,
  vigorous: 7.0,
} as const;

export interface HrSample {
  readonly recordedAt: number;
  readonly bpm: number;
}

/**
 * kcal burned over a run of HR samples by integrating the Keytel curve over
 * the time between samples. Gaps longer than five minutes are skipped (the
 * athlete almost certainly stopped logging). Null when we cannot produce a
 * result at all.
 */
export function sessionCaloriesFromHr(
  samples: readonly HrSample[],
  profile: CalorieProfile,
): number | null {
  if (samples.length < 2) return null;

  let kcal = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev === undefined || cur === undefined) continue;
    const deltaMin = (cur.recordedAt - prev.recordedAt) / 60000;
    if (deltaMin <= 0 || deltaMin > 5) continue;
    const perMin = keytelKcalPerMin(cur.bpm, profile);
    if (perMin === null) return null;
    kcal += perMin * deltaMin;
  }
  return kcal;
}

/** kcal over a duration at a fixed MET intensity (no-HR fallback). */
export function caloriesFromMet(
  met: number,
  bodyweightKg: number,
  durationSec: number,
): number | null {
  const perMin = metKcalPerMin(met, bodyweightKg);
  if (perMin === null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }
  return stripFloatNoise((perMin * durationSec) / 60);
}

/**
 * kcal for a partially-complete session, shown (and updated) live on the
 * cardio card. Prefers the HR Keytel curve; falls back to a moderate-pace MET
 * estimate when the session has no HR data; null when bodyweight is unknown
 * too.
 */
export function runningCaloriesKcal(
  elapsedSec: number,
  avgBpm: number | null,
  profile: CalorieProfile,
): number | null {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return null;
  const minutes = elapsedSec / 60;

  if (avgBpm !== null && avgBpm > 0) {
    const perMin = keytelKcalPerMin(avgBpm, profile);
    if (perMin !== null) return stripFloatNoise(perMin * minutes);
  }
  if (profile.bodyweightKg !== null) {
    return caloriesFromMet(ELLIPTICAL_METS.moderate, profile.bodyweightKg, elapsedSec);
  }
  return null;
}