import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { ExerciseArt } from './ExerciseArt';
import { Caption } from './ui';
import type { Exercise } from '@/db/repositories/exercises';
import { MUSCLE_LABELS, buildHighlight } from '@/domain/muscleMap';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

function CheckBadge({ filled, accent }: { filled: boolean; accent: string }) {
  return (
    <View
      style={[
        styles.check,
        {
          borderColor: accent,
          backgroundColor: filled ? accent : 'transparent',
        },
      ]}
    >
      {filled ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="m5 12.5 4.5 4.5L19 7"
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

export function ExerciseListItem({
  exercise,
  onPress,
  trailing,
  selectable = false,
  selected = false,
}: {
  exercise: Exercise;
  onPress: () => void;
  trailing?: React.ReactNode;
  selectable?: boolean;
  selected?: boolean;
}) {
  const palette = usePalette();
  const parts = useMemo(
    () => buildHighlight(exercise.primary, exercise.secondary),
    [exercise.primary, exercise.secondary],
  );

  // Hevy shows one line of context under the name: the primary muscle only.
  const subtitle = exercise.primary.map((m) => MUSCLE_LABELS[m]).join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      accessibilityLabel={exercise.name}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? palette.surface : 'transparent',
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {/* Animated, like Hevy's GIF previews; the two Everkinetic frames loop. */}
      <View style={[styles.thumb, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <ExerciseArt artKey={exercise.artKey} parts={parts} size={60} animate />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: palette.text, fontSize: fontSize.md, fontWeight: '600' }}
        >
          {exercise.name}
          {exercise.isCustom ? (
            <Caption style={styles.custom}>  CUSTOM</Caption>
          ) : null}
        </Text>
        <Caption style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Caption>
      </View>

      {selectable ? <CheckBadge filled={selected} accent={palette.accent} /> : trailing}
    </Pressable>
  );
}

export function equipmentLabel(e: string): string {
  switch (e) {
    case 'barbell':
      return 'Barbell';
    case 'dumbbell':
      return 'Dumbbell';
    case 'kettlebell':
      return 'Kettlebell';
    case 'machine':
      return 'Machine';
    case 'cable':
      return 'Cable';
    case 'smith_machine':
      return 'Smith machine';
    case 'bodyweight':
      return 'Bodyweight';
    case 'band':
      return 'Band';
    case 'plate':
      return 'Plate';
    case 'ez_bar':
      return 'EZ-bar';
    case 'trap_bar':
      return 'Trap bar';
    case 'sled':
      return 'Sled';
    case 'cardio_machine':
      return 'Cardio machine';
    default:
      return 'Other';
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: 76,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  subtitle: { marginTop: 2 },
  custom: { fontSize: fontSize.xs, fontWeight: '600' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});