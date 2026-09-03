/**
 * Colouring rules for the muscle-worked artwork.
 *
 * React-free on purpose: `MuscleMap.tsx` only binds a palette and a size to the
 * functions here, so the colour precedence, the placeholder substitution and
 * the box maths are all testable on plain node (see `muscleArt.test.ts`).
 *
 * The template is ONE 53 KB document shared by every exercise, with each of its
 * 81 `fill` attributes replaced by an `@<pathIndex>@` placeholder
 * (src/data/muscleArt/template.ts). Colouring it means one regex pass that
 * hands every placeholder its colour, which is why the region -> path partition
 * in `regions.ts` has to be exact: an unclaimed path would render with an empty
 * fill, i.e. as a hole in the figure.
 */
import type { RegionLevel, RegionMap } from '@/data/exercises/types';
import {
  INACTIVE_PATHS,
  MUSCLE_TO_REGIONS,
  PATH_COUNT,
  PATH_GROUPS,
  STATIC_PATHS,
  type MuscleRegion,
} from '@/data/muscleArt/regions';
import {
  BACK_VIEWBOX,
  FRONT_VIEWBOX,
  MUSCLE_ART_TEMPLATE,
  TEMPLATE_HEIGHT,
  TEMPLATE_VIEWBOX,
  TEMPLATE_WIDTH,
} from '@/data/muscleArt/template';
import type { Muscle } from './types';

export type ArtSide = 'both' | 'front' | 'back';

/** The five colours the artwork needs, lifted out of the theme palette. */
export interface ArtColours {
  /** Muscle that this exercise does not work. */
  readonly base: string;
  readonly primary: string;
  readonly secondary: string;
  readonly silhouette: string;
  readonly shorts: string;
}

/**
 * Canonical region order, taken from `PATH_GROUPS` rather than re-listed, so
 * signatures and accessibility labels stay stable and deterministic without a
 * second copy of the region list to keep in sync.
 */
export const REGION_ORDER: readonly MuscleRegion[] = Object.keys(
  PATH_GROUPS,
) as MuscleRegion[];

type PathOwner =
  | { readonly kind: 'silhouette' }
  | { readonly kind: 'shorts' }
  | { readonly kind: 'unshaded' }
  | { readonly kind: 'region'; readonly region: MuscleRegion };

/**
 * Who owns each of the 81 paths, resolved once.
 *
 * Throws on a gap or a double claim. Both inputs are generated together by
 * `scripts/build-exercise-db.ts`, so a mismatch means the generated data is
 * broken — failing at import names the offending indices, where the same bug
 * reaching the renderer would just show a figure with a missing thigh.
 */
function buildPathOwners(): readonly PathOwner[] {
  const owners = new Array<PathOwner | undefined>(PATH_COUNT).fill(undefined);

  const claim = (index: number, owner: PathOwner): void => {
    if (!Number.isInteger(index) || index < 0 || index >= PATH_COUNT) {
      throw new Error(
        `muscleArt: path index ${index} is outside the template's ${PATH_COUNT} paths`,
      );
    }
    const existing = owners[index];
    if (existing !== undefined) {
      throw new Error(
        `muscleArt: path ${index} is claimed by both ${existing.kind} and ${owner.kind}`,
      );
    }
    owners[index] = owner;
  };

  for (const index of STATIC_PATHS.silhouette) claim(index, { kind: 'silhouette' });
  for (const index of STATIC_PATHS.shorts) claim(index, { kind: 'shorts' });
  for (const index of INACTIVE_PATHS) claim(index, { kind: 'unshaded' });
  for (const region of REGION_ORDER) {
    for (const index of PATH_GROUPS[region]) claim(index, { kind: 'region', region });
  }

  const gaps = owners.reduce<number[]>((acc, owner, index) => {
    if (owner === undefined) acc.push(index);
    return acc;
  }, []);
  if (gaps.length > 0) {
    throw new Error(`muscleArt: template paths ${gaps.join(', ')} have no colour rule`);
  }

  return owners.filter((owner): owner is PathOwner => owner !== undefined);
}

