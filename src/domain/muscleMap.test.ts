import {
  BACK_SLUGS,
  FRONT_SLUGS,
  SLUG_LABELS,
  SLUG_TO_MUSCLES,
  buildHeatmap,
  buildHighlight,
  muscleToSlug,
  partsVisibleOn,
  preferredSide,
  type BodySlug,
} from './muscleMap';
import type { Muscle } from './types';

/**
 * Helper used by the viewer tests: slug set the art can actually draw.
 */
function unionSlugs(): BodySlug[] {
  return [...new Set<BodySlug>([...FRONT_SLUGS, ...BACK_SLUGS])];
}

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

describe('slug label & muscle reverse maps for the 2.5D viewer', () => {

  it('labels every slug the artwork can draw', () => {
    for (const slug of unionSlugs()) {
      expect(SLUG_LABELS[slug]).toBeTruthy();
    }
  });

  it('expands collapsed muscle groups for the exercise filter', () => {
    expect(SLUG_TO_MUSCLES.deltoids).toEqual(['front_delts', 'side_delts', 'rear_delts']);
    expect(SLUG_TO_MUSCLES['upper-back']).toEqual(['lats', 'upper_back']);
    expect(SLUG_TO_MUSCLES.gluteal).toEqual(['glutes', 'abductors']);
  });

  it('maps single-muscle slugs straight through', () => {
    expect(SLUG_TO_MUSCLES.chest).toEqual(['chest']);
    expect(SLUG_TO_MUSCLES.quadriceps).toEqual(['quads']);
    expect(SLUG_TO_MUSCLES['lower-back']).toEqual(['lower_back']);
    expect(SLUG_TO_MUSCLES.tibialis).toEqual(['shins']);
  });

  it('blankets body parts with no exercises so a double-tap does nothing', () => {
    for (const slug of ['hair', 'head', 'hands', 'feet', 'ankles', 'knees'] as const) {
      expect(SLUG_TO_MUSCLES[slug]).toEqual([]);
    }
  });
});

describe('buildHeatmap', () => {
  it('maps absolute weekly sets to the fixed science-based zones', () => {
    const map = new Map<Muscle, number>([
      ['chest', 21],
      ['biceps', 10],
      ['calves', 1],
    ]);
    const heat = buildHeatmap(map, 4);
    const bySlug = new Map(heat.map((h) => [h.slug as BodySlug, h.intensity]));
    expect(bySlug.get('chest')).toBe(1); // Very high (21+)
    expect(bySlug.get('biceps')).toBe(2); // Optimal (10–20)
    expect(bySlug.get('calves')).toBe(4); // Low (1–4)
  });

  it('is absolute: a muscle scores by its own weekly sets, not its rank', () => {
    // Same 10 sets/week chest lands Optimal whether biceps is bigger or gone.
    const alone = buildHeatmap(new Map<Muscle, number>([['chest', 10]]), 4);
    const crowded = buildHeatmap(
      new Map<Muscle, number>([
        ['chest', 10],
        ['biceps', 30],
      ]),
      4,
    );
    const pick = (h: { slug: string; intensity: number }[]) =>
      new Map(h.map((x) => [x.slug, x.intensity])).get('chest');
    expect(pick(alone)).toBe(2);
    expect(pick(crowded)).toBe(2);
  });

  it('sums muscles that collapse onto the same slug', () => {
    // All three delt heads land on "deltoids": 12/week is Optimal, hotter
    // than chest's 6/week (Moderate).
    const heat = buildHeatmap(
      new Map<Muscle, number>([
        ['front_delts', 4],
        ['side_delts', 4],
        ['rear_delts', 4],
        ['chest', 6],
      ]),
    );
    const bySlug = new Map(heat.map((h) => [h.slug, h.intensity]));
    expect(bySlug.get('deltoids')).toBe(2);
    expect(bySlug.get('chest')!).toBe(3);
  });

  it('returns nothing for an empty history', () => {
    expect(buildHeatmap(new Map())).toEqual([]);
  });

  it('does not emit a part for a muscle with zero sets', () => {
    const heat = buildHeatmap(
      new Map<Muscle, number>([
        ['chest', 0],
        ['biceps', 10],
      ]),
      4,
    );
    expect(heat.some((h) => h.slug === 'chest')).toBe(false);
    expect(heat.some((h) => h.slug === 'biceps')).toBe(true);
  });
});
