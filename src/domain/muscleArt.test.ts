import type { RegionMap } from '@/data/exercises/types';
import {
  INACTIVE_PATHS,
  PATH_COUNT,
  PATH_GROUPS,
  STATIC_PATHS,
  type MuscleRegion,
} from '@/data/muscleArt/regions';
import {
  FRONT_VIEWBOX,
  MUSCLE_ART_TEMPLATE,
  TEMPLATE_HEIGHT,
  TEMPLATE_VIEWBOX,
  TEMPLATE_WIDTH,
} from '@/data/muscleArt/template';
import {
  artBox,
  buildPathColours,
  clearMuscleArtCache,
  muscleArtCacheKeys,
  muscleArtSvg,
  musclesWorkedLabel,
  paintTemplate,
  regionSignature,
  resolveRegionLevels,
  viewBoxFor,
  type ArtColours,
} from './muscleArt';
import { needsSvgNormalisation } from './svgCompat';

/** Distinct, greppable values so a mix-up shows up as the wrong token. */
const COLOURS: ArtColours = {
  base: '#BASE00',
  primary: '#PRIM00',
  secondary: '#SEC000',
  silhouette: '#SIL000',
  shorts: '#SHO000',
};

describe('the template partition', () => {
  it('gives every one of the 81 paths exactly one colour', () => {
    const colours = buildPathColours({}, COLOURS);
    expect(colours).toHaveLength(PATH_COUNT);
    for (const colour of colours) {
      expect(Object.values(COLOURS)).toContain(colour);
    }
  });

  it('colours the silhouette and shorts regardless of the region map', () => {
    const colours = buildPathColours({ chest: 1, quads: 1 }, COLOURS);
    for (const index of STATIC_PATHS.silhouette) {
      expect(colours[index]).toBe(COLOURS.silhouette);
    }
    for (const index of STATIC_PATHS.shorts) {
      expect(colours[index]).toBe(COLOURS.shorts);
    }
  });

  it('leaves the unowned paths and unworked regions at the base colour', () => {
    const colours = buildPathColours({ chest: 1 }, COLOURS);
    for (const index of INACTIVE_PATHS) expect(colours[index]).toBe(COLOURS.base);
    for (const index of PATH_GROUPS.quads) expect(colours[index]).toBe(COLOURS.base);
  });

  it('shades primary and secondary regions distinctly', () => {
    const colours = buildPathColours({ chest: 1, triceps: 2 }, COLOURS);
    for (const index of PATH_GROUPS.chest) expect(colours[index]).toBe(COLOURS.primary);
    for (const index of PATH_GROUPS.triceps) {
      expect(colours[index]).toBe(COLOURS.secondary);
    }
  });
});

describe('paintTemplate', () => {
  it('leaves no placeholder behind', () => {
    const svg = paintTemplate(buildPathColours({ chest: 1 }, COLOURS));
    expect(svg).not.toMatch(/@\d+@/);
    expect(svg).not.toContain('fill=""');
  });

  it('emits one fill per path and none of them empty', () => {
    const svg = paintTemplate(buildPathColours({}, COLOURS));
    // The root <svg fill="none"> is the one extra fill in the document.
    const fills = svg.match(/fill="[^"]*"/g) ?? [];
    expect(fills).toHaveLength(PATH_COUNT + 1);
  });

  it('substitutes the colour belonging to each path index', () => {
    // Path 20/21 are the chest; 0 and 42 are the silhouette.
    const svg = paintTemplate(buildPathColours({ chest: 1 }, COLOURS));
    expect(svg.split(COLOURS.primary)).toHaveLength(PATH_GROUPS.chest.length + 1);
    expect(svg.split(COLOURS.silhouette)).toHaveLength(
      STATIC_PATHS.silhouette.length + 1,
    );
  });

  it('rejects a colour table shorter than the template', () => {
    expect(() => paintTemplate(['#000000'])).toThrow(/no colour for template path/);
  });
});

describe('resolveRegionLevels', () => {
  it('prefers the stored region map over the muscle lists', () => {
    const regions: RegionMap = { chest: 1, triceps: 2 };
    expect(resolveRegionLevels(regions, ['quads'], ['glutes'])).toBe(regions);
  });

  it('maps a custom exercise muscles onto both halves of the figure', () => {
    // Lat pulldown as a custom exercise: no region map, only muscle labels.
    const levels = resolveRegionLevels(null, ['lats'], ['biceps', 'rear_delts']);
    expect(levels).toEqual({
      lats_front: 1,
      lats_back: 1,
      biceps: 2,
      delts_back: 2,
    });
  });

  it('lets primary win a region reachable from both lists', () => {
    // front_delts (primary) and side_delts (secondary) both shade delts_front.
    const levels = resolveRegionLevels(undefined, ['front_delts'], ['side_delts']);
    expect(levels.delts_front).toBe(1);
    expect(levels.delts_back).toBe(2);
  });

  it('drops muscles the artwork cannot draw', () => {
    expect(resolveRegionLevels(null, ['full_body', 'cardio', 'shins'])).toEqual({});
  });

  it('falls back to the muscles when the region map is empty', () => {
    expect(resolveRegionLevels({}, ['chest'])).toEqual({ chest: 1 });
  });

  it('yields nothing to highlight when there is no data at all', () => {
    expect(resolveRegionLevels()).toEqual({});
  });
});

