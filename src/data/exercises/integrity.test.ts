/**
 * The catalogue contract its CONSUMERS rely on.
 *
 * Not a re-check of the generator's own assertions (`scripts/build-exercise-db.ts`
 * verifies the source data round-trips); these are the properties that, if the
 * generated output ever broke them, would fail somewhere far away and quietly:
 * seeding would throw on a unique index, or a thumbnail would render an
 * unshaded figure with no error at all.
 */
import { ALL_EXERCISES, exerciseBySlug, exerciseSlugs } from './index';
import { PATH_GROUPS } from '@/data/muscleArt/regions';

describe('catalogue contract', () => {
  it('ships a full catalogue', () => {
    expect(ALL_EXERCISES.length).toBeGreaterThan(1000);
  });

  it('has unique slugs', () => {
    // `exercises.seed_slug` carries a UNIQUE index, so a duplicate would make
    // first-run seeding throw rather than merely double up a row.
    expect(new Set(exerciseSlugs()).size).toBe(ALL_EXERCISES.length);
  });

  it('is sorted by name', () => {
    // The library list renders `ALL_EXERCISES` order directly and does not sort.
    const names = ALL_EXERCISES.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('gives every exercise something to draw', () => {
    // An empty region map falls through to the muscle lists, and an exercise
    // with neither renders a completely unshaded figure — visually a bug, but
    // one no error would report.
    for (const ex of ALL_EXERCISES) {
      expect(Object.keys(ex.regions).length + ex.primary.length).toBeGreaterThan(0);
    }
  });

  it('only names regions the artwork actually has', () => {
    // `buildPathColours` looks regions up by name; an unknown key is silently
    // ignored, so the exercise would just lose that highlight.
    for (const ex of ALL_EXERCISES) {
      for (const [region, level] of Object.entries(ex.regions)) {
        expect(PATH_GROUPS).toHaveProperty(region);
        expect([1, 2]).toContain(level);
      }
    }
  });
});

describe('exerciseBySlug', () => {
  it('finds every catalogue entry', () => {
    for (const ex of ALL_EXERCISES) {
      expect(exerciseBySlug(ex.slug)).toBe(ex);
    }
  });

  it('returns null for the nullable artKey call sites pass it', () => {
    // Every list thumbnail hands it `exercises.artKey` unchecked, which is null
    // for custom exercises.
    expect(exerciseBySlug(null)).toBeNull();
    expect(exerciseBySlug(undefined)).toBeNull();
    expect(exerciseBySlug('not-an-exercise')).toBeNull();
  });

  it('does not leak Object.prototype members', () => {
    // A plain-object index would answer these with an inherited function typed
    // as a DbExercise, and `?? null` would not catch it. The generator emits a
    // Map for exactly this reason; this asserts it keeps doing so.
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(exerciseBySlug(key)).toBeNull();
    }
  });
});
