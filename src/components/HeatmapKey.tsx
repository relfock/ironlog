import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

/**
 * One-line label above the heatmap body. The zone colours and ranges live in
 * the legend underneath, so this only names the axis.
 */
export function HeatmapKey() {
  const palette = usePalette();
  return <Text style={[styles.base, { color: palette.textMuted }]}>Intensity = avg sets/week</Text>;
}

const styles = StyleSheet.create({
  base: { fontSize: fontSize.xs, marginTop: spacing.xs },
});