describe('regionSignature', () => {
  it('is one digit per region and stable across equal maps', () => {
    const a = regionSignature({ chest: 1, triceps: 2 });
    const b = regionSignature({ triceps: 2, chest: 1 });
    expect(a).toHaveLength(Object.keys(PATH_GROUPS).length);
    expect(a).toBe(b);
    expect(a).not.toBe(regionSignature({ chest: 2, triceps: 2 }));
    expect(regionSignature({})).toMatch(/^0+$/);
  });
});

describe('muscleArtSvg', () => {
  beforeEach(clearMuscleArtCache);

  it('reuses one document for two exercises that shade the same regions', () => {
    const a = muscleArtSvg({ chest: 1, triceps: 2 }, COLOURS);
    const b = muscleArtSvg({ triceps: 2, chest: 1 }, COLOURS);
    expect(b).toEqual(a);
    expect(muscleArtCacheKeys()).toHaveLength(1);
  });

  it('repaints when the palette changes', () => {
    const dark: ArtColours = { ...COLOURS, primary: '#OTHER0' };
    const light = muscleArtSvg({ chest: 1 }, COLOURS);
    const repainted = muscleArtSvg({ chest: 1 }, dark);
    expect(repainted).not.toEqual(light);
    expect(repainted).toContain('#OTHER0');
    expect(repainted).not.toContain(COLOURS.primary);
    expect(muscleArtCacheKeys()).toHaveLength(2);
  });

  it('bounds the cache and evicts the least recently used document', () => {
    // One signature per region: 23 distinct documents through a 16-entry cache.
    const perRegion = (Object.keys(PATH_GROUPS) as MuscleRegion[]).map(
      (region) => ({ [region]: 1 }) as RegionMap,
    );

    for (const map of perRegion.slice(0, 16)) muscleArtSvg(map, COLOURS);
    expect(muscleArtCacheKeys()).toHaveLength(16);

    const oldestKey = regionSignature(perRegion[0]!);
    // Touching the oldest entry must save it from the next eviction.
    muscleArtSvg(perRegion[0]!, COLOURS);
    muscleArtSvg(perRegion[16]!, COLOURS);

    const keys = muscleArtCacheKeys();
    expect(keys).toHaveLength(16);
    expect(keys.some((k) => k.startsWith(oldestKey))).toBe(true);
    expect(keys.some((k) => k.startsWith(regionSignature(perRegion[1]!)))).toBe(false);
  });

  it('still draws the figure with nothing highlighted', () => {
    const svg = muscleArtSvg({}, COLOURS);
    expect(svg).toContain(COLOURS.silhouette);
    expect(svg).toContain(COLOURS.base);
    expect(svg).not.toContain(COLOURS.primary);
  });
});

describe('artBox', () => {
  it('fits the portrait pair inside the size square', () => {
    const box = artBox(220, 'both');
    expect(box.height).toBe(220);
    expect(box.width).toBeCloseTo(220 * (TEMPLATE_WIDTH / TEMPLATE_HEIGHT));
    expect(box.width).toBeLessThan(220);
  });

  it('halves the width for a single figure', () => {
    for (const side of ['front', 'back'] as const) {
      const box = artBox(64, side);
      expect(box.height).toBe(64);
      expect(box.width).toBeCloseTo(artBox(64, 'both').width / 2);
    }
  });

  it('preserves the aspect ratio at every call-site size', () => {
    const ratio = TEMPLATE_WIDTH / TEMPLATE_HEIGHT;
    for (const size of [54, 60, 64, 220]) {
      const box = artBox(size, 'both');
      expect(box.width / box.height).toBeCloseTo(ratio);
      expect(Math.max(box.width, box.height)).toBeLessThanOrEqual(size);
    }
  });

  it('defaults to both figures', () => {
    expect(artBox(100)).toEqual(artBox(100, 'both'));
  });
});

describe('viewBoxFor', () => {
  it('crops to one half of the shared canvas', () => {
    expect(viewBoxFor('both')).toBe(TEMPLATE_VIEWBOX);
    expect(viewBoxFor('front')).toBe('0 0 182 379');
    expect(viewBoxFor('back')).toBe('182 0 182 379');
  });

  it('agrees with the box maths about how wide one figure is', () => {
    const [, , width] = FRONT_VIEWBOX.split(' ').map(Number);
    expect(artBox(379, 'front').width).toBeCloseTo(width!);
  });
});

describe('musclesWorkedLabel', () => {
  it('names primaries before secondaries', () => {
    expect(musclesWorkedLabel({ chest: 1, triceps: 2, delts_front: 2 })).toBe(
      'Muscles worked: chest, shoulders, triceps',
    );
  });

  it('collapses the front and back halves of one muscle', () => {
    expect(musclesWorkedLabel({ lats_front: 1, lats_back: 1 })).toBe(
      'Muscles worked: lats',
    );
  });

  it('keeps a muscle at its highest level when its halves disagree', () => {
    expect(musclesWorkedLabel({ delts_front: 1, delts_back: 2 })).toBe(
      'Muscles worked: shoulders',
    );
  });

  it('says so rather than claiming muscles when there is no data', () => {
    expect(musclesWorkedLabel({})).toBe('Muscle map, no muscles highlighted');
  });
});

/**
 * The renderer workaround `ExerciseArt` needs is deliberately NOT applied to
 * this template. If a regenerated template ever gains a transform the PEG
 * parser chokes on, this fails instead of the figure silently rendering blank.
 */
it('needs no transform normalisation', () => {
  expect(needsSvgNormalisation(MUSCLE_ART_TEMPLATE)).toBe(false);
});
