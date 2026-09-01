import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChartCard } from '@/components/charts/BarChartCard';
import { BodyMap } from '@/components/BodyMap';
import { Body, Caption, Card, EmptyState, H1, H2, Row } from '@/components/ui';
import { MUSCLE_LABELS, buildHeatmap } from '@/domain/muscleMap';
import { formatAxisTick, formatWeight, fromKg } from '@/domain/units';
import { useStatistics } from '@/hooks/useStatistics';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

const LOOKBACK_WEEKS = 12;

export const StatisticsScreen = observer(function StatisticsScreen() {
  const palette = usePalette();
  const settings = useSettings();
  const { weekStart, weightUnit } = settings.values;
  const { weeklyVolume, muscle, totalVolumeKg, totalWorkouts, loading } = useStatistics(
    weekStart,
    LOOKBACK_WEEKS,
  );

  const volumeBars = useMemo(
    () =>
      weeklyVolume.map((w, i) => ({
        x: i,
        value: fromKg(w.volumeKg, weightUnit),
        label:
          i % 2 === 0
            ? new Date(w.weekStartMs).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })
            : '',
      })),
    [weeklyVolume, weightUnit],
  );

  /**
   * Sets per muscle per week — the number most lifters actually programme
   * against. Dividing the window total by its length gives the weekly average.
   *
   * The plotted value is NOT rounded, and there is no minimum threshold. Both
   * were present initially and both destroyed sparse data: with one workout
   * logged, every muscle averages well under 0.1 sets/week, so rounding to one
   * decimal flattened them to zero and a `> 0.05` filter hid all but one. Round
   * for the LABEL, never for the geometry.
   */
  const setsPerWeekBars = useMemo(() => {
    const entries = [...muscle.setsPerMuscle.entries()]
      .map(([m, sets]) => ({ muscle: m, perWeek: sets / LOOKBACK_WEEKS }))
      .filter((e) => e.perWeek > 0)
      .sort((a, b) => b.perWeek - a.perWeek)
      .slice(0, 12);

    return entries.map((e, i) => ({
      x: i,
      value: e.perWeek,
      label: MUSCLE_LABELS[e.muscle],
    }));
  }, [muscle.setsPerMuscle]);

  const heatmapParts = useMemo(
    () => buildHeatmap(muscle.setsPerMuscle, palette.heatRamp.length),
    [muscle.setsPerMuscle, palette.heatRamp.length],
  );

  const topMuscles = useMemo(
    () =>
      [...muscle.distribution.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    [muscle.distribution],
  );

  if (!loading && totalWorkouts === 0) {
    return (
      <EmptyState
        title="No statistics yet"
        message="Charts appear once you have finished a workout or two."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <H1>Statistics</H1>

      <Card style={{ marginTop: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label="WORKOUTS" value={String(totalWorkouts)} />
          <Stat
            label="TOTAL VOLUME"
            value={`${formatWeight(totalVolumeKg, weightUnit)}`}
            hint={weightUnit}
          />
          <Stat
            label="AVG / WEEK"
            value={String(
              Math.round(
                (weeklyVolume.reduce((n, w) => n + w.workoutCount, 0) / LOOKBACK_WEEKS) *
                  10,
              ) / 10,
            )}
            hint="workouts"
          />
        </Row>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <BarChartCard
          title="Volume per week"
          subtitle={`Last ${LOOKBACK_WEEKS} weeks, in ${weightUnit}`}
          data={volumeBars}
          formatY={formatAxisTick}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <BarChartCard
          title="Sets per muscle group"
          subtitle={`Weekly average over ${LOOKBACK_WEEKS} weeks · secondary muscles count half`}
          data={setsPerWeekBars}
          formatY={formatAxisTick}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Muscle heatmap</H2>
        <Caption>Where your volume has gone. Darker means more sets.</Caption>
        {heatmapParts.length === 0 ? (
          <Caption style={{ marginTop: spacing.md }}>No completed sets yet.</Caption>
        ) : (
          <View style={{ alignItems: 'center', marginTop: spacing.md }}>
            <BodyMap parts={heatmapParts} allowFlip scale={0.9} />
          </View>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Muscle distribution</H2>
        <Caption>Share of all credited sets</Caption>
        {topMuscles.length === 0 ? (
          <Caption style={{ marginTop: spacing.md }}>No data yet.</Caption>
        ) : (
          topMuscles.map(([m, fraction]) => (
            <View key={m} style={{ marginTop: spacing.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body>{MUSCLE_LABELS[m]}</Body>
                <Body muted style={{ fontVariant: ['tabular-nums'] }}>
                  {Math.round(fraction * 100)}%
                </Body>
              </Row>
              <View
                style={[styles.track, { backgroundColor: palette.surfaceRaised }]}
              >
                <View
                  style={{
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: palette.accent,
                    width: `${Math.max(2, fraction * 100)}%`,
                  }}
                />
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
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
      {hint !== undefined ? <Caption>{hint}</Caption> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  track: { height: 8, borderRadius: 4, marginTop: spacing.xs, overflow: 'hidden' },
});
