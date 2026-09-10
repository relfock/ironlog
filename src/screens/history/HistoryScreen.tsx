import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { Body, Caption, Card, EmptyState, H1, H2, Row } from '@/components/ui';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useWorkoutHrStatsMap } from '@/hooks/useWorkoutHrStats';
import { formatDurationCompact, formatWeight } from '@/domain/units';
import { dailyStreak, groupByWeek, weeklyStreak } from '@/domain/streak';
import { DEFAULT_HR_ZONES } from '@/domain/heartRateZones';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export const HistoryScreen = observer(function HistoryScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const settings = useSettings();
  const { workouts, loading } = useWorkoutHistory();
  const hrStatsMap = useWorkoutHrStatsMap();

  const dates = useMemo(
    () => workouts.map((w) => w.startedAt).sort((a, b) => a - b),
    [workouts],
  );

  const { weekStart, weeklyWorkoutGoal, weightUnit } = settings.values;

  const streak = useMemo(() => {
    const buckets = groupByWeek(dates, weekStart);
    return weeklyStreak(buckets, weeklyWorkoutGoal, weekStart);
  }, [dates, weekStart, weeklyWorkoutGoal]);

  const days = useMemo(() => dailyStreak(dates), [dates]);

  if (!loading && workouts.length === 0) {
    return (
      <EmptyState
        title="No workouts yet"
        message="Finish your first session and it will appear here, along with your calendar and streaks."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <H1>History</H1>

      <Card style={{ marginTop: spacing.lg }}>
        <H2>Consistency</H2>
        <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
          <Metric
            label="WEEK STREAK"
            value={String(streak.currentWeeks)}
            hint={streak.currentWeekPending ? 'this week pending' : undefined}
          />
          <Metric label="BEST" value={String(streak.longestWeeks)} hint="weeks" />
          <Metric label="DAY STREAK" value={String(days)} hint="days" />
          <Metric label="TOTAL" value={String(workouts.length)} hint="workouts" />
        </Row>
        <View style={{ marginTop: spacing.lg }}>
          <CalendarHeatmap timestamps={dates} weekStart={weekStart} />
        </View>
        <Caption style={{ marginTop: spacing.sm }}>
          Goal: {weeklyWorkoutGoal} workout{weeklyWorkoutGoal === 1 ? '' : 's'} per week
        </Caption>
      </Card>

      <H2 style={{ marginTop: spacing.xl }}>All workouts</H2>

      {workouts.map((w) => (
        <Card
          key={w.id}
          style={{ marginTop: spacing.md }}
          onPress={() => navigation.navigate('WorkoutDetail', { workoutId: w.id })}
          accessibilityLabel={`${w.name}, ${new Date(w.startedAt).toLocaleDateString()}`}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <H2>{w.name}</H2>
              <Caption style={{ marginTop: 2 }}>
                {new Date(w.startedAt).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Caption>
            </View>
            {w.prCount > 0 ? (
              <Body style={{ color: palette.success }}>
                🏆 {w.prCount}
              </Body>
            ) : null}
          </Row>

          <Row style={{ marginTop: spacing.md }} gap={spacing.xl}>
            <Metric
              label="TIME"
              value={formatDurationCompact(w.durationSec ?? 0)}
            />
            {w.kind === 'activity' ? (
              (() => {
                const stats = hrStatsMap.get(w.id);
                if (!stats) return null;
                const dominantIdx = stats.zoneSec.indexOf(
                  Math.max(...stats.zoneSec),
                );
                const dominantSec = stats.zoneSec[dominantIdx] ?? 0;
                const zone = DEFAULT_HR_ZONES[dominantIdx];
                return (
                  <>
                    <Metric label="AVG BPM" value={String(stats.avgBpm)} />
                    {dominantSec > 0 && zone ? (
                      <Metric
                        label={zone.name.toUpperCase()}
                        value={`${Math.round(dominantSec / 60)} min`}
                      />
                    ) : null}
                  </>
                );
              })()
            ) : (
              <>
                <Metric
                  label="VOLUME"
                  value={`${formatWeight(w.totalVolumeKg, weightUnit)} ${weightUnit}`}
                />
                <Metric label="SETS" value={String(w.totalSets)} />
              </>
            )}
          </Row>
        </Card>
      ))}
    </ScrollView>
  );
});

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const palette = usePalette();
  return (
    <View>
      <Caption>{label}</Caption>
      <Body style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Body>
      {hint !== undefined ? (
        <Caption style={{ color: palette.textFaint }}>{hint}</Caption>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
