import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MUSCLE_ART_TEMPLATE } from '@/data/muscleArt/template';
import type { TapeSite } from '@/data/measurementGuides';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

const FRONT_WIDTH = 182;
const FRONT_HEIGHT = 379;
const FIGURE_SIZE = 120;

const TAPE_BANDS: Readonly<Record<TapeSite, { y: number; x0: number; x1: number }>> = {
  neck: { y: 0.132, x0: 0.429, x1: 0.56 },
  shoulders: { y: 0.256, x0: 0.22, x1: 0.775 },
  chest: { y: 0.29, x0: 0.198, x1: 0.802 },
  waist: { y: 0.409, x0: 0.341, x1: 0.659 },
  hips: { y: 0.501, x0: 0.308, x1: 0.692 },
  arm: { y: 0.322, x0: 0.71, x1: 0.862 },
  forearm: { y: 0.383, x0: 0.758, x1: 0.896 },
  thigh: { y: 0.554, x0: 0.505, x1: 0.692 },
  calf: { y: 0.87, x0: 0.58, x1: 0.67 },
};

export function TapeFigure({ site }: { site: TapeSite }) {
  const palette = usePalette();
  const height = (FIGURE_SIZE * FRONT_HEIGHT) / FRONT_WIDTH;
  const thickness = Math.max(4, height * 0.02);
  const band = TAPE_BANDS[site];

  const xml = useMemo(
    () => MUSCLE_ART_TEMPLATE.replace(/@(\d+)@/g, () => palette.bodySilhouette),
    [palette.bodySilhouette],
  );

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel="Body diagram showing where to place the tape measure"
    >
      <View style={{ width: FIGURE_SIZE, height }}>
        <SvgXml
          xml={xml}
          width={FIGURE_SIZE}
          height={height}
          viewBox={`0 0 ${FRONT_WIDTH} ${FRONT_HEIGHT}`}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: band.x0 * FIGURE_SIZE,
            width: (band.x1 - band.x0) * FIGURE_SIZE,
            top: band.y * height - thickness / 2,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: palette.accent,
          }}
        >
          <View
            style={{
              position: 'absolute',
              alignSelf: 'center',
              top: -1,
              width: thickness + 6,
              height: thickness + 6,
              borderRadius: (thickness + 6) / 2,
              backgroundColor: palette.accent,
              borderWidth: 2,
              borderColor: palette.surface,
            }}
          />
        </View>
      </View>
      <Text style={[styles.caption, { color: palette.textMuted }]}>
        Measure along the tape band — mirror it for the other side.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  caption: { fontSize: fontSize.xs, marginTop: spacing.xs, textAlign: 'center' },
});