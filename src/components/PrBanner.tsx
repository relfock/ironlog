import { observer } from 'mobx-react-lite';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PR_KIND_LABELS } from '@/domain/prDetection';
import { formatDuration, formatWeight } from '@/domain/units';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const AUTO_DISMISS_MS = 4500;

/**
 * The live personal-record notification. Announces one record per set — the
 * most meaningful one — rather than stacking four banners when a single heavy
 * set beats weight, 1RM, volume and reps at once.
 */
export const PrBanner = observer(function PrBanner() {
  const palette = usePalette();
  const active = useActiveWorkout();
  const settings = useSettings();
  const banner = active.prBanner;

  useEffect(() => {
    if (banner === null) return;
    const id = setTimeout(() => active.dismissPrBanner(), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [banner, active]);

  if (banner === null) return null;
  const { pr, exerciseName } = banner;

  return (
    <Pressable
      onPress={() => active.dismissPrBanner()}
      accessibilityRole="alert"
      accessibilityLabel={`New personal record: ${exerciseName}, ${PR_KIND_LABELS[pr.kind]}`}
      style={[styles.banner, { backgroundColor: palette.success }]}
    >
      <Text style={styles.trophy}>🏆</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: palette.accentText }]}>
          {PR_KIND_LABELS[pr.kind]} — {exerciseName}
        </Text>
        <Text style={[styles.detail, { color: palette.accentText }]}>
          {formatPrValue(pr.kind, pr.value, settings.values.weightUnit)}
          {pr.previous !== null
            ? `  (was ${formatPrValue(pr.kind, pr.previous, settings.values.weightUnit)})`
            : '  — first record'}
        </Text>
      </View>
    </Pressable>
  );
});

function formatPrValue(
  kind: keyof typeof PR_KIND_LABELS,
  value: number,
  unit: 'kg' | 'lb',
): string {
  switch (kind) {
    case 'max_weight':
    case 'best_1rm':
      return `${formatWeight(value, unit)} ${unit}`;
    case 'best_set_volume':
      return `${formatWeight(value, unit)} ${unit} volume`;
    case 'best_session_volume':
      return `${formatWeight(value, unit)} ${unit} volume`;
    case 'max_reps':
      return `${value} reps`;
    case 'max_duration':
      return formatDuration(value);
    case 'max_distance':
      return `${Math.round(value)} m`;
  }
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  trophy: { fontSize: fontSize.xl },
  title: { fontSize: fontSize.md, fontWeight: '800' },
  detail: { fontSize: fontSize.sm, marginTop: 2, opacity: 0.9 },
});
