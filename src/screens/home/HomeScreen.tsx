import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { HeatmapInfoModal } from '@/components/HeatmapInfoModal';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { RecoveryInfoModal } from '@/components/RecoveryInfoModal';
import { RecoveryLegend } from '@/components/RecoveryLegend';
import { WeekCalendarSheet } from '@/components/WeekCalendarSheet';
import { Body, Button, Caption, Card, H1, H2 } from '@/components/ui';
import { buildHeatmap } from '@/domain/muscleMap';
import { formatWeekSpan, startOfLocalWeek, weekYear, WEEK_MS } from '@/domain/streak';
import { formatDurationCompact } from '@/domain/units';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useMuscleRecovery } from '@/hooks/useMuscleRecovery';
import { useMuscleWeek } from '@/hooks/useMuscleWeek';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { buildBodyHeatScale } from '@/theme/heatScale';
import { buildRecoveryScale } from '@/theme/recoveryScale';
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
  const { weekStart } = settings.values;
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfLocalWeek(Date.now(), weekStart),
  );
  const { setsPerMuscle, reload: reloadMuscle } = useMuscleWeek(selectedWeekStart);
  const { parts: recoveryParts, hasHistory: recoveryHasHistory, reload: reloadRecovery } =
    useMuscleRecovery();
  const [infoOpen, setInfoOpen] = useState(false);
  const [recoveryInfoOpen, setRecoveryInfoOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const thisWeekStart = startOfLocalWeek(Date.now(), weekStart);
  const atCurrentWeek = selectedWeekStart >= thisWeekStart;

  const shiftWeek = (delta: number) => {
    setSelectedWeekStart((prev) => {
      const next = prev + delta * WEEK_MS;
      return atCurrentWeek && delta > 0 ? prev : next;
    });
  };

  // The heatmap and recovery map must always reflect edits made on other
  // screens (history edit, replace/remove exercise). Re-read them every time
  // this tab regains focus, so no DB-change-listener race can leave them stale.
  useFocusEffect(
    useCallback(() => {
      reloadMuscle();
      reloadRecovery();
    }, [reloadMuscle, reloadRecovery]),
  );

  const dates = useMemo(
    () => workouts.map((w) => w.startedAt).sort((a, b) => a - b),
    [workouts],
  );

  const heatScale = useMemo(() => buildBodyHeatScale(palette), [palette]);
  const recoveryScale = useMemo(() => buildRecoveryScale(palette), [palette]);

  const heat = useMemo(
    () => buildHeatmap(setsPerMuscle, heatScale.length),
    [setsPerMuscle, heatScale.length],
  );

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
        ) : null}

        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.cardHeader}>
            <H2>Muscle heatmap</H2>
            <View style={styles.weekNav}>
              <Pressable
                onPress={() => shiftWeek(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                style={[styles.weekNavChevron, { borderColor: palette.border }]}
              >
                <Text style={[styles.weekNavArrow, { color: palette.text }]}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => setCalendarOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose a different week"
                style={styles.weekNavLabelWrap}
              >
                <Text style={[styles.weekNavLabel, { color: palette.accent }]}>
                  {formatWeekSpan(selectedWeekStart)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => shiftWeek(1)}
                accessibilityRole="button"
                accessibilityLabel="Next week"
                disabled={atCurrentWeek}
                style={[
                  styles.weekNavChevron,
                  { borderColor: palette.border, opacity: atCurrentWeek ? 0.35 : 1 },
                ]}
              >
                <Text style={[styles.weekNavArrow, { color: palette.text }]}>›</Text>
              </Pressable>
            </View>
          </View>
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: spacing.md,
            }}
          >
            <Caption>{weekYear(selectedWeekStart)}</Caption>
            <Pressable onPress={() => setInfoOpen(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
                More info ›
              </Text>
            </Pressable>
          </View>
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

        <Card style={{ marginTop: spacing.md }}>
          <H2>Muscle recovery</H2>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: spacing.md,
              marginTop: spacing.md,
            }}
          >
            <BodyMap parts={recoveryParts} side="front" scale={0.75} colors={recoveryScale} />
            <BodyMap parts={recoveryParts} side="back" scale={0.75} colors={recoveryScale} />
          </View>
          {!recoveryHasHistory ? (
            <Caption style={{ marginTop: spacing.md, textAlign: 'center' }}>
              No completed sets in the last 7 days.
            </Caption>
          ) : null}
          <RecoveryLegend colors={recoveryScale} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: spacing.md,
            }}
          >
            <Caption>Based on the last 7 days</Caption>
            <Pressable
              onPress={() => setRecoveryInfoOpen(true)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
                More info ›
              </Text>
            </Pressable>
          </View>
          <RecoveryInfoModal
            visible={recoveryInfoOpen}
            colors={recoveryScale}
            birthYear={settings.values.birthYear}
            sex={settings.values.sex}
            onClose={() => setRecoveryInfoOpen(false)}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <H2>Consistency</H2>
          <View style={{ marginTop: spacing.md }}>
            <CalendarHeatmap timestamps={dates} weekStart={weekStart} />
          </View>
        </Card>
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

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  weekNavChevron: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavArrow: { fontSize: fontSize.lg, fontWeight: '700', lineHeight: fontSize.lg + 2 },
  weekNavLabelWrap: {
    paddingHorizontal: spacing.xs,
  },
  weekNavLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
