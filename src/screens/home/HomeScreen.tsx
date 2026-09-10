import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { HeatmapInfoModal } from '@/components/HeatmapInfoModal';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { MuscleViewer } from '@/components/MuscleViewer';
import { RecoveryInfoModal } from '@/components/RecoveryInfoModal';
import { RecoveryLegend } from '@/components/RecoveryLegend';
import { WeekCalendarSheet } from '@/components/WeekCalendarSheet';
import { Body, Button, Caption, Card, H1, H2 } from '@/components/ui';
import { buildHeatmap, MUSCLE_LABELS } from '@/domain/muscleMap';
import {
  formatWeekSpan,
  sevenDayWindowStart,
  weekYear,
  WEEK_MS,
} from '@/domain/streak';
import { formatDurationCompact, formatRecoveryTime } from '@/domain/units';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useMuscleRecovery } from '@/hooks/useMuscleRecovery';
import { useMuscleWeek } from '@/hooks/useMuscleWeek';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { buildBodyHeatScale } from '@/theme/heatScale';
import { buildRecoveryScale } from '@/theme/recoveryScale';
import { fontSize, radius, spacing } from '@/theme/tokens';
import {
  MUSCLE_RECOVERY_HOURS,
  recoveryLevel,
  timeUntilRecovered,
} from '@/domain/muscleRecovery';
import { weeklySetsToHeatLevel } from '@/domain/trainingVolume';
import type { Muscle, Sex } from '@/domain/types';

/**
 * List of muscles currently recovering, with progress bars and time remaining.
 */
