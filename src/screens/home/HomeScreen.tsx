import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { buildHeatmap } from '@/domain/muscleMap';
import { groupByWeek, startOfLocalWeek, weeklyStreak } from '@/domain/streak';
import { formatDurationCompact, formatWeight } from '@/domain/units';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useStatistics } from '@/hooks/useStatistics';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

/**
 * Dashboard. Hevy puts a social feed on this tab; with the social half removed
 * it becomes the user's own overview — resume banner, this week's progress,
 * consistency, muscle balance and recent sessions.
 */
export const HomeScreen = observer(function HomeScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const settings = useSettings();
  const active = useActiveWorkout();
  const { workouts } = useWorkoutHistory(60);
  const { weekStart, weeklyWorkoutGoal, weightUnit } = settings.values;
  const { muscle } = useStatistics(weekStart, 4);

  const dates = useMemo(
    () => workouts.map((w) => w.startedAt).sort((a, b) => a - b),
    [workouts],
  );

  const thisWeek = useMemo(() => {
    const start = startOfLocalWeek(Date.now(), weekStart);
    const inWeek = workouts.filter((w) => w.startedAt >= start);
    return {
      count: inWeek.length,
      volume: inWeek.reduce((n, w) => n + w.totalVolumeKg, 0),
      sets: inWeek.reduce((n, w) => n + w.totalSets, 0),
      minutes: Math.round(inWeek.reduce((n, w) => n + (w.durationSec ?? 0), 0) / 60),
    };
  }, [workouts, weekStart]);

  const streak = useMemo(
    () => weeklyStreak(groupByWeek(dates, weekStart), weeklyWorkoutGoal, weekStart),
    [dates, weekStart, weeklyWorkoutGoal],
  );

  const heat = useMemo(
    () => buildHeatmap(muscle.setsPerMuscle, palette.heatRamp.length),
    [muscle.setsPerMuscle, palette.heatRamp.length],
  );

  const goalProgress = Math.min(1, thisWeek.count / Math.max(1, weeklyWorkoutGoal));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>IronLog</H1>
        <Caption>{greeting()}</Caption>

        {active.isActive ? (
          <Card
            style={{
              marginTop: spacing.lg,
              borderColor: palette.accent,
              borderWidth: 1.5,
            }}
          >
            <H2>Workout in progress</H2>
            <Body muted style={{ marginTop: spacing.xs }}>
              {active.completedSetCount} of {active.totalSetCount} sets ·{' '}
              {formatDurationCompact(active.elapsedSec)} elapsed
            </Body>
            <Button
              label="Resume workout"
              onPress={() => navigation.navigate('ActiveWorkout')}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        ) : (
          <Button
            label="Start a workout"
            onPress={() => navigation.navigate('Tabs', { screen: 'StartWorkout' })}
            style={{ marginTop: spacing.lg }}
          />
        )}

        <Card style={{ marginTop: spacing.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>This week</H2>
            <Caption>
              {thisWeek.count} / {weeklyWorkoutGoal} workouts
            </Caption>
          </Row>

          <View style={[styles.track, { backgroundColor: palette.surfaceRaised }]}>
            <View
              style={{
                height: '100%',
                borderRadius: 5,
                width: `${goalProgress * 100}%`,
                backgroundColor:
                  goalProgress >= 1 ? palette.success : palette.accent,
              }}
            />
          </View>

          <Row style={{ marginTop: spacing.lg, justifyContent: 'space-between' }}>
            <Stat
              label="VOLUME"
              value={`${formatWeight(thisWeek.volume, weightUnit)}`}
              hint={weightUnit}
            />
            <Stat label="SETS" value={String(thisWeek.sets)} />
            <Stat label="TIME" value={`${thisWeek.minutes}`} hint="min" />
            <Stat
              label="STREAK"
              value={String(streak.currentWeeks)}
              hint={streak.currentWeekPending ? 'pending' : 'weeks'}
            />
          </Row>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <H2>Consistency</H2>
          <View style={{ marginTop: spacing.md }}>
            <CalendarHeatmap timestamps={dates} weekStart={weekStart} />
          </View>
        </Card>

        {heat.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <H2>Last 4 weeks</H2>
            <Caption>Where your volume has gone</Caption>
            <View style={{ alignItems: 'center', marginTop: spacing.md }}>
              <BodyMap parts={heat} allowFlip scale={0.75} />
            </View>
          </Card>
        ) : null}

        <Row style={{ marginTop: spacing.xl, justifyContent: 'space-between' }}>
          <H2>Recent workouts</H2>
          <Text
            onPress={() => navigation.navigate('History')}
            accessibilityRole="button"
            style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}
          >
            See all
          </Text>
        </Row>

        {workouts.length === 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Body muted>
              Nothing logged yet. Start an empty workout and add exercises as you go — or
              build a routine first if you already know the plan.
            </Body>
          </Card>
        ) : (
          workouts.slice(0, 5).map((w) => (
            <Card
              key={w.id}
              style={{ marginTop: spacing.md }}
              onPress={() => navigation.navigate('WorkoutDetail', { workoutId: w.id })}
              accessibilityLabel={w.name}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <H2>{w.name}</H2>
                  <Caption style={{ marginTop: 2 }}>
                    {new Date(w.startedAt).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' · '}
                    {formatDurationCompact(w.durationSec ?? 0)}
                    {' · '}
                    {w.totalSets} sets
                  </Caption>
                </View>
                {w.prCount > 0 ? (
                  <Text style={{ color: palette.success, fontSize: fontSize.md }}>
                    🏆 {w.prCount}
                  </Text>
                ) : null}
              </Row>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
});

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}

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
  track: { height: 10, borderRadius: 5, marginTop: spacing.md, overflow: 'hidden' },
});
