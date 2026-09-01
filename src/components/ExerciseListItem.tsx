import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ExerciseArt } from './ExerciseArt';
import { Caption, Row } from './ui';
import type { Exercise } from '@/db/repositories/exercises';
import { MUSCLE_LABELS, buildHighlight } from '@/domain/muscleMap';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

export function ExerciseListItem({
  exercise,
  onPress,
  trailing,
}: {
  exercise: Exercise;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  const palette = usePalette();
  const parts = useMemo(
    () => buildHighlight(exercise.primary, exercise.secondary),
    [exercise.primary, exercise.secondary],
  );

  const subtitle = [
    exercise.primary.map((m) => MUSCLE_LABELS[m]).join(', '),
    equipmentLabel(exercise.equipment),
  ]
    .filter((s) => s.length > 0)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={exercise.name}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {/* animate={false}: a scrolling list of ticking 2-frame animations is noise. */}
      <ExerciseArt artKey={exercise.artKey} parts={parts} size={46} animate={false} />

      <View style={{ flex: 1 }}>
        <Row gap={spacing.sm}>
          <Text
            numberOfLines={1}
            style={{ color: palette.text, fontSize: fontSize.md, fontWeight: '600', flexShrink: 1 }}
          >
            {exercise.name}
          </Text>
          {exercise.isCustom ? <Caption>CUSTOM</Caption> : null}
        </Row>
        <Caption>{subtitle}</Caption>
      </View>

      {trailing}
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
