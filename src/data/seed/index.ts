import { ARMS } from './exercises.arms';
import { BACK } from './exercises.back';
import { CHEST } from './exercises.chest';
import { CORE } from './exercises.core';
import { FUNCTIONAL } from './exercises.functional';
import { LEGS } from './exercises.legs';
import { SHOULDERS } from './exercises.shoulders';
import type { SeedExercise } from './types';

export type { SeedExercise } from './types';

/**
 * The built-in exercise catalogue.
 *
 * Names, equipment and muscle mappings are hand-curated. There is deliberately
 * NO instruction prose: the widely-copied free-exercise-db descriptions are
 * verbatim bodybuilding.com text (see ART_LICENSING_RESEARCH.md), so any how-to
 * copy added here must be written from scratch.
 */
export const SEED_EXERCISES: readonly SeedExercise[] = [
  ...CHEST,
  ...BACK,
  ...SHOULDERS,
  ...ARMS,
  ...LEGS,
  ...CORE,
  ...FUNCTIONAL,
];

export const SEED_GROUPS = {
  chest: CHEST,
  back: BACK,
  shoulders: SHOULDERS,
  arms: ARMS,
  legs: LEGS,
  core: CORE,
  functional: FUNCTIONAL,
} as const;

/** Exercises that expect Everkinetic artwork, i.e. have a stem to harvest. */
export function exercisesWithArt(): SeedExercise[] {
  return SEED_EXERCISES.filter(
    (e) => e.commonsStem !== null && e.commonsStem !== undefined,
  );
}

/** Exercises explicitly declared to have no Everkinetic art. */
export function exercisesWithoutArt(): SeedExercise[] {
  return SEED_EXERCISES.filter((e) => e.commonsStem === null);
}
