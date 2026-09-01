import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ExerciseArt } from '@/components/ExerciseArt';
import { PromptModal } from '@/components/PromptModal';
import { SetRow } from '@/components/SetRow';
import { Body, Caption, Pill, Row } from '@/components/ui';
import type { WorkoutExerciseData } from '@/db/repositories/workouts';
import { buildHighlight } from '@/domain/muscleMap';
import { REST_PRESETS_SEC } from '@/domain/restTimer';
import type { Muscle } from '@/domain/types';
import { formatDuration } from '@/domain/units';
import { generateWarmupSets } from '@/domain/warmupCalculator';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * One exercise inside the live logger: art, superset marker, its set rows, and
 * the actions that apply to the whole exercise.
 */
export const WorkoutExerciseCard = observer(function WorkoutExerciseCard({
  we,
  onRequestPlateCalculator,
}: {
  we: WorkoutExerciseData;
  onRequestPlateCalculator: (weightKg: number | null) => void;
}) {
  const palette = usePalette();
  const active = useActiveWorkout();
  const settings = useSettings();
  const navigation = useNavigation();
  const [editingNotes, setEditingNotes] = useState(false);

  const parts = useMemo(
    () =>
      buildHighlight(
        we.primaryMuscles as Muscle[],
        we.secondaryMuscles as Muscle[],
      ),
    [we.primaryMuscles, we.secondaryMuscles],
  );

  // Badge numbers count only normal sets, so a warm-up does not consume "1".
  let workingCount = 0;
  const rows = we.sets.map((set) => {
    if (set.setType === 'normal') workingCount += 1;
    return { set, workingIndex: workingCount };
  });

  const addWarmups = async () => {
    const topWorking = [...we.sets]
      .reverse()
      .find((s) => s.setType === 'normal' && s.weightKg !== null);
    if (topWorking?.weightKg == null) {
      Alert.alert(
        'Set a working weight first',
        'The warm-up calculator ramps up to your working set, so it needs that weight.',
      );
      return;
    }
    const warmups = generateWarmupSets(topWorking.weightKg, settings.values.weightUnit);
    if (warmups.length === 0) {
      Alert.alert('Nothing to add', 'That working weight is already at the bar.');
      return;
    }
    await active.addWarmupSets(
      we.id,
      warmups.map((w) => ({ weightKg: w.weightKg, reps: w.reps })),
    );
  };

  const chooseRest = () => {
    Alert.alert(
      'Rest timer',
      `Rest after each set of ${we.exerciseName}`,
      [
        ...REST_PRESETS_SEC.map((sec) => ({
          text: sec === 0 ? 'Off' : formatDuration(sec),
          onPress: () => void active.setExerciseRest(we.id, sec === 0 ? null : sec),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const showMenu = () => {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: 'Add set', onPress: () => void active.addSetTo(we.id) },
    ];
    if (settings.values.warmupCalculatorEnabled) {
      options.push({ text: 'Add warm-up sets', onPress: () => void addWarmups() });
    }
    options.push({ text: 'Rest timer…', onPress: chooseRest });
    options.push({
      text: we.notes !== null && we.notes.length > 0 ? 'Edit note' : 'Add note',
      onPress: () => setEditingNotes(true),
    });
    if (active.canSuperset(we.id)) {
      options.push({
        text:
          we.supersetGroup !== null ? 'Remove from superset' : 'Superset with exercise above',
        onPress: () => void active.toggleSuperset(we.id),
      });
    }
    options.push({ text: 'Move up', onPress: () => void active.moveExercise(we.id, -1) });
    options.push({ text: 'Move down', onPress: () => void active.moveExercise(we.id, 1) });
    options.push({
      text: 'Exercise details',
      onPress: () => navigation.navigate('ExerciseDetail', { exerciseId: we.exerciseId }),
    });
    options.push({
      text: 'Remove exercise',
      style: 'destructive',
      onPress: () =>
        Alert.alert('Remove exercise?', `${we.exerciseName} and its sets will be removed.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => void active.removeExercise(we.id),
          },
        ]),
    });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(we.exerciseName, undefined, options, { cancelable: true });
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Row style={{ alignItems: 'flex-start' }}>
        <ExerciseArt artKey={we.artKey} parts={parts} size={64} animate={false} />

        <Pressable style={{ flex: 1 }} onPress={showMenu} accessibilityLabel={`${we.exerciseName} options`}>
          <Text style={{ color: palette.accent, fontSize: fontSize.lg, fontWeight: '700' }}>
            {we.exerciseName}
          </Text>
          <Row style={{ marginTop: 2 }} gap={spacing.sm}>
            {we.supersetGroup !== null ? (
              <Pill label={`SUPERSET ${we.supersetGroup + 1}`} tone={palette.accent} />
            ) : null}
            {we.restSec !== null ? <Caption>Rest {we.restSec}s</Caption> : null}
          </Row>
        </Pressable>

        <Pressable onPress={showMenu} hitSlop={10} accessibilityLabel="Exercise menu">
          <Text style={{ color: palette.textMuted, fontSize: fontSize.xl }}>⋯</Text>
        </Pressable>
      </Row>

      {we.notes !== null && we.notes.length > 0 ? (
        <Body muted style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}>
          {we.notes}
        </Body>
      ) : null}

      <HeaderRow we={we} />

      {rows.map(({ set, workingIndex }, idx) => (
        <SetRow
          key={set.id}
          we={we}
          set={set}
          workingIndex={workingIndex}
          previous={active.previousFor(we.exerciseId, idx)}
          onRequestPlateCalculator={onRequestPlateCalculator}
        />
      ))}

      <Pressable
        onPress={() => void active.addSetTo(we.id)}
        accessibilityRole="button"
        accessibilityLabel="Add set"
        style={[styles.addSet, { borderColor: palette.border }]}
      >
        <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
          + Add set
        </Text>
      </Pressable>

      <PromptModal
        visible={editingNotes}
        title={`Note — ${we.exerciseName}`}
        initialValue={we.notes ?? ''}
        placeholder="e.g. Seat position 4, felt heavy"
        onCancel={() => setEditingNotes(false)}
        onSubmit={(text) => {
          setEditingNotes(false);
          void active.setExerciseNotes(we.id, text.trim() === '' ? null : text);
        }}
      />
    </View>
  );
});

/** Column captions matched to the exercise's tracking type. */
const HeaderRow = observer(function HeaderRow({ we }: { we: WorkoutExerciseData }) {
  const settings = useSettings();
  const { weightUnit, distanceUnit, rpeEnabled } = settings.values;
  const t = we.trackingType;

  const cols: string[] = [];
  if (t === 'weight_reps') cols.push(weightUnit.toUpperCase(), 'REPS');
  else if (t === 'weighted_bodyweight') cols.push(`+${weightUnit.toUpperCase()}`, 'REPS');
  else if (t === 'assisted_bodyweight') cols.push(`−${weightUnit.toUpperCase()}`, 'REPS');
  else if (t === 'bodyweight_reps') cols.push('REPS');
  else if (t === 'duration') cols.push('TIME');
  else if (t === 'distance_duration') cols.push(distanceUnit.toUpperCase(), 'TIME');

  const showRpe = rpeEnabled && t !== 'duration';

  return (
    <Row style={styles.header} gap={spacing.xs}>
      <View style={{ width: 30 }}>
        <Caption>SET</Caption>
      </View>
      <View style={{ width: 74 }}>
        <Caption>PREVIOUS</Caption>
      </View>
      {cols.map((c) => (
        <View key={c} style={{ flex: 1, minWidth: 54, alignItems: 'center' }}>
          <Caption>{c}</Caption>
        </View>
      ))}
      {showRpe ? (
        <View style={{ width: 52, alignItems: 'center' }}>
          <Caption>RPE</Caption>
        </View>
      ) : null}
      <View style={{ width: 34 }} />
    </Row>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: { marginTop: spacing.md, paddingHorizontal: spacing.xs },
  addSet: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
});
