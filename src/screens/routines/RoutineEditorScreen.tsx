import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { MuscleMap } from '@/components/MuscleMap';
import { PromptModal } from '@/components/PromptModal';
import { Body, Button, Caption, Card, H1, H2, Pill, Row } from '@/components/ui';
import { RoutineSetRow } from './RoutineSetRow';
import { exerciseBySlug } from '@/data/exercises';
import {
  addRoutineSet,
  removeRoutineExercise,
  reorderRoutineExercises,
  updateRoutineExercise,
  updateRoutineMeta,
  type RoutineExerciseData,
} from '@/db/repositories/routines';
import type { Muscle } from '@/domain/types';
import { REST_PRESETS_SEC } from '@/domain/restTimer';
import { formatDuration } from '@/domain/units';
import { useRoutine } from '@/hooks/useRoutines';
import type { RootStackParamList } from '@/navigation/types';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

/**
 * Routine builder: exercises, their planned sets, supersets, rest and notes.
 *
 * Edits are saved as they happen rather than behind a Save button — the routine
 * already exists by the time this screen opens, so there is no draft state to
 * lose or reconcile.
 */
export const RoutineEditorScreen = observer(function RoutineEditorScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'RoutineEditor'>>();
  const routineId = route.params?.routineId;
  const { routine, reload } = useRoutine(routineId);
  const active = useActiveWorkout();
  const [renaming, setRenaming] = useState(false);

  const start = useCallback(async () => {
    if (routineId === undefined) return;
    if (active.isActive) {
      Alert.alert('A workout is already in progress', 'Finish or discard it first.');
      return;
    }
    await active.startFromRoutine(routineId);
    navigation.navigate('ActiveWorkout');
  }, [active, navigation, routineId]);

  if (routine === null) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Caption>Loading…</Caption>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setRenaming(true)} accessibilityLabel="Rename routine">
          <Row style={{ justifyContent: 'space-between' }}>
            <H1 style={{ flex: 1 }}>{routine.name}</H1>
            <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
              Rename
            </Text>
          </Row>
        </Pressable>

        <Caption style={{ marginTop: 2 }}>
          {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'}
        </Caption>

        {routine.exercises.length === 0 ? (
          <Card style={{ marginTop: spacing.xl }}>
            <H2>Add your first exercise</H2>
            <Body muted style={{ marginTop: spacing.xs }}>
              Each exercise gets three working sets by default. Set target weights and rep
              ranges now, or leave them blank and fill them in as you train.
            </Body>
          </Card>
        ) : (
          routine.exercises.map((re, index) => (
            <RoutineExerciseCard
              key={re.id}
              re={re}
              index={index}
              total={routine.exercises.length}
              allExercises={routine.exercises}
              onChanged={reload}
            />
          ))
        )}

        <Button
          label="Add exercise"
          variant={routine.exercises.length === 0 ? 'primary' : 'secondary'}
          onPress={() =>
            navigation.navigate('ExercisePicker', { mode: 'routine', targetId: routine.id })
          }
          style={{ marginTop: spacing.lg }}
        />

        {routine.exercises.length > 0 ? (
          <Button
            label="Start this routine"
            onPress={() => void start()}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
      </ScrollView>

      <PromptModal
        visible={renaming}
        title="Routine name"
        initialValue={routine.name}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          setRenaming(false);
          if (name.trim().length === 0) return;
          void updateRoutineMeta(routine.id, { name }).then(reload);
        }}
      />
    </>
  );
});

