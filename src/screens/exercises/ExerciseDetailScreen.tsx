import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BodyMap } from '@/components/BodyMap';
import { ExerciseArt } from '@/components/ExerciseArt';
import { LineChartCard } from '@/components/charts/LineChartCard';
import { PromptModal } from '@/components/PromptModal';
import { Body, Button, Caption, Card, H1, H2, Pill, Row } from '@/components/ui';
import { equipmentLabel } from '@/components/ExerciseListItem';
import { deleteExercise, getRecordBook, updateExercise } from '@/db/repositories/exercises';
import { ALL_PR_KINDS, PR_KIND_LABELS, type PrKind } from '@/domain/prDetection';
import { MUSCLE_LABELS, buildHighlight } from '@/domain/muscleMap';
import { estimateOneRepMax } from '@/domain/oneRepMax';
import { formatAxisTick, formatDuration, formatWeight, fromKg } from '@/domain/units';
import { useExercise } from '@/hooks/useExercises';
import { useExerciseProgress } from '@/hooks/useStatistics';
import type { RootStackParamList } from '@/navigation/types';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';
import artManifest from '../../../assets/art/manifest.json';

type Metric = 'weight' | 'volume' | 'reps' | 'est1rm';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'weight', label: 'Heaviest set' },
  { key: 'est1rm', label: 'Est. 1RM' },
  { key: 'volume', label: 'Session volume' },
  { key: 'reps', label: 'Total reps' },
];

