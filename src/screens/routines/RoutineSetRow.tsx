import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { DurationField } from '@/components/DurationField';
import { NumberField } from '@/components/NumberField';
import { SetTypeBadge } from '@/components/SetTypeBadge';
import { SetTypeSheet } from '@/components/SetTypeSheet';
import type { DraftExerciseData, DraftSetData } from '@/db/repositories/routines';
import { hasDistance, hasDuration, hasReps, hasWeight } from '@/domain/types';
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

/** Fixed column widths, shared with the editor's header so boxes line up. */
export const COL_BADGE = 34;
export const COL_WEIGHT = 76;
export const COL_UNIT = 76;
export const COL_REPS = 96;

export function RoutineSetRow({
  draftExercise,
  draftSet,
  workingIndex,
  onPatchSet,
  onRemoveSet,
  repsMode,
}: {
  draftExercise: DraftExerciseData;
  draftSet: DraftSetData;
  workingIndex: number;
  onPatchSet: (key: string, patch: Partial<DraftSetData>) => void;
  onRemoveSet: (setKey: string) => void;
  repsMode: 'single' | 'range';
}) {
  const palette = usePalette();
  const settings = useSettings();
  const { weightUnit, distanceUnit } = settings.values;
  const t = draftExercise.trackingType;

  const [setSheetOpen, setSetSheetOpen] = useState(false);

  const chooseType = () => setSetSheetOpen(true);

  const hasW = hasWeight(t);
  const hasU = hasDistance(t) || hasDuration(t);

  // The reps cell is fixed-width when a later column (weight or unit) absorbs
  // the remaining row space; when it is the only flexible column it fills.
  const repsCellStyle = hasW || hasU ? styles.repsCell : styles.repsCellFill;

  const remove = () => {
    Alert.alert('Remove set?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => onRemoveSet(draftSet.key),
      },
    ]);
  };

  return (
    <View style={styles.row}>
      <SetTypeBadge
        setType={draftSet.setType}
        workingIndex={workingIndex}
        onPress={chooseType}
        pop
      />

      {hasWeight(t) ? (
        <View style={styles.weightCell}>
          <NumberField
            value={
              draftSet.targetWeightKg === null
                ? null
                : fromKg(draftSet.targetWeightKg, weightUnit)
            }
            onChange={(v) =>
              onPatchSet(draftSet.key, {
                targetWeightKg: v === null ? null : toKg(v, weightUnit),
              })
            }
            placeholder={weightUnit}
            accessibilityLabel={`Target weight in ${weightUnit}`}
            style={styles.outlined}
          />
        </View>
      ) : null}

      {hasReps(t) ? (
        <View style={repsCellStyle}>
          {/* Same container and inner layout in BOTH modes, so a single "REPS"
              box is exactly as wide as min + "to" + max combined and toggling
              between REP RANGE and REPS never moves anything. */}
          <View style={styles.repsInner}>
            {repsMode === 'single' ? (
              <View style={styles.repsField}>
                <NumberField
                  value={draftSet.targetReps}
                  onChange={(v) =>
                    onPatchSet(draftSet.key, { targetReps: v === null ? null : Math.round(v) })
                  }
                  decimals={0}
                  placeholder="reps"
                  accessibilityLabel="Target reps"
                  style={styles.outlined}
                />
              </View>
            ) : (
              <>
                <View style={styles.repsField}>
                  <NumberField
                    value={draftSet.targetReps}
                    onChange={(v) =>
                      onPatchSet(draftSet.key, { targetReps: v === null ? null : Math.round(v) })
                    }
                    decimals={0}
                    placeholder="min"
                    accessibilityLabel="Target reps, lower bound"
                    style={styles.outlined}
                  />
                </View>
                <Text style={{ color: palette.textFaint, fontSize: fontSize.sm }}>to</Text>
                <View style={styles.repsField}>
                  <NumberField
                    value={draftSet.targetRepsMax}
                    onChange={(v) =>
                      onPatchSet(draftSet.key, {
                        targetRepsMax: v === null ? null : Math.round(v),
                      })
                    }
                    decimals={0}
                    placeholder="max"
                    accessibilityLabel="Target reps, upper bound"
                    style={styles.outlined}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      ) : null}

      {hasDistance(t) ? (
        <View style={styles.unitCell}>
          <NumberField
            value={
              draftSet.targetDistanceM === null
                ? null
                : metresToDistance(draftSet.targetDistanceM, distanceUnit)
            }
            onChange={(v) =>
              onPatchSet(draftSet.key, {
                targetDistanceM: v === null ? null : distanceToMetres(v, distanceUnit),
              })
            }
            placeholder={distanceUnit}
            accessibilityLabel={`Target distance in ${distanceUnit}`}
            style={styles.outlined}
          />
        </View>
      ) : null}

      {hasDuration(t) ? (
        <View style={styles.unitCell}>
          <DurationField
            value={draftSet.targetDurationSec}
            onChange={(v) => onPatchSet(draftSet.key, { targetDurationSec: v })}
            accessibilityLabel="Target duration"
            style={styles.outlined}
          />
        </View>
      ) : null}

      <SetTypeSheet
        visible={setSheetOpen}
        current={draftSet.setType}
        onSelect={(st) => {
          setSetSheetOpen(false);
          onPatchSet(draftSet.key, { setType: st });
        }}
        onRemove={() => {
          setSetSheetOpen(false);
          remove();
        }}
        onClose={() => setSetSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  weightCell: { flex: 1, minWidth: COL_WEIGHT, flexGrow: 1 },
  unitCell: { flex: 1, minWidth: COL_UNIT, flexGrow: 1 },
  repsCell: { width: COL_REPS },
  repsCellFill: { flex: 1, minWidth: COL_REPS },
  repsInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  repsField: { flex: 1, minWidth: 0 },
  outlined: { borderWidth: 1 },
});