const PATH_OWNERS = buildPathOwners();

/**
 * Which regions light up, and how strongly.
 *
 * A stored region map wins because it reproduces the source art exactly (see
 * `RegionMap`); the muscle lists are the lossy fallback that custom exercises
 * have to use. An EMPTY map carries no information, so it falls through to the
 * muscles rather than forcing a blank figure on an exercise that does know
 * which muscles it works.
 */
export function resolveRegionLevels(
  regions?: RegionMap | null,
  primary: readonly Muscle[] = [],
  secondary: readonly Muscle[] = [],
): RegionMap {
  if (regions != null && Object.keys(regions).length > 0) return regions;

  const levels: Partial<Record<MuscleRegion, RegionLevel>> = {};
  // Secondary first so primary overwrites it: a muscle can reach a region from
  // both lists (side delts secondary, front delts primary -> delts_front) and
  // must not be demoted.
  for (const muscle of secondary) {
    for (const region of MUSCLE_TO_REGIONS[muscle] ?? []) levels[region] = 2;
  }
  for (const muscle of primary) {
    for (const region of MUSCLE_TO_REGIONS[muscle] ?? []) levels[region] = 1;
  }
  return levels;
}

/** One colour per template path, in document order. */
export function buildPathColours(
  levels: RegionMap,
  colours: ArtColours,
): readonly string[] {
  return PATH_OWNERS.map((owner) => {
    switch (owner.kind) {
      case 'silhouette':
        return colours.silhouette;
      case 'shorts':
        return colours.shorts;
      case 'unshaded':
        return colours.base;
      case 'region': {
        const level = levels[owner.region];
        if (level === 1) return colours.primary;
        if (level === 2) return colours.secondary;
        return colours.base;
      }
    }
  });
}

const PLACEHOLDER = /@(\d+)@/g;

/** Fill every placeholder in a single pass over the 53 KB template. */
export function paintTemplate(colours: readonly string[]): string {
  return MUSCLE_ART_TEMPLATE.replace(PLACEHOLDER, (_match, index: string) => {
    const colour = colours[Number(index)];
    if (colour === undefined) {
      throw new Error(`muscleArt: no colour for template path ${index}`);
    }
    return colour;
  });
}

/** Digits in `REGION_ORDER`, e.g. `10020...`. 0 means "not worked". */
export function regionSignature(levels: RegionMap): string {
  return REGION_ORDER.map((region) => levels[region] ?? 0).join('');
}

/** Identifies the palette without needing the theme to name itself. */
function colourSignature(colours: ArtColours): string {
  return `${colours.base}${colours.primary}${colours.secondary}${colours.silhouette}${colours.shorts}`;
}

/**
 * Painted documents, keyed by region signature + palette.
 *
 * This renders at 54-64 dp in scrolling lists, where every row would otherwise
 * rewrite 53 KB on every render — and the props that drive it (`primary` /
 * `secondary` arrays especially) are often fresh objects each render, so a
 * `useMemo` in the component cannot carry the result across rows or scrolls.
 * Keying on the resolved LEVELS rather than on the props collapses that: the
 * visible set of exercises has few distinct signatures, and two exercises that
 * shade the same regions share one string.
 *
 * Bounded because the values are large. 16 documents is roughly a screenful of
 * distinct exercises in both themes; past that, rebuilding the least recently
 * used one costs a single regex pass and is cheaper than the memory.
 */
const MAX_CACHED_DOCUMENTS = 16;
const documentCache = new Map<string, string>();