function RecoveryProgressList({
  fatigueByMuscle,
  birthYear,
  sex,
  palette,
  recoveryScale,
}: {
  fatigueByMuscle: Map<Muscle, number>;
  birthYear: number | null;
  sex: Sex | null;
  palette: ReturnType<typeof usePalette>;
  recoveryScale: string[];
}) {
  const recovering = useMemo(() => {
    const items = [];
    for (const [muscle, fatigue] of fatigueByMuscle) {
      const hours = MUSCLE_RECOVERY_HOURS[muscle];
      if (hours <= 0) continue;

      const timeMs = timeUntilRecovered(fatigue, hours, birthYear, sex);
      if (timeMs <= 0) continue;

      const level = recoveryLevel(fatigue);
      items.push({
        muscle,
        label: MUSCLE_LABELS[muscle],
        fatigue,
        level,
        timeMs,
      });
    }
    return items.sort((a, b) => a.timeMs - b.timeMs);
  }, [fatigueByMuscle, birthYear, sex]);

  if (recovering.length === 0) return null;

  // The visual scale is anchored to the longest possible recovery window (72h)
  // normalized by the maximum reasonable fatigue (RECOVERY_REFERENCE_FATIGUE).
  // This ensures 100% bar = 3 days approx, regardless of the muscle.
  const MAX_TIME_MS = 72 * 3600 * 1000;

  return (
    <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
      {recovering.map(({ label, timeMs, level }) => {
        const barWidth = Math.min(1, timeMs / MAX_TIME_MS);
        return (
          <View key={label} style={{ gap: spacing.xs }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: palette.text }}>
                {label}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: palette.textFaint }}>
                {formatRecoveryTime(timeMs)}
              </Text>
            </View>
            <View
              style={{
                height: 6,
                backgroundColor: palette.border,
                borderRadius: radius.sm,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  backgroundColor: recoveryScale[level - 1],
                  width: `${barWidth * 100}%`,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * List of muscles with their weekly volume bars.
 */
function VolumeProgressList({
  setsPerMuscle,
  palette,
  heatScale,
}: {
  setsPerMuscle: Map<Muscle, number>;
  palette: ReturnType<typeof usePalette>;
  heatScale: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  const volume = useMemo(() => {
    const items = [];
    for (const [muscle, sets] of setsPerMuscle) {
      if (sets <= 0) continue;
      const level = weeklySetsToHeatLevel(sets);
      if (level === 0) continue;
      items.push({
        label: MUSCLE_LABELS[muscle],
        sets,
        level,
      });
    }
    return items.sort((a, b) => b.sets - a.sets);
  }, [setsPerMuscle]);

  if (volume.length === 0) return null;

  // Anchor the bar width to a reasonable high volume (e.g. 25 sets)
  const MAX_SETS = 25;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: palette.text }}>
          Worked muscles ({volume.length})
        </Text>
        <Text style={{ color: palette.textFaint, fontSize: fontSize.sm }}>{expanded ? '⌄' : '›'}</Text>
      </Pressable>
      {expanded ? (
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          {volume.map(({ label, sets, level }) => {
            const barWidth = Math.min(1, sets / MAX_SETS);
            return (
              <View key={label} style={{ gap: spacing.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: palette.text }}>
                    {label}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: palette.textFaint }}>
                    {Math.round(sets)} sets
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    backgroundColor: palette.border,
                    borderRadius: radius.sm,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      backgroundColor: heatScale[level - 1],
                      width: `${barWidth * 100}%`,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

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
  // The heatmap shows a rolling 7-day window ending today by default (not a
  // Mon–Sun calendar week), so training on Sunday still shows on Monday.
  const [selectedWindowStart, setSelectedWindowStart] = useState(() =>
    sevenDayWindowStart(Date.now()),
  );
  const { setsPerMuscle, reload: reloadMuscle } = useMuscleWeek(selectedWindowStart);
  const {
    parts: recoveryParts,
    fatigueByMuscle,
    hasHistory: recoveryHasHistory,
    reload: reloadRecovery,
  } = useMuscleRecovery();
  const [infoOpen, setInfoOpen] = useState(false);
  const [recoveryInfoOpen, setRecoveryInfoOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const currentWindowStart = sevenDayWindowStart(Date.now());
  const atCurrentWindow = selectedWindowStart >= currentWindowStart;
  const windowLabel = atCurrentWindow ? 'Last 7 days' : formatWeekSpan(selectedWindowStart);

  const shiftWindow = (delta: number) => {
    setSelectedWindowStart((prev) => {
      const next = prev + delta * WEEK_MS;
      return atCurrentWindow && delta > 0 ? prev : next;
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
                onPress={() => shiftWindow(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous 7 days"
                style={[styles.weekNavChevron, { borderColor: palette.border }]}
              >
                <Text style={[styles.weekNavArrow, { color: palette.text }]}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => setCalendarOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose a different period"
                style={styles.weekNavLabelWrap}
              >
                <Text style={[styles.weekNavLabel, { color: palette.accent }]}>
                  {windowLabel}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => shiftWindow(1)}
                accessibilityRole="button"
                accessibilityLabel="Next 7 days"
                disabled={atCurrentWindow}
                style={[
                  styles.weekNavChevron,
                  { borderColor: palette.border, opacity: atCurrentWindow ? 0.35 : 1 },
                ]}
              >
                <Text style={[styles.weekNavArrow, { color: palette.text }]}>›</Text>
              </Pressable>
            </View>
          </View>
          {heat.length === 0 ? (
            <Caption style={{ marginTop: spacing.md }}>No completed sets in this period.</Caption>
          ) : (
            <>
              <Pressable
                onPress={() => setViewerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open the interactive heatmap explorer"
                style={styles.explore}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: spacing.md,
                  }}
                >
                  <BodyMap parts={heat} side="front" scale={0.75} colors={heatScale} />
                  <BodyMap parts={heat} side="back" scale={0.75} colors={heatScale} />
                </View>
                <Caption style={{ textAlign: 'center', marginTop: spacing.xs }}>
                  Tap to rotate, zoom and explore
                </Caption>
              </Pressable>
              <VolumeProgressList
                setsPerMuscle={setsPerMuscle}
                palette={palette}
                heatScale={heatScale}
              />
            </>
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
            <Caption>{weekYear(selectedWindowStart)}</Caption>
            <Pressable onPress={() => setInfoOpen(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
                More info ›
              </Text>
            </Pressable>
          </View>
          <HeatmapInfoModal visible={infoOpen} colors={heatScale} onClose={() => setInfoOpen(false)} />
          <WeekCalendarSheet
            visible={calendarOpen}
            selectedWindowStartMs={selectedWindowStart}
            weekStart={weekStart}
            onSelectWindow={(ms) => {
              setSelectedWindowStart(ms);
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
          <RecoveryProgressList
            fatigueByMuscle={fatigueByMuscle}
            birthYear={settings.values.birthYear}
            sex={settings.values.sex}
            palette={palette}
            recoveryScale={recoveryScale}
          />
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

      {viewerOpen && heat.length > 0 ? (
        <MuscleViewer
          parts={heat}
          colors={heatScale}
          onClose={() => setViewerOpen(false)}
          onOpenExercises={(muscles) =>
            navigation.navigate('ExerciseLibrary', { muscles: [...muscles] })
          }
        />
      ) : null}
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
  explore: { marginTop: spacing.md },
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
