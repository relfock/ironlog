import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { MuscleMap } from '@/components/MuscleMap';
import { NumberField } from '@/components/NumberField';
import { ActionSheet } from '@/components/ActionSheet';
import { PromptModal } from '@/components/PromptModal';
import { HeartRateChartCard } from '@/components/charts/HeartRateChartCard';
import { Body, Button, Caption, Card, H1, H2, Pill, Row } from '@/components/ui';
import { setTypeLabel } from '@/components/SetTypeBadge';
import { exerciseBySlug } from '@/data/exercises';
import { createRoutineFromWorkout } from '@/db/repositories/routines';
import { loadWorkoutHeartRateSamples } from '@/db/repositories/heartRate';
import type { WorkoutHeartRateSampleRow } from '@/db/schema';
import {
  deleteSet,
  discardWorkout,
  loadWorkout,
  recomputeWorkoutTotals,
  removeWorkoutExercise,
  updateSet,
  updateWorkoutMeta,
  type WorkoutData,
} from '@/db/repositories/workouts';
import type { Muscle } from '@/domain/types';
import { summariseHeartRate } from '@/domain/heartRate';
import { estimateMaxHr, zoneSplitSeconds } from '@/domain/heartRateZones';
import {
  formatDuration,
  formatDurationCompact,
  formatWeight,
  fromKg,
  toKg,
} from '@/domain/units';
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
  const [hrSamples, setHrSamples] = useState<WorkoutHeartRateSampleRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<'name' | 'notes' | null>(null);
  const [menuWeId, setMenuWeId] = useState<string | null>(null);
  const exerciseCardRefs = useRef<Map<string, View>>(new Map());
  const scrollRef = useRef<ScrollView>(null);

  const reload = useCallback(() => {
    void loadWorkout(route.params.workoutId).then(setWorkout);
    void loadWorkoutHeartRateSamples(route.params.workoutId).then(setHrSamples);
  }, [route.params.workoutId]);

  const highlightId = route.params.highlightExerciseId;

  useEffect(() => {
    if (highlightId === undefined || workout === null) return;
    const timer = setTimeout(() => {
      exerciseCardRefs.current.get(highlightId)?.measureLayout(
        scrollRef.current as unknown as number,
        (_x, y) =>
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }),
        () => {},
      );
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightId, workout]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const unit = settings.values.weightUnit;

  // Same profile-based estimate as the zone model, so the HR curve's band
  // edges line up with the zone minutes below it.
  const estimatedMaxHr = (() => {
    if (settings.values.birthYear === null) return undefined;
    const age = new Date().getFullYear() - settings.values.birthYear;
    if (age <= 0) return undefined;
    return estimateMaxHr(age, settings.values.sex) ?? undefined;
  })();

  if (workout === null) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Caption>Loading…</Caption>
      </ScrollView>
    );
  }

  // Cardio ("activity") sessions have no sets/volume/PRs, so the summary
  // card and "Save as routine" affordance are meaningless there.
  const isActivity = workout.kind === 'activity';

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
      {isActivity ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}>
          {hrSamples.length >= 1 ? (
            <View>
              <HeartRateChartCard
                title={workout.name}
                subtitle={formatActivityTime(workout)}
                samples={hrSamples}
                maxHr={estimatedMaxHr}
                chartHeight={380}
              />
              <ZoneBreakdown
                workout={workout}
                samples={hrSamples}
                maxHr={estimatedMaxHr}
                palette={palette}
              />
            </View>
          ) : (
            <Body muted style={{ marginTop: spacing.xl }}>
              No heart rate data recorded.
            </Body>
          )}
          <Button
            label="Delete workout"
            variant="ghost"
            onPress={confirmDelete}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
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

          {!isActivity ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Stat
                  label="DURATION"
                  value={formatDurationCompact(workout.durationSec ?? 0)}
                />
                <Stat
                  label="VOLUME"
                  value={`${formatWeight(workout.totalVolumeKg, unit)} ${unit}`}
                />
                <Stat label="SETS" value={String(workout.totalSets)} />
                <Stat label="PRs" value={String(workout.prCount)} />
              </Row>
            </Card>
          ) : null}

          {hrSamples.length >= 1 ? (
            <Card style={{ marginTop: spacing.md }}>
              <HeartRateChartCard samples={hrSamples} maxHr={estimatedMaxHr} />
              <ZoneBreakdown
                workout={workout}
                samples={hrSamples}
                maxHr={estimatedMaxHr}
                palette={palette}
              />
            </Card>
          ) : null}

          {editing ? (
            <Card style={{ marginTop: spacing.md }}>
              <Caption>EDITING</Caption>
              <Body muted style={{ marginTop: spacing.xs, fontSize: fontSize.sm }}>
                Correct a mistyped weight or rep count below, or long-press a set to
                remove it. Totals are recalculated as you go.
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
                Personal records are not recalculated: a record may since have been beaten
                in a later session, so rewriting history here could wrongly demote it.
              </Caption>
            </Card>
          ) : null}

          {workout.notes !== null && workout.notes.length > 0 ? (
            <Card style={{ marginTop: spacing.md }}>
              <Caption>NOTES</Caption>
              <Body style={{ marginTop: spacing.xs }}>{workout.notes}</Body>
            </Card>
          ) : null}

          {workout.exercises
            .filter((we) => we.sets.some((s) => s.completed))
            .map((we) => {
              const regions = exerciseBySlug(we.artKey)?.regions ?? null;
              const isHighlighted = highlightId === we.exerciseId;
              let working = 0;
              return (
                <View
                  key={we.id}
                  ref={(v) => {
                    if (v) exerciseCardRefs.current.set(we.exerciseId, v);
                  }}
                >
                  <Card
                    style={{
                      marginTop: spacing.md,
                      ...(isHighlighted
                        ? { borderColor: palette.accent, borderWidth: 2 }
                        : {}),
                    }}
                  >
                    <Row style={{ alignItems: 'flex-start' }}>
                      <MuscleMap
                        regions={regions}
                        primary={we.primaryMuscles as Muscle[]}
                        secondary={we.secondaryMuscles as Muscle[]}
                        size={54}
                      />
                      <View style={{ flex: 1 }}>
                        <Pressable
                          onPress={() =>
                            navigation.navigate('ExerciseDetail', {
                              exerciseId: we.exerciseId,
                            })
                          }
                          accessibilityLabel={`${we.exerciseName} details`}
                        >
                          <H2>{we.exerciseName}</H2>
                        </Pressable>
                        {we.supersetGroup !== null ? (
                          <Pill
                            label={`SUPERSET ${we.supersetGroup + 1}`}
                            tone={palette.accent}
                          />
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => setMenuWeId(we.id)}
                        hitSlop={10}
                        accessibilityLabel="Exercise menu"
                      >
                        <Text style={{ color: palette.textMuted, fontSize: fontSize.xl }}>
                          ⋯
                        </Text>
                      </Pressable>
                    </Row>

                    {we.sets.filter((s) => s.completed).length === 0 ? (
                      <Caption style={{ marginTop: spacing.sm }}>
                        No completed sets
                      </Caption>
                    ) : (
                      we.sets
                        .filter((s) => s.completed)
                        .map((s) => {
                          if (s.setType === 'normal') working += 1;
                          const bits: string[] = [];
                          if (s.weightKg !== null) {
                            bits.push(
                              `${Math.round(fromKg(s.weightKg, unit) * 100) / 100} ${unit}`,
                            );
                          }
                          if (s.reps !== null) bits.push(`× ${s.reps}`);
                          if (s.durationSec !== null)
                            bits.push(formatDuration(s.durationSec));
                          if (s.distanceM !== null)
                            bits.push(`${Math.round(s.distanceM)} m`);
                          if (s.caloriesKcal !== null)
                            bits.push(`${Math.round(s.caloriesKcal)} kcal`);
                          if (s.avgBpm !== null) bits.push(`${s.avgBpm} bpm avg`);
                          if (s.rpe !== null) bits.push(`RPE ${s.rpe}`);
                          if (editing) {
                            return (
                              <Pressable
                                key={s.id}
                                onLongPress={() =>
                                  Alert.alert(
                                    'Remove set?',
                                    'This set will be deleted.',
                                    [
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
                                    ],
                                  )
                                }
                                accessibilityLabel={`Set ${working}. Long press to remove.`}
                              >
                                <Row style={styles.setRow} gap={spacing.sm}>
                                  <Text
                                    style={{
                                      color: palette.textMuted,
                                      width: 24,
                                      fontWeight: '700',
                                    }}
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
                              <Text
                                style={{
                                  color: palette.textMuted,
                                  width: 24,
                                  fontWeight: '700',
                                }}
                              >
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
                </View>
              );
            })}

          {!isActivity ? (
            <Button
              label="Save as routine"
              variant="secondary"
              onPress={() => setSaving(true)}
              style={{ marginTop: spacing.lg }}
            />
          ) : null}
          <Button
            label="Delete workout"
            variant="ghost"
            onPress={confirmDelete}
            style={{ marginTop: spacing.sm }}
          />
        </ScrollView>
      )}

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

      <ActionSheet
        visible={menuWeId !== null}
        title={workout.exercises.find((we) => we.id === menuWeId)?.exerciseName}
        onClose={() => setMenuWeId(null)}
        actions={
          menuWeId === null
            ? []
            : [
                {
                  key: 'replace',
                  label: 'Replace exercise',
                  onPress: () => {
                    setMenuWeId(null);
                    navigation.navigate('ExercisePicker', {
                      mode: 'replace',
                      targetId: workout.id,
                      replaceWorkoutExerciseId: menuWeId,
                    });
                  },
                },
                {
                  key: 'details',
                  label: 'Exercise details',
                  onPress: () => {
                    const we = workout.exercises.find((e) => e.id === menuWeId);
                    setMenuWeId(null);
                    if (we !== undefined) {
                      navigation.navigate('ExerciseDetail', {
                        exerciseId: we.exerciseId,
                      });
                    }
                  },
                },
                {
                  key: 'remove',
                  label: 'Remove exercise',
                  destructive: true,
                  onPress: () => {
                    const we = workout.exercises.find((e) => e.id === menuWeId);
                    setMenuWeId(null);
                    if (we === undefined) return;
                    Alert.alert(
                      'Remove exercise?',
                      `${we.exerciseName} and its sets will be removed.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () =>
                            void removeWorkoutExercise(we.id)
                              .then(() =>
                                recomputeWorkoutTotals(
                                  workout.id,
                                  settings.values.countWarmupsInStats,
                                ),
                              )
                              .then(reload),
                        },
                      ],
                    );
                  },
                },
              ]
        }
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

function formatZoneSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

/** Date plus start and end clock time for an activity session's subtitle. */
function formatActivityTime(workout: WorkoutData): string {
  const date = new Date(workout.startedAt).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  const start = clock(workout.startedAt);
  const endMs = workout.endedAt ?? workout.startedAt + (workout.durationSec ?? 0) * 1000;
  return `${date} · ${start} – ${endMs > workout.startedAt ? clock(endMs) : '—'}`;
}

/**
 * Post-workout HR zone minutes, derived from the workout's stored HR trace
 * against the CURRENT zone boundaries and profile max HR — the same model the
 * live card tallies, so History always agrees with the session overview. When
 * the trace is missing (session recorded without a strap and without a
 * workout-level sampler) it falls back to the per-zone columns persisted at
 * finish.
 */
function ZoneBreakdown({
  workout,
  samples,
  maxHr,
  palette,
}: {
  workout: WorkoutData;
  samples: readonly WorkoutHeartRateSampleRow[];
  maxHr: number | undefined;
  palette: ReturnType<typeof usePalette>;
}) {
  const zones = useSettings().zoneSet;
  const totals: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

  if (samples.length > 1 && maxHr !== undefined) {
    const derived = zoneSplitSeconds(samples, maxHr, zones);
    if (derived !== null) {
      for (let i = 0; i < totals.length; i++) {
        totals[i] = Math.round(derived[i] ?? 0);
      }
    }
  } else {
    for (const we of workout.exercises) {
      if (we.trackingType !== 'hr_cardio') continue;
      for (const s of we.sets) {
        totals[0] += s.zone0Sec ?? 0;
        totals[1] += s.zone1Sec ?? 0;
        totals[2] += s.zone2Sec ?? 0;
        totals[3] += s.zone3Sec ?? 0;
        totals[4] += s.zone4Sec ?? 0;
        totals[5] += s.zone5Sec ?? 0;
      }
    }
  }

  const total = totals.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const summary = summariseHeartRate(
    samples.map((s) => ({ recordedAt: s.recordedAt, bpm: s.bpm })),
    maxHr,
    zones,
  );

  return (
    <View style={{ marginTop: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Caption>ZONE MINUTES</Caption>
        {summary !== null ? (
          <Text
            style={{
              color: palette.textMuted,
              fontSize: fontSize.xs,
              fontVariant: ['tabular-nums'],
              fontWeight: '700',
            }}
          >
            AVG {summary.avgBpm} · MAX {summary.maxBpm}
          </Text>
        ) : null}
      </View>
      {zones
        .map((z, i) => {
          const t = totals[i] ?? 0;
          if (t <= 0) return null;
          const pct = Math.min(100, (t / total) * 100);
          return (
            <View
              key={z.label}
              style={{
                height: 18,
                marginTop: spacing.xs,
                backgroundColor: palette.border,
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <View
                style={{ height: '100%', width: `${pct}%`, backgroundColor: z.color }}
              />
              <View
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: fontSize.xs,
                    fontWeight: '700',
                  }}
                >
                  {z.label} {z.name}
                </Text>
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: fontSize.xs,
                    fontWeight: '700',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatZoneSeconds(t)}
                </Text>
              </View>
            </View>
          );
        })
        .reverse()}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  setRow: { paddingVertical: spacing.xs },
});
