import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ExerciseVideo } from '@/components/ExerciseVideo';
import { MuscleMap } from '@/components/MuscleMap';
import { LineChartCard } from '@/components/charts/LineChartCard';
import { PromptModal } from '@/components/PromptModal';
import { Body, Button, Caption, Card, H1, H2, Pill, Row } from '@/components/ui';
import { equipmentLabel } from '@/components/ExerciseListItem';
import { exerciseBySlug } from '@/data/exercises';
import {
  deleteExercise,
  getRecordBook,
  updateExercise,
} from '@/db/repositories/exercises';
import { ALL_PR_KINDS, PR_KIND_LABELS, type PrKind } from '@/domain/prDetection';
import { MUSCLE_LABELS } from '@/domain/muscleMap';
import { estimateOneRepMax } from '@/domain/oneRepMax';
import { formatAxisTick, formatDuration, formatWeight, fromKg } from '@/domain/units';
import { useExercise } from '@/hooks/useExercises';
import { useExerciseProgress } from '@/hooks/useStatistics';
import type { RootStackParamList } from '@/navigation/types';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

type Metric = 'weight' | 'volume' | 'reps' | 'est1rm';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'weight', label: 'Heaviest set' },
  { key: 'est1rm', label: 'Est. 1RM' },
  { key: 'volume', label: 'Session volume' },
  { key: 'reps', label: 'Total reps' },
];

/**
 * Card padding plus the scroll view's own padding, so the video can be sized to
 * bleed to the card's edges instead of sitting inside its padding.
 */
const CARD_INSET = spacing.lg * 2;

export const ExerciseDetailScreen = observer(function ExerciseDetailScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExerciseDetail'>>();
  const settings = useSettings();
  const { width: windowWidth } = useWindowDimensions();
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

  /**
   * The bundled catalogue entry, which carries everything the database does not
   * store: the demonstration video key, the muscle-art region map, the how-to
   * steps and the form mistakes. Custom exercises have no entry, so every
   * consumer below has to tolerate `null`.
   *
   * `artKey` rather than `seedSlug` is the lookup key because it is the column
   * the rest of the app denormalises onto workout and routine rows.
   */
  const entry = useMemo(() => exerciseBySlug(exercise?.artKey), [exercise?.artKey]);

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

  const videoWidth = windowWidth - CARD_INSET;

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>{exercise.name}</H1>
        <Row style={{ marginTop: spacing.xs }} gap={spacing.sm}>
          <Pill label={equipmentLabel(exercise.equipment).toUpperCase()} />
          {exercise.isCustom ? <Pill label="CUSTOM" tone={palette.accent} /> : null}
          {exercise.archived ? <Pill label="HIDDEN" tone={palette.warning} /> : null}
        </Row>

        {/* Autoplays on mount: opening the screen IS the request to see the
            movement, so making the user tap play first is pure friction. It is
            muted and looping, so autoplay costs nothing if they came for the
            numbers instead. */}
        {entry !== null ? (
          <Card style={styles.videoCard}>
            <ExerciseVideo slug={entry.slug} width={videoWidth} autoPlay loop />
          </Card>
        ) : null}

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
          {/* One drawing, front and back together — no flip control, because
              the whole point of this artwork over the old body map is that both
              views are visible at once. */}
          <View style={{ alignItems: 'center', marginTop: spacing.md }}>
            <MuscleMap
              regions={entry?.regions}
              primary={exercise.primary}
              secondary={exercise.secondary}
              size={280}
            />
          </View>
          <Row gap={spacing.lg} style={styles.legend}>
            <LegendSwatch color={palette.bodyPrimary} label="Primary" />
            <LegendSwatch color={palette.bodySecondary} label="Secondary" />
          </Row>
        </Card>

        {entry !== null && entry.instructions.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <H2>How to do it</H2>
            {entry.instructions.map((step, i) => (
              <Row key={i} gap={spacing.sm} style={styles.step}>
                <Text
                  style={[
                    styles.stepNumber,
                    { color: palette.accent, backgroundColor: palette.surfaceRaised },
                  ]}
                >
                  {i + 1}
                </Text>
                <Body style={styles.stepText}>{step}</Body>
              </Row>
            ))}
          </Card>
        ) : null}

        {entry !== null && entry.mistakes.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <H2>Common form mistakes</H2>
            {entry.mistakes.map((m) => (
              <View key={m.title} style={{ marginTop: spacing.md }}>
                <Body style={{ fontWeight: '700' }}>{m.title}</Body>
                <Body muted style={{ marginTop: 2 }}>
                  {m.body}
                </Body>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={{ marginTop: spacing.md }}>
          <H2>Personal records</H2>
          {records.size === 0 ? (
            <Caption style={{ marginTop: spacing.sm }}>
              No records yet — complete a set of this exercise.
            </Caption>
          ) : (
            ALL_PR_KINDS.filter((k) => records.has(k)).map((k) => (
              <Row
                key={k}
                style={{ justifyContent: 'space-between', paddingVertical: 4 }}
              >
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
              style={{
                color: palette.accent,
                fontSize: fontSize.sm,
                fontWeight: '700',
              }}
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

        {entry !== null ? (
          <Caption style={styles.attribution}>
            Demonstration and form notes from {entry.url}
          </Caption>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={editingNotes}
        title="Exercise notes"
        initialValue={exercise.notes ?? ''}
        placeholder="e.g. Elbows tucked, pause on chest"
        onCancel={() => setEditingNotes(false)}
        onSubmit={(notes) => {
          setEditingNotes(false);
          void updateExercise(exercise.id, {
            notes: notes.trim() === '' ? null : notes,
          });
        }}
      />
    </>
  );
});

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <Row gap={spacing.xs}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Caption>{label}</Caption>
    </Row>
  );
}

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
  // Zero padding so the video reaches the card's rounded edges.
  videoCard: {
    marginTop: spacing.lg,
    padding: 0,
    overflow: 'hidden',
  },
  legend: { justifyContent: 'center', marginTop: spacing.md },
  swatch: { width: 12, height: 12, borderRadius: radius.sm },
  step: { alignItems: 'flex-start', marginTop: spacing.md },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: fontSize.xs,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stepText: { flex: 1 },
  attribution: { marginTop: spacing.xl, textAlign: 'center' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
