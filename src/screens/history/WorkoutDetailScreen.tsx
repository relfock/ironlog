import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExerciseArt } from '@/components/ExerciseArt';
import { NumberField } from '@/components/NumberField';
import { PromptModal } from '@/components/PromptModal';
import { Body, Button, Caption, Card, H1, H2, Pill, Row } from '@/components/ui';
import { setTypeLabel } from '@/components/SetTypeBadge';
import { createRoutineFromWorkout } from '@/db/repositories/routines';
import {
  deleteSet,
  discardWorkout,
  loadWorkout,
  recomputeWorkoutTotals,
  updateSet,
  updateWorkoutMeta,
  type WorkoutData,
} from '@/db/repositories/workouts';
import { buildHighlight } from '@/domain/muscleMap';
import type { Muscle } from '@/domain/types';
import { formatDuration, formatDurationCompact, formatWeight, fromKg, toKg } from '@/domain/units';
import type { RootStackParamList } from '@/navigation/types';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

export const WorkoutDetailScreen = observer(function WorkoutDetailScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'WorkoutDetail'>>();
  const settings = useSettings();
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<'name' | 'notes' | null>(null);

  const reload = useCallback(() => {
    void loadWorkout(route.params.workoutId).then(setWorkout);
  }, [route.params.workoutId]);

  useEffect(reload, [reload]);

  const unit = settings.values.weightUnit;

  if (workout === null) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Caption>Loading…</Caption>
      </ScrollView>
    );
  }

  const confirmDelete = () => {
    Alert.alert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void discardWorkout(workout.id).then(() => navigation.goBack()),
      },
    ]);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <H1 style={{ flex: 1 }}>{workout.name}</H1>
          <Text
            onPress={() => setEditing((e) => !e)}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Done editing' : 'Edit workout'}
            style={{
              color: palette.accent,
              fontSize: fontSize.sm,
              fontWeight: '700',
              paddingLeft: spacing.md,
              paddingTop: 6,
            }}
          >
            {editing ? 'Done' : 'Edit'}
          </Text>
        </Row>
        <Caption style={{ marginTop: 2 }}>
          {new Date(workout.startedAt).toLocaleString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Caption>

        <Card style={{ marginTop: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="DURATION" value={formatDurationCompact(workout.durationSec ?? 0)} />
            <Stat
              label="VOLUME"
              value={`${formatWeight(workout.totalVolumeKg, unit)} ${unit}`}
            />
            <Stat label="SETS" value={String(workout.totalSets)} />
            <Stat label="PRs" value={String(workout.prCount)} />
          </Row>
        </Card>

        {editing ? (
          <Card style={{ marginTop: spacing.md }}>
            <Caption>EDITING</Caption>
            <Body muted style={{ marginTop: spacing.xs, fontSize: fontSize.sm }}>
              Correct a mistyped weight or rep count below, or long-press a set to remove
              it. Totals are recalculated as you go.
            </Body>
            <Row style={{ marginTop: spacing.md }} gap={spacing.sm}>
              <Button
                label="Rename"
                variant="secondary"
                onPress={() => setRenaming('name')}
                style={{ flex: 1 }}
              />
              <Button
                label="Notes"
                variant="secondary"
                onPress={() => setRenaming('notes')}
                style={{ flex: 1 }}
              />
            </Row>
            <Caption style={{ marginTop: spacing.md }}>
              Personal records are not recalculated: a record may since have been beaten in
              a later session, so rewriting history here could wrongly demote it.
            </Caption>
          </Card>
        ) : null}

        {workout.notes !== null && workout.notes.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Caption>NOTES</Caption>
            <Body style={{ marginTop: spacing.xs }}>{workout.notes}</Body>
          </Card>
        ) : null}

        {workout.exercises.map((we) => {
          const parts = buildHighlight(
            we.primaryMuscles as Muscle[],
            we.secondaryMuscles as Muscle[],
          );
          let working = 0;
          return (
            <Card key={we.id} style={{ marginTop: spacing.md }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <ExerciseArt artKey={we.artKey} parts={parts} size={54} animate={false} />
                <View style={{ flex: 1 }}>
                  <H2>{we.exerciseName}</H2>
                  {we.supersetGroup !== null ? (
                    <Pill label={`SUPERSET ${we.supersetGroup + 1}`} tone={palette.accent} />
                  ) : null}
                </View>
              </Row>

              {we.sets.filter((s) => s.completed).length === 0 ? (
                <Caption style={{ marginTop: spacing.sm }}>No completed sets</Caption>
              ) : (
                we.sets
                  .filter((s) => s.completed)
                  .map((s) => {
                    if (s.setType === 'normal') working += 1;
                    const bits: string[] = [];
                    if (s.weightKg !== null) {
                      bits.push(`${Math.round(fromKg(s.weightKg, unit) * 100) / 100} ${unit}`);
                    }
                    if (s.reps !== null) bits.push(`× ${s.reps}`);
                    if (s.durationSec !== null) bits.push(formatDuration(s.durationSec));
                    if (s.distanceM !== null) bits.push(`${Math.round(s.distanceM)} m`);
                    if (s.rpe !== null) bits.push(`RPE ${s.rpe}`);
                    if (editing) {
                      return (
                        <Pressable
                          key={s.id}
                          onLongPress={() =>
                            Alert.alert('Remove set?', 'This set will be deleted.', [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () =>
                                  void deleteSet(s.id)
                                    .then(() =>
                                      recomputeWorkoutTotals(
                                        workout.id,
                                        settings.values.countWarmupsInStats,
                                      ),
                                    )
                                    .then(reload),
                              },
                            ])
                          }
                          accessibilityLabel={`Set ${working}. Long press to remove.`}
                        >
                          <Row style={styles.setRow} gap={spacing.sm}>
                            <Text
                              style={{ color: palette.textMuted, width: 24, fontWeight: '700' }}
                            >
                              {setTypeLabel(s.setType, working)}
                            </Text>
                            {s.weightKg !== null ? (
                              <View style={{ flex: 1 }}>
                                <NumberField
                                  value={fromKg(s.weightKg, unit)}
                                  onChange={(v) =>
                                    void updateSet(s.id, {
                                      weightKg: v === null ? null : toKg(v, unit),
                                    })
                                      .then(() =>
                                        recomputeWorkoutTotals(
                                          workout.id,
                                          settings.values.countWarmupsInStats,
                                        ),
                                      )
                                      .then(reload)
                                  }
                                  accessibilityLabel={`Weight in ${unit}`}
                                />
                              </View>
                            ) : null}
                            {s.reps !== null ? (
                              <View style={{ flex: 1 }}>
                                <NumberField
                                  value={s.reps}
                                  decimals={0}
                                  onChange={(v) =>
                                    void updateSet(s.id, {
                                      reps: v === null ? null : Math.round(v),
                                    })
                                      .then(() =>
                                        recomputeWorkoutTotals(
                                          workout.id,
                                          settings.values.countWarmupsInStats,
                                        ),
                                      )
                                      .then(reload)
                                  }
                                  accessibilityLabel="Reps"
                                />
                              </View>
                            ) : null}
                            {s.weightKg === null && s.reps === null ? (
                              <Body muted style={{ flex: 1 }}>
                                {bits.join('  ')}
                              </Body>
                            ) : null}
                          </Row>
                        </Pressable>
                      );
                    }

                    return (
                      <Row key={s.id} style={styles.setRow} gap={spacing.md}>
                        <Text style={{ color: palette.textMuted, width: 24, fontWeight: '700' }}>
                          {setTypeLabel(s.setType, working)}
                        </Text>
                        <Body style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
                          {bits.join('  ')}
                        </Body>
                        {s.prKinds.length > 0 ? (
                          <Text style={{ fontSize: fontSize.sm }}>🏆</Text>
                        ) : null}
                      </Row>
                    );
                  })
              )}
            </Card>
          );
        })}

        <Button
          label="Save as routine"
          variant="secondary"
          onPress={() => setSaving(true)}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          label="Delete workout"
          variant="ghost"
          onPress={confirmDelete}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>

      <PromptModal
        visible={renaming === 'name'}
        title="Workout name"
        initialValue={workout.name}
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => {
          setRenaming(null);
          if (name.trim().length === 0) return;
          void updateWorkoutMeta(workout.id, { name: name.trim() }).then(reload);
        }}
      />

      <PromptModal
        visible={renaming === 'notes'}
        title="Workout notes"
        initialValue={workout.notes ?? ''}
        onCancel={() => setRenaming(null)}
        onSubmit={(notes) => {
          setRenaming(null);
          void updateWorkoutMeta(workout.id, {
            notes: notes.trim() === '' ? null : notes,
          }).then(reload);
        }}
      />

      <PromptModal
        visible={saving}
        title="Routine name"
        initialValue={workout.name}
        onCancel={() => setSaving(false)}
        onSubmit={(name) => {
          setSaving(false);
          if (name.trim().length === 0) return;
          void createRoutineFromWorkout(workout.id, name).then((id) =>
            navigation.navigate('RoutineEditor', { routineId: id }),
          );
        }}
      />
    </>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View>
      <Caption>{label}</Caption>
      <Text
        style={{
          color: palette.text,
          fontSize: fontSize.lg,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  setRow: { paddingVertical: spacing.xs },
});
