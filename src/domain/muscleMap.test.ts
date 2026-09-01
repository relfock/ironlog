import {
  BACK_SLUGS,
  FRONT_SLUGS,
  buildHeatmap,
  buildHighlight,
  muscleToSlug,
  partsVisibleOn,
  preferredSide,
  type BodySlug,
} from './muscleMap';
import type { Muscle } from './types';

/**
 * Guard rail: these read the INSTALLED package, so a dependency upgrade that
 * changes the taxonomy fails here instead of silently rendering blank bodies.
 */
describe('slug tables match the installed react-native-body-highlighter', () => {
  const { bodyFront } = require('react-native-body-highlighter/dist/assets/bodyFront.js');
  const { bodyBack } = require('react-native-body-highlighter/dist/assets/bodyBack.js');

  const actualFront = [...new Set((bodyFront as { slug: string }[]).map((p) => p.slug))].sort();
  const actualBack = [...new Set((bodyBack as { slug: string }[]).map((p) => p.slug))].sort();

  it('front slugs are exactly what the package draws', () => {
    expect([...FRONT_SLUGS].sort()).toEqual(actualFront);
  });

  it('back slugs are exactly what the package draws', () => {
    expect([...BACK_SLUGS].sort()).toEqual(actualBack);
  });

  it('has 23 slugs in total and still no "abductors"', () => {
    const union = new Set([...actualFront, ...actualBack]);
    expect(union.size).toBe(23);
    expect(union.has('abductors')).toBe(false);
  });

  it('every muscle maps to a slug the package can actually draw', () => {
    const union = new Set([...actualFront, ...actualBack]);
    const muscles: Muscle[] = [
      'chest', 'lats', 'upper_back', 'lower_back', 'traps', 'front_delts',
      'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs',
      'obliques', 'quads', 'hamstrings', 'glutes', 'calves', 'adductors',
      'abductors', 'neck', 'shins', 'full_body', 'cardio',
    ];
    for (const m of muscles) {
      const slug = muscleToSlug(m);
      if (slug !== null) expect(union.has(slug)).toBe(true);
    }
  });
});

describe('buildHighlight', () => {
  it('marks primary as intensity 1 and secondary as 2', () => {
    const parts = buildHighlight(['chest'], ['triceps', 'front_delts']);
    expect(parts).toEqual(
      expect.arrayContaining([
        { slug: 'chest', intensity: 1 },
        { slug: 'triceps', intensity: 2 },
        { slug: 'deltoids', intensity: 2 },
      ]),
    );
  });

  it('lets primary win a slug collision with secondary', () => {
    // lats and upper_back both collapse to "upper-back".
    const parts = buildHighlight(['lats'], ['upper_back']);
    expect(parts).toEqual([{ slug: 'upper-back', intensity: 1 }]);
  });

  it('collapses all three deltoid heads to one slug without duplicating it', () => {
    const parts = buildHighlight(['front_delts', 'side_delts', 'rear_delts']);
    expect(parts).toEqual([{ slug: 'deltoids', intensity: 1 }]);
  });

  it('drops muscles with no artwork', () => {
    expect(buildHighlight(['full_body', 'cardio'])).toEqual([]);
  });
});

describe('preferredSide', () => {
  it('picks back for a back-dominant exercise', () => {
    // Barbell row: lats+upper back primary, biceps secondary.
    const parts = buildHighlight(['lats', 'upper_back'], ['biceps', 'rear_delts']);
    expect(preferredSide(parts)).toBe('back');
  });

  it('picks back for a deadlift rather than rendering nothing on front', () => {
    const parts = buildHighlight(['glutes', 'hamstrings', 'lower_back'], ['traps']);
    expect(preferredSide(parts)).toBe('back');
    // The point of the function: these slugs are back-only.
    expect(partsVisibleOn(parts, 'front')).toHaveLength(1); // traps only
    expect(partsVisibleOn(parts, 'back').length).toBeGreaterThan(2);
  });

  it('picks front for a bench press', () => {
    const parts = buildHighlight(['chest'], ['triceps', 'front_delts']);
    expect(preferredSide(parts)).toBe('front');
  });

  it('defaults to front when nothing is highlighted', () => {
    expect(preferredSide([])).toBe('front');
  });
});

describe('buildHeatmap', () => {
  it('makes the most-trained muscle the hottest bucket', () => {
    const map = new Map<Muscle, number>([
      ['chest', 20],
      ['biceps', 10],
      ['calves', 1],
    ]);
    const heat = buildHeatmap(map, 4);
    const bySlug = new Map(heat.map((h) => [h.slug as BodySlug, h.intensity]));
    expect(bySlug.get('chest')).toBe(1);
    expect(bySlug.get('calves')).toBe(4);
    expect(bySlug.get('biceps')!).toBeGreaterThan(1);
    expect(bySlug.get('biceps')!).toBeLessThan(4);
  });

  it('sums muscles that collapse onto the same slug', () => {
    // All three delt heads land on "deltoids".
    const heat = buildHeatmap(
      new Map<Muscle, number>([
        ['front_delts', 4],
        ['side_delts', 4],
        ['rear_delts', 4],
        ['chest', 6],
      ]),
    );
    const bySlug = new Map(heat.map((h) => [h.slug, h.intensity]));
    // 12 combined delt sets beats 6 chest sets, so delts must be hotter.
    expect(bySlug.get('deltoids')).toBe(1);
    expect(bySlug.get('chest')!).toBeGreaterThan(1);
  });

  it('returns nothing for an empty history', () => {
    expect(buildHeatmap(new Map())).toEqual([]);
  });
});
