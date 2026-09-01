import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DurationField } from '@/components/DurationField';
import { NumberField } from '@/components/NumberField';
import { SetTypeBadge } from '@/components/SetTypeBadge';
import {
  deleteRoutineSet,
  updateRoutineSet,
  type RoutineExerciseData,
  type RoutineSetData,
} from '@/db/repositories/routines';
import { ALL_SET_TYPES, hasDistance, hasDuration, hasReps, hasWeight } from '@/domain/types';
import type { SetType } from '@/domain/types';
import { distanceToMetres, fromKg, metresToDistance, toKg } from '@/domain/units';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * A planned set inside the routine editor.
 *
 * Unlike the logger, reps here can be a RANGE: `targetReps` is the lower bound
 * and `targetRepsMax` the optional upper one, so a routine can say "8–12"
 * rather than pretending the user committed to an exact number.
 */
export function RoutineSetRow({
  re,
  set,
  workingIndex,
  onChanged,
}: {
  re: RoutineExerciseData;
  set: RoutineSetData;
  workingIndex: number;
  onChanged: () => void;
}) {
  const palette = usePalette();
  const settings = useSettings();
  const { weightUnit, distanceUnit } = settings.values;
  const t = re.trackingType;

  const patch = useCallback(
    (p: Partial<RoutineSetData>) => {
      void updateRoutineSet(set.id, p).then(onChanged);
    },
    [set.id, onChanged],
  );

  const chooseType = () => {
    Alert.alert(
      'Set type',
      undefined,
      [
        ...ALL_SET_TYPES.map((st) => ({
          text: setTypeName(st),
          onPress: () => patch({ setType: st }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const remove = () => {
    Alert.alert('Remove set?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void deleteRoutineSet(set.id).then(onChanged),
      },
    ]);
  };

  return (
    <Pressable onLongPress={remove} style={styles.row} accessibilityLabel={`Planned set ${workingIndex}`}>
      <SetTypeBadge setType={set.setType} workingIndex={workingIndex} onPress={chooseType} />

      {hasWeight(t) ? (
        <View style={styles.cell}>
          <NumberField
            value={set.targetWeightKg === null ? null : fromKg(set.targetWeightKg, weightUnit)}
            onChange={(v) =>
              patch({ targetWeightKg: v === null ? null : toKg(v, weightUnit) })
            }
            placeholder={weightUnit}
            accessibilityLabel={`Target weight in ${weightUnit}`}
          />
        </View>
      ) : null}

      {hasReps(t) ? (
        <>
          <View style={styles.cell}>
            <NumberField
              value={set.targetReps}
              onChange={(v) => patch({ targetReps: v === null ? null : Math.round(v) })}
              decimals={0}
              placeholder="reps"
              accessibilityLabel="Target reps, lower bound"
            />
          </View>
          <Text style={{ color: palette.textFaint, fontSize: fontSize.sm }}>–</Text>
          <View style={styles.cell}>
            <NumberField
              value={set.targetRepsMax}
              onChange={(v) => patch({ targetRepsMax: v === null ? null : Math.round(v) })}
              decimals={0}
              placeholder="max"
              accessibilityLabel="Target reps, upper bound (optional)"
            />
          </View>
        </>
      ) : null}

      {hasDistance(t) ? (
        <View style={styles.cell}>
          <NumberField
            value={
              set.targetDistanceM === null
                ? null
                : metresToDistance(set.targetDistanceM, distanceUnit)
            }
            onChange={(v) =>
              patch({
                targetDistanceM: v === null ? null : distanceToMetres(v, distanceUnit),
              })
            }
            placeholder={distanceUnit}
            accessibilityLabel={`Target distance in ${distanceUnit}`}
          />
        </View>
      ) : null}

      {hasDuration(t) ? (
        <View style={styles.cell}>
          <DurationField
            value={set.targetDurationSec}
            onChange={(v) => patch({ targetDurationSec: v })}
            accessibilityLabel="Target duration"
          />
        </View>
      ) : null}

      <Pressable
        onPress={remove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Remove set"
        style={styles.remove}
      >
        <Text style={{ color: palette.textFaint, fontSize: fontSize.lg }}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

function setTypeName(t: SetType): string {
  switch (t) {
    case 'normal':
      return 'Normal set';
    case 'warmup':
      return 'Warm-up set';
    case 'drop':
      return 'Drop set';
    case 'failure':
      return 'Failure set';
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  cell: { flex: 1, minWidth: 48 },
  remove: { width: 30, alignItems: 'center' },
});