export function muscleArtSvg(levels: RegionMap, colours: ArtColours): string {
  const key = `${regionSignature(levels)}|${colourSignature(colours)}`;

  const cached = documentCache.get(key);
  if (cached !== undefined) {
    // Re-insert to move it to the end: Map iterates in insertion order, so this
    // turns the eviction below from FIFO into LRU.
    documentCache.delete(key);
    documentCache.set(key, cached);
    return cached;
  }

  const svg = paintTemplate(buildPathColours(levels, colours));
  documentCache.set(key, svg);
  if (documentCache.size > MAX_CACHED_DOCUMENTS) {
    const oldest = documentCache.keys().next().value;
    if (oldest !== undefined) documentCache.delete(oldest);
  }
  return svg;
}

/** For tests, which need to observe the cache from a known state. */
export function clearMuscleArtCache(): void {
  documentCache.clear();
}

/**
 * For tests. The painted documents themselves are indistinguishable — strings
 * compare by value — so the keys, in LRU order, are the only way to assert that
 * the cache hits and evicts the way it claims to.
 */
export function muscleArtCacheKeys(): readonly string[] {
  return [...documentCache.keys()];
}

const SIDE_VIEWBOXES: Readonly<Record<ArtSide, string>> = {
  both: TEMPLATE_VIEWBOX,
  front: FRONT_VIEWBOX,
  back: BACK_VIEWBOX,
};

/**
 * Front and back are two halves of one canvas, so showing a single figure is a
 * viewBox crop — never a change to the paths.
 */
export function viewBoxFor(side: ArtSide): string {
  return SIDE_VIEWBOXES[side];
}

/** Intrinsic size of what `side` shows, in template units. */
const SIDE_SIZES: Readonly<Record<ArtSide, { readonly w: number; readonly h: number }>> =
  {
    both: { w: TEMPLATE_WIDTH, h: TEMPLATE_HEIGHT },
    front: { w: TEMPLATE_WIDTH / 2, h: TEMPLATE_HEIGHT },
    back: { w: TEMPLATE_WIDTH / 2, h: TEMPLATE_HEIGHT },
  };

export interface ArtBox {
  readonly width: number;
  readonly height: number;
}

/**
 * Fit the drawing inside a `size` x `size` box, preserving aspect ratio — the
 * same contract call sites already had with `ExerciseArt`, so swapping the
 * components does not shift any layout.
 */
export function artBox(size: number, side: ArtSide = 'both'): ArtBox {
  const { w, h } = SIDE_SIZES[side];
  const ratio = w / h;
  return ratio >= 1
    ? { width: size, height: size / ratio }
    : { width: size * ratio, height: size };
}

/**
 * Screen-reader names for the regions. Front/back halves of one muscle share a
 * name, and the duplicates are collapsed when the label is built.
 */
const REGION_LABELS: Readonly<Record<MuscleRegion, string>> = {
  abs: 'abs',
  obliques: 'obliques',
  biceps: 'biceps',
  delts_front: 'shoulders',
  lats_front: 'lats',
  traps_front: 'traps',
  chest: 'chest',
  forearms_front: 'forearms',
  abductors_front: 'abductors',
  adductors_front: 'adductors',
  quads: 'quads',
  calves_front: 'calves',
  neck: 'neck',
  delts_back: 'shoulders',
  traps_back: 'traps',
  lats_back: 'lats',
  triceps: 'triceps',
  forearms_back: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  abductors_back: 'abductors',
  calves_back: 'calves',
  lower_back: 'lower back',
};

function labelsAtLevel(levels: RegionMap, level: RegionLevel): string[] {
  return REGION_ORDER.filter((region) => levels[region] === level).map(
    (region) => REGION_LABELS[region],
  );
}

/**
 * Primaries first, then secondaries, deduplicated. Not filtered by `side`: the
 * label describes the exercise, and a thumbnail cropped to the front figure is
 * no reason to hide the glutes from a screen reader.
 */
export function musclesWorkedLabel(levels: RegionMap): string {
  const named = [...new Set([...labelsAtLevel(levels, 1), ...labelsAtLevel(levels, 2)])];
  if (named.length === 0) return 'Muscle map, no muscles highlighted';
  return `Muscles worked: ${named.join(', ')}`;
}
