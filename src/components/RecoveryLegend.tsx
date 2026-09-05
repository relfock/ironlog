import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RECOVERY_ZONES } from '@/domain/muscleRecovery';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

/** Colour blocks for the recovery ramp; indexes match `RECOVERY_ZONES.level`. */
export function RecoveryLegend({ colors }: { readonly colors: readonly string[] }) {
  const palette = usePalette();
  return (
    <View style={styles.row}>
      {RECOVERY_ZONES.filter((z) => z.level !== 1).map((z) => (
        <View key={z.level} style={styles.item}>
          <View
            style={[styles.swatch, { backgroundColor: colors[z.level - 1] ?? palette.bodyBase }]}
          />
          <Text style={[styles.label, { color: palette.textMuted }]}>
            {z.label} ({z.legendLabel})
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