const RoutineExerciseCard = observer(function RoutineExerciseCard({
  re,
  index,
  total,
  allExercises,
  onChanged,
}: {
  re: RoutineExerciseData;
  index: number;
  total: number;
  allExercises: readonly RoutineExerciseData[];
  onChanged: () => void;
}) {
  const palette = usePalette();
  const navigation = useNavigation();

  const regions = useMemo(() => exerciseBySlug(re.artKey)?.regions ?? null, [re.artKey]);

  let working = 0;
  const rows = re.sets.map((s) => {
    if (s.setType === 'normal') working += 1;
    return { set: s, workingIndex: working };
  });

  const move = async (delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= total) return;
    const reordered = [...allExercises];
    const [moved] = reordered.splice(index, 1);
    if (moved === undefined) return;
    reordered.splice(target, 0, moved);
    await reorderRoutineExercises(
      reordered.map((e, i) => ({ id: e.id, sortOrder: i, supersetGroup: e.supersetGroup })),
    );
    onChanged();
  };

  /**
   * Supersets are modelled as a shared integer group. Pairing with the exercise
   * ABOVE is the only affordance offered, because that matches how a superset
   * is written on paper and avoids a drag-and-drop grouping UI.
   */
  const toggleSuperset = async () => {
    const previous = allExercises[index - 1];
    if (previous === undefined) {
      Alert.alert('Nothing above', 'A superset pairs this exercise with the one above it.');
      return;
    }
    if (re.supersetGroup !== null && re.supersetGroup === previous.supersetGroup) {
      await updateRoutineExercise(re.id, { supersetGroup: null });
    } else {
      const group = previous.supersetGroup ?? index - 1;
      await updateRoutineExercise(previous.id, { supersetGroup: group });
      await updateRoutineExercise(re.id, { supersetGroup: group });
    }
    onChanged();
  };

  const chooseRest = () => {
    Alert.alert(
      'Rest timer',
      `Rest after each set of ${re.exerciseName}`,
      [
        ...REST_PRESETS_SEC.map((sec) => ({
          text: sec === 0 ? 'Off' : formatDuration(sec),
          onPress: () =>
            void updateRoutineExercise(re.id, { restSec: sec === 0 ? null : sec }).then(
              onChanged,
            ),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const showMenu = () => {
    Alert.alert(
      re.exerciseName,
      undefined,
      [
        { text: 'Rest timer…', onPress: chooseRest },
        {
          text: re.supersetGroup !== null ? 'Remove from superset' : 'Superset with above',
          onPress: () => void toggleSuperset(),
        },
        { text: 'Move up', onPress: () => void move(-1) },
        { text: 'Move down', onPress: () => void move(1) },
        {
          text: 'Exercise details',
          onPress: () => navigation.navigate('ExerciseDetail', { exerciseId: re.exerciseId }),
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeRoutineExercise(re.id).then(onChanged),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  return (
    <Card style={{ marginTop: spacing.md }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <MuscleMap
          regions={regions}
          primary={re.primaryMuscles as Muscle[]}
          secondary={re.secondaryMuscles as Muscle[]}
          size={54}
        />
        <Pressable style={{ flex: 1 }} onPress={showMenu} accessibilityLabel={`${re.exerciseName} options`}>
          <Text style={{ color: palette.accent, fontSize: fontSize.md, fontWeight: '700' }}>
            {re.exerciseName}
          </Text>
          <Row style={{ marginTop: 2 }} gap={spacing.sm}>
            {re.supersetGroup !== null ? (
              <Pill label={`SUPERSET ${re.supersetGroup + 1}`} tone={palette.accent} />
            ) : null}
            <Caption>
              {re.restSec === null ? 'No rest timer' : `Rest ${formatDuration(re.restSec)}`}
            </Caption>
          </Row>
        </Pressable>
        <Pressable onPress={showMenu} hitSlop={10} accessibilityLabel="Menu">
          <Text style={{ color: palette.textMuted, fontSize: fontSize.xl }}>⋯</Text>
        </Pressable>
      </Row>

      {rows.map(({ set, workingIndex }) => (
        <RoutineSetRow
          key={set.id}
          re={re}
          set={set}
          workingIndex={workingIndex}
          onChanged={onChanged}
        />
      ))}

      <Pressable
        onPress={() =>
          void addRoutineSet(re.id, re.sets.length, {
            setType: 'normal',
            targetWeightKg: re.sets[re.sets.length - 1]?.targetWeightKg ?? null,
            targetReps: re.sets[re.sets.length - 1]?.targetReps ?? null,
            targetRepsMax: re.sets[re.sets.length - 1]?.targetRepsMax ?? null,
          }).then(onChanged)
        }
        accessibilityRole="button"
        accessibilityLabel="Add planned set"
        style={[styles.addSet, { borderColor: palette.border }]}
      >
        <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
          + Add set
        </Text>
      </Pressable>
    </Card>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  addSet: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
});