export const ExerciseDetailScreen = observer(function ExerciseDetailScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExerciseDetail'>>();
  const settings = useSettings();
  const exercise = useExercise(route.params.exerciseId);
  const { points, loading } = useExerciseProgress(route.params.exerciseId);
  const [records, setRecords] = useState<Map<PrKind, number>>(new Map());
  const [metric, setMetric] = useState<Metric>('weight');
  const [editingNotes, setEditingNotes] = useState(false);

  const unit = settings.values.weightUnit;
  const formula = settings.values.oneRepMaxFormula;

  const reloadRecords = useCallback(() => {
    void getRecordBook(route.params.exerciseId).then(setRecords);
  }, [route.params.exerciseId]);

  useEffect(reloadRecords, [reloadRecords]);

  const parts = useMemo(
    () =>
      exercise === null ? [] : buildHighlight(exercise.primary, exercise.secondary),
    [exercise],
  );

  const attribution = useMemo(() => {
    if (exercise?.artKey == null) return null;
    const entries = (artManifest as {
      entries: { exerciseSlug: string; artist: string; license: string }[];
    }).entries;
    return entries.find((e) => e.exerciseSlug === exercise.artKey) ?? null;
  }, [exercise]);

  const series = useMemo(() => {
    return points
      .map((p) => {
        let y: number | null = null;
        switch (metric) {
          case 'weight':
            y = p.maxWeightKg === null ? null : fromKg(p.maxWeightKg, unit);
            break;
          case 'volume':
            y = p.totalVolumeKg === 0 ? null : fromKg(p.totalVolumeKg, unit);
            break;
          case 'reps':
            y = p.totalReps === 0 ? null : p.totalReps;
            break;
          case 'est1rm': {
            if (p.maxWeightKg === null || p.bestReps === null) break;
            const orm = estimateOneRepMax(p.maxWeightKg, p.bestReps, formula);
            y = orm === null ? null : fromKg(orm, unit);
            break;
          }
        }
        return y === null ? null : { x: p.at, y };
      })
      .filter((p): p is { x: number; y: number } => p !== null);
  }, [points, metric, unit, formula]);

  if (exercise === null) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Caption>Loading…</Caption>
      </ScrollView>
    );
  }

  const confirmDelete = () => {
    const custom = exercise.isCustom;
    Alert.alert(
      custom ? 'Delete exercise?' : 'Hide exercise?',
      custom
        ? 'This custom exercise will be removed. Past workouts that used it are kept.'
        : 'Built-in exercises cannot be deleted because your history references them. It will be hidden from the library instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: custom ? 'Delete' : 'Hide',
          style: 'destructive',
          onPress: () => void deleteExercise(exercise.id).then(() => navigation.goBack()),
        },
      ],
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>{exercise.name}</H1>
        <Row style={{ marginTop: spacing.xs }} gap={spacing.sm}>
          <Pill label={equipmentLabel(exercise.equipment).toUpperCase()} />
          {exercise.isCustom ? <Pill label="CUSTOM" tone={palette.accent} /> : null}
          {exercise.archived ? <Pill label="HIDDEN" tone={palette.warning} /> : null}
        </Row>

        <Card style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          {/* Animated here — this is the one place the two-frame start/end
              illustration genuinely helps teach the movement. */}
          <ExerciseArt artKey={exercise.artKey} parts={parts} size={220} animate />
          {attribution !== null ? (
            <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
              Illustration by {attribution.artist} · {attribution.license}
            </Caption>
          ) : null}
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <H2>Muscles worked</H2>
          <Body muted style={{ marginTop: spacing.xs }}>
            Primary: {exercise.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}
          </Body>
          {exercise.secondary.length > 0 ? (
            <Body muted style={{ marginTop: 2 }}>
              Secondary: {exercise.secondary.map((m) => MUSCLE_LABELS[m]).join(', ')}
            </Body>
          ) : null}
          <View style={{ alignItems: 'center', marginTop: spacing.md }}>
            <BodyMap parts={parts} allowFlip scale={0.8} />
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <H2>Personal records</H2>
          {records.size === 0 ? (
            <Caption style={{ marginTop: spacing.sm }}>
              No records yet — complete a set of this exercise.
            </Caption>
          ) : (
            ALL_PR_KINDS.filter((k) => records.has(k)).map((k) => (
              <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                <Body muted>{PR_KIND_LABELS[k]}</Body>
                <Body style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {formatRecord(k, records.get(k)!, unit)}
                </Body>
              </Row>
            ))
          )}
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Row gap={spacing.xs} style={{ flexWrap: 'wrap', marginBottom: spacing.sm }}>
            {METRICS.map((m) => {
              const on = metric === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMetric(m.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? palette.accent : palette.surfaceRaised,
                      borderColor: on ? palette.accent : palette.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: on ? palette.accentText : palette.textMuted,
                      fontSize: fontSize.sm,
                      fontWeight: '600',
                    }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>

          <LineChartCard
            title="Progression"
            subtitle={
              loading
                ? 'Loading…'
                : `${points.length} session${points.length === 1 ? '' : 's'} logged`
            }
            data={series}
            formatY={formatAxisTick}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Notes</H2>
            <Text
              onPress={() => setEditingNotes(true)}
              accessibilityRole="button"
              style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}
            >
              Edit
            </Text>
          </Row>
          <Body muted style={{ marginTop: spacing.xs }}>
            {exercise.notes !== null && exercise.notes.length > 0
              ? exercise.notes
              : 'No notes. Add a cue, a setup reminder, or a link to a form video.'}
          </Body>
        </Card>

        {exercise.isCustom ? (
          <Button
            label="Edit exercise"
            variant="secondary"
            onPress={() =>
              navigation.navigate('CustomExercise', { exerciseId: exercise.id })
            }
            style={{ marginTop: spacing.lg }}
          />
        ) : null}

        <Button
          label={exercise.isCustom ? 'Delete exercise' : 'Hide from library'}
          variant="ghost"
          onPress={confirmDelete}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>

      <PromptModal
        visible={editingNotes}
        title="Exercise notes"
        initialValue={exercise.notes ?? ''}
        placeholder="e.g. Elbows tucked, pause on chest"
        onCancel={() => setEditingNotes(false)}
        onSubmit={(notes) => {
          setEditingNotes(false);
          void updateExercise(exercise.id, { notes: notes.trim() === '' ? null : notes });
        }}
      />
    </>
  );
});

function formatRecord(kind: PrKind, value: number, unit: 'kg' | 'lb'): string {
  switch (kind) {
    case 'max_weight':
    case 'best_1rm':
      return `${formatWeight(value, unit)} ${unit}`;
    case 'best_set_volume':
      return `${formatWeight(value, unit)} ${unit}`;
    case 'max_reps':
      return `${value} reps`;
    case 'max_duration':
      return formatDuration(value);
    case 'max_distance':
      return `${Math.round(value)} m`;
  }
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
