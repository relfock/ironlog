import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { Body, Button, Caption, Card, EmptyState, H1, H2, Row } from '@/components/ui';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useWorkoutHrStatsMap } from '@/hooks/useWorkoutHrStats';
import { formatDurationCompact, formatWeight } from '@/domain/units';
import { dailyStreak, groupByWeek, weeklyStreak } from '@/domain/streak';
import { DEFAULT_HR_ZONES } from '@/domain/heartRateZones';
import { deleteWorkouts } from '@/db/repositories/workouts';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

export const HistoryScreen = observer(function HistoryScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const settings = useSettings();
  const { workouts, loading } = useWorkoutHistory();
  const hrStatsMap = useWorkoutHrStatsMap();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [deleting, setDeleting] = useState(false);

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

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const exitSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };

  const confirmBulkDelete = () => {
    Alert.alert(
      `Delete ${selected.length} workout${selected.length === 1 ? '' : 's'}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void deleteWorkouts(selected).finally(() => {
              setDeleting(false);
              exitSelecting();
            });
          },
        },
      ],
    );
  };

  if (!loading && workouts.length === 0) {
    return (
      <EmptyState
        title="No workouts yet"
        message="Finish your first session and it will appear here, along with your calendar and streaks."
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          selecting ? styles.scrollSelecting : undefined,
        ]}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>History</H1>
          {selecting ? (
            <Text
              onPress={exitSelecting}
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
              style={{ color: palette.accent, fontSize: fontSize.md, fontWeight: '700' }}
            >
              Cancel
            </Text>
          ) : (
            <Text
              onPress={() => setSelecting(true)}
              accessibilityRole="button"
              accessibilityLabel="Select workouts"
              style={{ color: palette.accent, fontSize: fontSize.md, fontWeight: '700' }}
            >
              Select
            </Text>
          )}
        </Row>

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

        <H2 style={{ marginTop: spacing.xl }}>
          All workouts{selecting ? ` · ${selected.length} selected` : ''}
        </H2>

        {workouts.map((w) => {
          const isSelected = selecting && selected.includes(w.id);
          return (
            <Card
              key={w.id}
              style={{
                marginTop: spacing.md,
                ...(isSelected ? { borderColor: palette.accent, borderWidth: 2 } : {}),
              }}
              onPress={() => {
                if (selecting) {
                  toggle(w.id);
                } else {
                  navigation.navigate('WorkoutDetail', { workoutId: w.id });
                }
              }}
              accessibilityLabel={`${w.name}, ${new Date(w.startedAt).toLocaleDateString()}${
                selecting ? (isSelected ? ', selected' : ', tap to select') : ''
              }`}
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
                {selecting ? (
                  <SelectIndicator selected={isSelected} />
                ) : w.prCount > 0 ? (
                  <Body style={{ color: palette.success }}>🏆 {w.prCount}</Body>
                ) : null}
              </Row>

              <Row style={{ marginTop: spacing.md }} gap={spacing.xl}>
                <Metric label="TIME" value={formatDurationCompact(w.durationSec ?? 0)} />
                {w.kind === 'activity' ? (
                  (() => {
                    const stats = hrStatsMap.get(w.id);
                    if (!stats) return null;
                    const dominantIdx = stats.zoneSec.indexOf(Math.max(...stats.zoneSec));
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
          );
        })}
      </ScrollView>

      {selecting ? (
        <View
          style={[
            styles.actionBar,
            { backgroundColor: palette.surfaceRaised, borderTopColor: palette.border },
          ]}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Body>{selected.length} selected</Body>
            <Button
              label="Delete"
              variant="danger"
              disabled={selected.length === 0 || deleting}
              onPress={confirmBulkDelete}
            />
          </Row>
        </View>
      ) : null}
    </View>
  );
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
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

function SelectIndicator({ selected }: { selected: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: selected ? palette.accent : palette.textFaint,
        backgroundColor: selected ? palette.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <Text style={{ color: palette.accentText, fontSize: 13, fontWeight: '800' }}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  scrollSelecting: { paddingBottom: 96 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
