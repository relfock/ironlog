/**
 * Built-in exercises that ship without source artwork or a demonstration video.
 *
 * The exercise-DB generator can only produce entries that exist under
 * `exercises_db/` — each source directory needs `details.txt`,
 * `target_muscles.svg` and `video.mp4` — so the handful of broadly useful
 * "virtual" exercises are defined here instead and seeded alongside the
 * generated catalogue. Cardio machines are the obvious case: there is no
 * muscle-worked art to render (the `cardio` muscle maps to no body regions)
 * and nothing to demonstrate on a body diagram.
 *
 * Unlike catalogue entries, these carry no `url`, an empty `regions` map and
 * no instructions; `seed.ts` gives them a null `artKey` for that reason.
 */
import type { DbExercise } from './types';

/** Extra exercises merged into the catalogue at seed time, name order. */
export const EXTRA_EXERCISES: readonly DbExercise[] = [
  {
    slug: 'elliptical',
    name: 'Elliptical',
    url: '',
    trackingType: 'hr_cardio',
    equipment: 'cardio_machine',
    primary: ['cardio'],
    secondary: [],
    regions: {},
    instructions: [],
    mistakes: [],
  },
  {
    slug: 'other-cardio',
    name: 'Other Cardio',
    url: '',
    trackingType: 'hr_cardio',
    equipment: 'other',
    primary: ['cardio'],
    secondary: [],
    regions: {},
    instructions: [],
    mistakes: [],
  },
];

/** The slots to seed without an `artKey`, and never to archive. */
export const EXTRA_EXERCISE_SLUGS: ReadonlySet<string> = new Set(
  EXTRA_EXERCISES.map((ex) => ex.slug),
);