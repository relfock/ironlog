import { SEED_EXERCISES, SEED_GROUPS, exercisesWithArt, exercisesWithoutArt } from './index';
import { hasDistance, hasDuration, hasReps, hasWeight } from '@/domain/types';
import { matchKey } from '@/domain/exerciseSearch';

describe('seed catalogue integrity', () => {
  it('has a useful number of exercises', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(200);
  });

  it('has unique slugs', () => {
    const slugs = SEED_EXERCISES.map((e) => e.slug);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(dupes).toEqual([]);
  });

  it('has unique names', () => {
    const names = SEED_EXERCISES.map((e) => e.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('uses kebab-case slugs', () => {
    for (const e of SEED_EXERCISES) {
      expect(e.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every exercise at least one primary muscle', () => {
    for (const e of SEED_EXERCISES) {
      expect(e.primary.length).toBeGreaterThan(0);
    }
  });

  it('never repeats a muscle between primary and secondary', () => {
    for (const e of SEED_EXERCISES) {
      const overlap = e.secondary.filter((m) => e.primary.includes(m));
      expect(overlap).toEqual([]);
    }
  });

  it('never lists a muscle twice within one list', () => {
    for (const e of SEED_EXERCISES) {
      expect(new Set(e.primary).size).toBe(e.primary.length);
      expect(new Set(e.secondary).size).toBe(e.secondary.length);
    }
  });

  it('does not carry instruction prose (the bodybuilding.com trap)', () => {
    for (const e of SEED_EXERCISES) {
      expect(e).not.toHaveProperty('instructions');
      expect(e).not.toHaveProperty('description');
    }
  });

  it('gives no two exercises the same normalised match key', () => {
    // A collision would make in-app search unable to tell them apart.
    const seen = new Map<string, string>();
    for (const e of SEED_EXERCISES) {
      const key = matchKey(e.name);
      const prev = seen.get(key);
      expect(prev).toBeUndefined();
      seen.set(key, e.slug);
    }
  });

  it('uses a sane default rest when specified', () => {
    for (const e of SEED_EXERCISES) {
      if (e.defaultRestSec === undefined || e.defaultRestSec === null) continue;
      expect(e.defaultRestSec).toBeGreaterThanOrEqual(0);
      expect(e.defaultRestSec).toBeLessThanOrEqual(600);
    }
  });
});

describe('tracking types are coherent with the movement', () => {
  it('gives every duration-tracked exercise no rep target', () => {
    for (const e of SEED_EXERCISES) {
      if (e.trackingType !== 'duration') continue;
      expect(hasReps(e.trackingType)).toBe(false);
      expect(hasDuration(e.trackingType)).toBe(true);
    }
  });

  it('marks cardio machines as distance_duration', () => {
    const cardio = SEED_EXERCISES.filter((e) => e.equipment === 'cardio_machine');
    expect(cardio.length).toBeGreaterThan(0);
    for (const e of cardio) {
      expect(e.trackingType).toBe('distance_duration');
      expect(hasDistance(e.trackingType)).toBe(true);
    }
  });

  it('never marks a bodyweight exercise as plain weight_reps', () => {
    // A push-up logged as weight_reps would report zero volume.
    for (const e of SEED_EXERCISES) {
      if (e.equipment !== 'bodyweight') continue;
      expect(e.trackingType).not.toBe('weight_reps');
    }
  });

  it('only uses assisted_bodyweight on machine or bodyweight movements', () => {
    for (const e of SEED_EXERCISES) {
      if (e.trackingType !== 'assisted_bodyweight') continue;
      expect(['machine', 'bodyweight']).toContain(e.equipment);
    }
  });

  it('gives loaded tracking types a weight column', () => {
    const loaded = SEED_EXERCISES.filter((e) => hasWeight(e.trackingType));
    expect(loaded.length).toBeGreaterThan(100);
  });
});

describe('art coverage bookkeeping', () => {
  it('partitions cleanly into art / no-art', () => {
    expect(exercisesWithArt().length + exercisesWithoutArt().length).toBe(
      SEED_EXERCISES.length,
    );
  });

  it('expects art for the majority of exercises', () => {
    expect(exercisesWithArt().length).toBeGreaterThan(100);
  });

  it('never repeats a Commons stem across two exercises', () => {
    // Two exercises sharing one illustration means one of them is mislabelled.
    const stems = exercisesWithArt().map((e) => e.commonsStem!);
    const dupes = stems.filter((s, i) => stems.indexOf(s) !== i);
    expect(dupes).toEqual([]);
  });

  it('groups sum to the full catalogue', () => {
    const total = Object.values(SEED_GROUPS).reduce((n, g) => n + g.length, 0);
    expect(total).toBe(SEED_EXERCISES.length);
  });
});
