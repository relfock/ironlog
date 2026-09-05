import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { HeatmapInfoModal } from '@/components/HeatmapInfoModal';
import { HeatmapKey } from '@/components/HeatmapKey';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { WeekCalendarSheet } from '@/components/WeekCalendarSheet';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { buildHeatmap } from '@/domain/muscleMap';
import {
  formatWeekSpan,
  groupByWeek,
  startOfLocalWeek,
  weeklyStreak,
  WEEK_MS,
} from '@/domain/streak';
import { formatDurationCompact, formatWeight } from '@/domain/units';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useMuscleWeek } from '@/hooks/useMuscleWeek';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { buildBodyHeatScale } from '@/theme/heatScale';
import { fontSize, radius, spacing } from '@/theme/tokens';

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
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfLocalWeek(Date.now(), weekStart),
  );
  const { setsPerMuscle, reload: reloadMuscle } = useMuscleWeek(selectedWeekStart);
  const [infoOpen, setInfoOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const thisWeekStart = startOfLocalWeek(Date.now(), weekStart);
  const atCurrentWeek = selectedWeekStart >= thisWeekStart;

  const shiftWeek = (delta: number) => {
    setSelectedWeekStart((prev) => {
      const next = prev + delta * WEEK_MS;
      return atCurrentWeek && delta > 0 ? prev : next;
    });
  };

  // The heatmap must always reflect edits made on other screens (history edit,
  // replace/remove exercise). Re-read it every time this tab regains focus, so
  // no DB-change-listener race or miss can leave it stale.
  useFocusEffect(
    useCallback(() => {
      reloadMuscle();
    }, [reloadMuscle]),
  );

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

  const heatScale = useMemo(() => buildBodyHeatScale(palette), [palette]);

  const heat = useMemo(
    () => buildHeatmap(setsPerMuscle, heatScale.length),
    [setsPerMuscle, heatScale.length],
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

        <Card style={{ marginTop: spacing.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <H2 style={{ flexShrink: 1 }}>Muscle heatmap</H2>
            <View style={[styles.weekNav, { borderColor: palette.border }]}>
              <Pressable
                onPress={() => shiftWeek(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                hitSlop={8}
                style={styles.weekNavSide}
              >
                <Text style={[styles.weekNavArrow, { color: palette.text }]}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => setCalendarOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose a different week"
                hitSlop={8}
              >
                <Text style={[styles.weekNavLabel, { color: palette.accent }]}>
                  {formatWeekSpan(selectedWeekStart)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => shiftWeek(1)}
                accessibilityRole="button"
                accessibilityLabel="Next week"
                hitSlop={8}
                disabled={atCurrentWeek}
                style={[styles.weekNavSide, { opacity: atCurrentWeek ? 0.35 : 1 }]}
              >
                <Text style={[styles.weekNavArrow, { color: palette.text }]}>›</Text>
              </Pressable>
            </View>
          </Row>
          <HeatmapKey />
          {heat.length === 0 ? (
            <Caption style={{ marginTop: spacing.md }}>No completed sets this week.</Caption>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: spacing.md,
                marginTop: spacing.md,
              }}
            >
              <BodyMap parts={heat} side="front" scale={0.75} colors={heatScale} />
              <BodyMap parts={heat} side="back" scale={0.75} colors={heatScale} />
            </View>
          )}
          <HeatmapLegend colors={heatScale} />
          <Pressable
            onPress={() => setInfoOpen(true)}
            accessibilityRole="button"
            hitSlop={8}
            style={{ alignSelf: 'flex-end', marginTop: spacing.md }}
          >
            <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
              More info ›
            </Text>
          </Pressable>
          <HeatmapInfoModal visible={infoOpen} colors={heatScale} onClose={() => setInfoOpen(false)} />
          <WeekCalendarSheet
            visible={calendarOpen}
            selectedWeekStartMs={selectedWeekStart}
            weekStart={weekStart}
            onSelectWeek={(ms) => {
              setSelectedWeekStart(ms);
              setCalendarOpen(false);
            }}
            onClose={() => setCalendarOpen(false)}
          />
        </Card>

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
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  weekNavSide: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  weekNavArrow: { fontSize: fontSize.md, fontWeight: '700', lineHeight: fontSize.md + 2 },
  weekNavLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
  },
});
