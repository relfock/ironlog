import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { RegionMap } from '@/data/exercises/types';
import {
  artBox,
  muscleArtSvg,
  musclesWorkedLabel,
  resolveRegionLevels,
  viewBoxFor,
  type ArtSide,
} from '@/domain/muscleArt';
import type { Muscle } from '@/domain/types';
import { usePalette } from '@/theme/ThemeProvider';

/**
 * The "muscles worked" figure: front and back, with the worked regions shaded.
 *
 * Replaces `ExerciseArt` everywhere. Where that component tinted a whole
 * illustration one colour, this one colours 81 individual paths of a single
 * shared template — see src/domain/muscleArt.ts for the rules and
 * src/data/muscleArt/regions.ts for why one template plus a region map replaces
 * 1069 near-identical files.
 *
 * NO `normaliseSvgForRenderer` HERE, deliberately. That workaround exists for
 * transforms like `matrix(.1 0 0-.1 0 960)`, where a sign acts as a number
 * separator and react-native-svg's PEG parser gives up. This template's only
 * transforms are `translate(0,0)` and `translate(182,0)` — no signs at all, so
 * `needsSvgNormalisation` returns false for it and the call would be a 53 KB
 * scan per document for nothing. `muscleArt.test.ts` asserts that, so a
 * regenerated template that DOES need it fails a test instead of rendering
 * blank.
 */
export interface MuscleMapProps {
  /** Region map from the bundled catalogue. Takes precedence over `primary`/`secondary`. */
  readonly regions?: RegionMap | null;
  /** Fallback for custom exercises, which carry muscle labels but no region map. */
  readonly primary?: readonly Muscle[];
  readonly secondary?: readonly Muscle[];
  /** Fits the drawing inside a `size` x `size` box, preserving aspect ratio. */
  readonly size?: number;
  readonly side?: ArtSide;
}

export function MuscleMap({
  regions,
  primary,
  secondary,
  size = 220,
  side = 'both',
}: MuscleMapProps): React.ReactElement {
  const palette = usePalette();

  const levels = useMemo(
    () => resolveRegionLevels(regions, primary, secondary),
    [regions, primary, secondary],
  );

  const colours = useMemo(
    () => ({
      base: palette.bodyBase,
      primary: palette.bodyPrimary,
      secondary: palette.bodySecondary,
      silhouette: palette.bodySilhouette,
      shorts: palette.bodyShorts,
    }),
    [palette],
  );

  // The heavy lifting is cached across components by region signature, so the
  // memo here only saves the Map lookup — the hooks above miss whenever a call
  // site passes freshly built muscle arrays, which in a list is every render.
  const xml = useMemo(() => muscleArtSvg(levels, colours), [levels, colours]);
  const box = useMemo(() => artBox(size, side), [size, side]);
  const label = useMemo(() => musclesWorkedLabel(levels), [levels]);

  return (
    <View style={[box, styles.centre]}>
      <SvgXml
        xml={xml}
        width={box.width}
        height={box.height}
        // SvgXml applies its own props over the parsed root element, so this
        // crops to one figure without touching the markup.
        viewBox={viewBoxFor(side)}
        accessibilityRole="image"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
