import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WEEKLY_SETS_ZONES, type WeeklySetsZone } from '@/domain/trainingVolume';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

function rangeLabel(z: WeeklySetsZone): string {
  return z.maxWeeklySets === null ? `${z.minWeeklySets}+` : `${z.minWeeklySets}–${z.maxWeeklySets - 1}`;
}

/** Colours for the zone blocks come from the same ramp the map uses. */
export function HeatmapLegend({ colors }: { readonly colors: readonly string[] }) {
  const palette = usePalette();
  return (
    <View style={styles.row}>
      {WEEKLY_SETS_ZONES.map((z) => (
        <View key={z.heatLevel} style={styles.item}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: colors[z.heatLevel - 1] ?? palette.bodyPrimary },
            ]}
          />
          <Text style={[styles.label, { color: palette.textMuted }]}>
            {z.label} ({rangeLabel(z)})
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  label: { fontSize: fontSize.xs },
});