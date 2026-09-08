/**
 * Core domain vocabulary. Deliberately dependency-free so every rule in this
 * folder is unit-testable without React, SQLite or Expo.
 *
 * Canonical storage rule: ALL weights live in kilograms and ALL distances in
 * metres, everywhere below the UI boundary. Conversion happens exactly once, in
 * `units.ts`, when rendering or parsing user input. This is the single most
 * important invariant in the codebase — mixing units in storage is how workout
 * apps silently corrupt years of history.
 */

/** How an exercise is measured. Drives which input columns the logger shows. */
export type TrackingType =
  | 'weight_reps' // barbell bench press
  | 'bodyweight_reps' // push-up, air squat
  | 'weighted_bodyweight' // weighted pull-up (+load)
  | 'assisted_bodyweight' // assisted dip (−load)
  | 'duration' // plank
  | 'distance_duration' // treadmill, row erg
  | 'hr_cardio'; // elliptical: heart-rate-tracked time on a cardio machine

/** Hevy's four set types; all four may be mixed within one exercise. */
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';

/** Biological sex used by the recovery model; null = unknown/not set. */
export type Sex = 'male' | 'female';

/**
 * Our muscle taxonomy. Finer-grained than the body map can render, because
 * exercise metadata is worth keeping precise even when the visual has to
 * collapse it (see `muscleMap.ts`).
 */
export type Muscle =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors'
  | 'abductors'
  | 'neck'
  | 'shins'
  | 'full_body'
  | 'cardio';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'cable'
  | 'smith_machine'
  | 'bodyweight'
  | 'band'
  | 'plate'
  | 'ez_bar'
  | 'trap_bar'
  | 'sled'
  | 'cardio_machine'
  | 'other';

/** A set as it exists once logged. Weight in kg, distance in m, duration in s. */
export interface LoggedSet {
  readonly setType: SetType;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly durationSec: number | null;
  readonly distanceM: number | null;
  readonly rpe: number | null;
  readonly completed: boolean;
}

/** A set as *planned* in a routine. Reps may be a range (`repsMax` set). */
export interface TargetSet {
  readonly setType: SetType;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly repsMax: number | null;
  readonly durationSec: number | null;
  readonly distanceM: number | null;
  readonly rpe: number | null;
}

export const ALL_SET_TYPES: readonly SetType[] = ['normal', 'warmup', 'drop', 'failure'];

/**
 * Whether a set type counts toward statistics and personal records.
 * Hevy exposes this as the "Warm Up Sets" preference, so it is a parameter
 * rather than a constant.
 */
export function setTypeCountsForStats(
  setType: SetType,
  countWarmups: boolean,
): boolean {
  if (setType === 'warmup') return countWarmups;
  return true;
}

/** Does this tracking type carry an external load? */
export function hasWeight(t: TrackingType): boolean {
  return (
    t === 'weight_reps' || t === 'weighted_bodyweight' || t === 'assisted_bodyweight'
  );
}

export function hasReps(t: TrackingType): boolean {
  return t !== 'duration' && t !== 'distance_duration' && t !== 'hr_cardio';
}

export function hasDuration(t: TrackingType): boolean {
  return t === 'duration' || t === 'distance_duration' || t === 'hr_cardio';
}

export function hasDistance(t: TrackingType): boolean {
  return t === 'distance_duration';
}

/**
 * Hevy disables RPE for duration-based exercises; we mirror that.
 */
export function supportsRpe(t: TrackingType): boolean {
  return t !== 'duration' && t !== 'hr_cardio';
}
