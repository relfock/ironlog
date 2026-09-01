import { observer } from 'mobx-react-lite';
import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DurationField } from './DurationField';
import { NumberField } from './NumberField';
import { SetTypeBadge } from './SetTypeBadge';
import type { WorkoutExerciseData, WorkoutSetData } from '@/db/repositories/workouts';
import { ALL_SET_TYPES, hasDistance, hasDuration, hasReps, hasWeight, supportsRpe } from '@/domain/types';
import type { SetType } from '@/domain/types';
import { formatDuration, fromKg, metresToDistance, toKg, distanceToMetres } from '@/domain/units';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

interface Props {
  readonly we: WorkoutExerciseData;
  readonly set: WorkoutSetData;
  /** 1-based index among NORMAL sets, for the badge number. */
  readonly workingIndex: number;
  readonly previous: WorkoutSetData | null;
  readonly onRequestPlateCalculator?: (weightKg: number | null) => void;
}

/**
 * One logged set.
 *
 * Columns follow the exercise's tracking type, so a plank shows a duration
 * field and no weight, and a push-up shows reps only. Showing an inert weight
 * box on a bodyweight movement is how apps end up with sets that report zero
 * volume for no visible reason.
 */
export const SetRow = observer(function SetRow({
  we,
  set,
  workingIndex,
  previous,
  onRequestPlateCalculator,
}: Props) {
  const palette = usePalette();
  const settings = useSettings();
  const active = useActiveWorkout();
  const { weightUnit, distanceUnit, rpeEnabled, hapticsEnabled } = settings.values;

  const tracking = we.trackingType;
  const showWeight = hasWeight(tracking);
  const showReps = hasReps(tracking);
  const showDuration = hasDuration(tracking);
  const showDistance = hasDistance(tracking);
  const showRpe = rpeEnabled && supportsRpe(tracking);

  const toggle = useCallback(() => {
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    void active.toggleSet(set.id);
  }, [active, set.id, hapticsEnabled]);

  const chooseSetType = useCallback(() => {
    Alert.alert(
      'Set type',
      undefined,
      [
        ...ALL_SET_TYPES.map((t) => ({
          text: setTypeName(t),
          onPress: () => void active.setSetType(set.id, t),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  }, [active, set.id]);

  const confirmDelete = useCallback(() => {
    Alert.alert('Remove set?', 'This set will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void active.removeSet(set.id),
      },
    ]);
  }, [active, set.id]);

  const previousLabel = describePrevious(previous, weightUnit);
  const hasPr = set.prKinds.length > 0;

  return (
    <Pressable
      onLongPress={confirmDelete}
      accessibilityLabel={`Set ${workingIndex}. Long press to remove.`}
      style={[
        styles.row,
        set.completed
          ? { backgroundColor: withAlpha(palette.success) }
          : null,
      ]}
    >
      <SetTypeBadge
        setType={set.setType}
        workingIndex={workingIndex}
        onPress={chooseSetType}
      />

      <Pressable
        style={styles.previous}
        onPress={() => applyPrevious(previous, set, active)}
        disabled={previous === null}
        accessibilityLabel={
          previousLabel === '—' ? 'No previous data' : `Previous: ${previousLabel}. Tap to copy.`
        }
      >
        <Text
          numberOfLines={1}
          style={{ color: palette.textFaint, fontSize: fontSize.sm, fontVariant: ['tabular-nums'] }}
        >
          {previousLabel}
        </Text>
      </Pressable>

      {showWeight ? (
        <Pressable
          style={styles.cell}
          onLongPress={
            settings.values.plateCalculatorEnabled && onRequestPlateCalculator
              ? () => onRequestPlateCalculator(set.weightKg)
              : undefined
          }
        >
          <NumberField
            value={set.weightKg === null ? null : fromKg(set.weightKg, weightUnit)}
            onChange={(v) =>
              active.editField(set.id, 'weightKg', v === null ? null : toKg(v, weightUnit))
            }
            onBlur={() => active.flushField(set.id)}
            placeholder={
              previous?.weightKg != null
                ? String(Math.round(fromKg(previous.weightKg, weightUnit) * 100) / 100)
                : weightUnit
            }
            accessibilityLabel={`Weight in ${weightUnit}`}
          />
        </Pressable>
      ) : null}

      {showReps ? (
        <View style={styles.cell}>
          <NumberField
            value={set.reps}
            onChange={(v) => active.editField(set.id, 'reps', v === null ? null : Math.round(v))}
            onBlur={() => active.flushField(set.id)}
            decimals={0}
            placeholder={previous?.reps != null ? String(previous.reps) : 'reps'}
            accessibilityLabel="Reps"
          />
        </View>
      ) : null}

      {showDistance ? (
        <View style={styles.cell}>
          <NumberField
            value={
              set.distanceM === null ? null : metresToDistance(set.distanceM, distanceUnit)
            }
            onChange={(v) =>
              active.editField(
                set.id,
                'distanceM',
                v === null ? null : distanceToMetres(v, distanceUnit),
              )
            }
            onBlur={() => active.flushField(set.id)}
            placeholder={distanceUnit}
            accessibilityLabel={`Distance in ${distanceUnit}`}
          />
        </View>
      ) : null}

      {showDuration ? (
        <View style={styles.cell}>
          <DurationField
            value={set.durationSec}
            onChange={(v) => active.editField(set.id, 'durationSec', v)}
            onBlur={() => active.flushField(set.id)}
            accessibilityLabel="Duration"
          />
        </View>
      ) : null}

      {showRpe ? (
        <View style={styles.rpeCell}>
          <NumberField
            value={set.rpe}
            onChange={(v) => active.editField(set.id, 'rpe', v)}
            onBlur={() => active.flushField(set.id)}
            decimals={1}
            placeholder="RPE"
            accessibilityLabel="Rate of perceived exertion"
          />
        </View>
      ) : null}

      <Pressable
        onPress={toggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.completed }}
        accessibilityLabel={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
        hitSlop={6}
        style={[
          styles.check,
          {
            backgroundColor: set.completed ? palette.success : 'transparent',
            borderColor: set.completed ? palette.success : palette.border,
          },
        ]}
      >
        <Text style={{ color: set.completed ? palette.accentText : palette.textFaint, fontWeight: '900' }}>
          ✓
        </Text>
      </Pressable>

      {hasPr ? (
        <View style={styles.prDot} accessibilityLabel="Personal record">
          <Text style={{ fontSize: fontSize.xs }}>🏆</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

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

/** Ghost text summarising the matching set from the last session. */
function describePrevious(
  previous: WorkoutSetData | null,
  weightUnit: 'kg' | 'lb',
): string {
  if (previous === null) return '—';
  const bits: string[] = [];
  if (previous.weightKg !== null) {
    bits.push(`${Math.round(fromKg(previous.weightKg, weightUnit) * 100) / 100}${weightUnit}`);
  }
  if (previous.reps !== null) bits.push(`×${previous.reps}`);
  if (previous.durationSec !== null) bits.push(formatDuration(previous.durationSec));
  if (previous.distanceM !== null) bits.push(`${Math.round(previous.distanceM)}m`);
  return bits.length > 0 ? bits.join(' ') : '—';
}

/** Tapping the ghost text copies last session's numbers into this set. */
function applyPrevious(
  previous: WorkoutSetData | null,
  set: WorkoutSetData,
  active: ReturnType<typeof useActiveWorkout>,
): void {
  if (previous === null) return;
  if (previous.weightKg !== null) active.editField(set.id, 'weightKg', previous.weightKg);
  if (previous.reps !== null) active.editField(set.id, 'reps', previous.reps);
  if (previous.durationSec !== null) {
    active.editField(set.id, 'durationSec', previous.durationSec);
  }
  if (previous.distanceM !== null) active.editField(set.id, 'distanceM', previous.distanceM);
  active.flushField(set.id);
}

/**
 * Very light tint of a palette colour, for the completed-row background.
 * An 8-digit hex alpha suffix avoids pulling in a colour-maths dependency.
 */
function withAlpha(color: string): string {
  return `${color}22`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  previous: { width: 74 },
  cell: { flex: 1, minWidth: 54 },
  rpeCell: { width: 52 },
  check: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prDot: { position: 'absolute', right: 38, top: 0 },
});
