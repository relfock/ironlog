/**
 * The in-workout control for HR-tracked cardio machines (Elliptical).
 *
 * A cardio exercise has no sets — one continuous segment per session. This card
 * replaces the set rows with a stopwatch that:
 *
 *   • samples heart rate once a second from the BLE strap (when paired) and
 *     shows the live bpm plus its zone,
 *   • draws a live Whoop-style area chart behind the session,
 *   • burns calories from the Keytel HR equations (with a moderate-MET
 *     fallback when no strap is worn),
 *   • writes progress through to the set row every ~5 s so a force-stop cannot
 *     lose a finished minute, and
 *   • completes the segment on Finish, recording duration, average HR and kcal.
 *
 * Segments are workout sets: subsequent segments append new rows, and each
 * completed segment shows up in the summary (long-press to delete).
 */
import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Area, CartesianChart, Line } from 'victory-native';
import { LinearGradient, Rect } from '@shopify/react-native-skia';
import { HeartRateSheet } from '@/components/HeartRateSheet';
import { Button, Caption, Row } from '@/components/ui';
import { useChartFont } from '@/components/charts/useChartFont';
import {
  runningCaloriesKcal,
  sessionCaloriesFromHr,
  type CalorieProfile,
} from '@/domain/calories';
import { estimateMaxHr, hrZone, HR_ZONES } from '@/domain/heartRateZones';
import { formatDuration } from '@/domain/units';
import type { WorkoutExerciseData, WorkoutSetData } from '@/db/repositories/workouts';
import { useActiveWorkout, useHeartRate, useSettings } from '@/stores/RootStore';
import { usePalette, useTheme } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/** Append an alpha byte to a #rrggbb colour. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export const CardioActivityCard = observer(function CardioActivityCard({
  we,
}: {
  we: WorkoutExerciseData;
}) {
  const palette = usePalette();
  const { isDark } = useTheme();
  const font = useChartFont();
  const active = useActiveWorkout();
  const settings = useSettings();
  const heartRate = useHeartRate();

  // The segment being recorded is the last uncompleted set — the empty row
  // `addExercise` creates, or the one "Add segment" appends.
  const activeSet = useMemo(
    () => [...we.sets].reverse().find((s) => !s.completed) ?? null,
    [we.sets],
  );
  const completed = useMemo(() => we.sets.filter((s) => s.completed), [we.sets]);

  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [connectOpen, setConnectOpen] = useState(false);

  const samplesRef = useRef<{ recordedAt: number; bpm: number }[]>([]);
  const dbSamplesRef = useRef<{ recordedAt: number; bpm: number }[]>([]);
  const avgSumRef = useRef(0);
  const avgCountRef = useRef(0);
  const progressCounterRef = useRef(0);

  const elapsed =
    running && startedAt !== null
      ? Math.max(0, Math.floor((now - startedAt) / 1000))
      : (activeSet?.durationSec ?? 0);

  const avgBpm =
    avgCountRef.current > 0
      ? Math.round(avgSumRef.current / avgCountRef.current)
      : null;

  const profile: CalorieProfile = {
    sex: settings.values.sex,
    age:
      settings.values.birthYear === null
        ? null
        : new Date().getFullYear() - settings.values.birthYear,
    bodyweightKg: settings.values.bodyweightKg,
  };

  const maxHr =
    profile.age === null || profile.age <= 0
      ? null
      : estimateMaxHr(profile.age, profile.sex);

  const calories = running
    ? runningCaloriesKcal(elapsed, avgBpm, profile)
    : (activeSet?.caloriesKcal ?? null);

  const zone =
    running && heartRate.liveBpm !== null && maxHr !== null
      ? hrZone(heartRate.liveBpm, maxHr)
      : null;

  const missingProfile = settings.values.bodyweightKg === null;

  useEffect(() => {
    if (!running || activeSet === null) return;
    const iv = setInterval(() => {
      const bpm = heartRate.liveBpm;
      const at = Date.now();

      if (bpm !== null && bpm > 0) {
        samplesRef.current = [...samplesRef.current, { recordedAt: at, bpm }];
        avgSumRef.current += bpm;
        avgCountRef.current += 1;
      }

      // Persist progress every ~5 s so a crash cannot lose a finished minute,
      // and keep a 5 s-spaced trace for the post-workout HR chart.
      progressCounterRef.current += 1;
      if (progressCounterRef.current % 5 === 0) {
        const avg =
          avgCountRef.current > 0
            ? Math.round(avgSumRef.current / avgCountRef.current)
            : null;
        const sec = Math.max(0, Math.floor((at - (startedAt ?? at)) / 1000));
        const kcal = runningCaloriesKcal(sec, avg, {
          sex: settings.values.sex,
          age:
            settings.values.birthYear === null
              ? null
              : new Date().getFullYear() - settings.values.birthYear,
          bodyweightKg: settings.values.bodyweightKg,
        });
        active.updateCardioProgress(activeSet.id, {
          durationSec: sec,
          avgBpm: avg,
          caloriesKcal: kcal,
        });
        if (bpm !== null && bpm > 0) {
          dbSamplesRef.current = [...dbSamplesRef.current, { recordedAt: at, bpm }];
        }
      }

      setNow(at);
    }, 1000);
    return () => clearInterval(iv);
  }, [running, activeSet?.id, heartRate, active, startedAt, settings]);

  const start = () => {
    const base = activeSet?.durationSec ?? 0;
    setStartedAt(Date.now() - base * 1000);
    samplesRef.current = [];
    dbSamplesRef.current = [];
    avgSumRef.current = 0;
    avgCountRef.current = 0;
    progressCounterRef.current = 0;
    setNow(Date.now());
    setRunning(true);
  };

  const finish = () => {
    if (!running || activeSet === null) return;
    const sec = elapsed;
    const avg = avgBpm;
    const kcal =
      sessionCaloriesFromHr(dbSamplesRef.current, profile) ??
      runningCaloriesKcal(sec, avg, profile);

    setRunning(false);
    setStartedAt(null);
    void active.completeCardioSession(
      activeSet.id,
      { durationSec: sec, avgBpm: avg, caloriesKcal: kcal },
      dbSamplesRef.current,
    );
  };

  const addSegment = () => {
    void active.addSetTo(we.id);
  };

  const confirmDeleteSegment = (s: WorkoutSetData) => {
    Alert.alert(
      'Delete segment?',
      `${formatDuration(s.durationSec ?? 0)} on the ${we.exerciseName} will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void active.removeSet(s.id),
        },
      ],
    );
  };

  return (
    <View style={{ marginTop: spacing.lg }}>
      {completed.length > 0 ? (
        <View style={styles.segments}>
          {completed.map((s) => (
            <Pressable
              key={s.id}
              onLongPress={() => confirmDeleteSegment(s)}
              accessibilityLabel={`${formatDuration(s.durationSec ?? 0)} segment. Long press to delete.`}
              style={({ pressed }) => [
                styles.segmentRow,
                { borderBottomColor: palette.border },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                style={{
                  color: palette.text,
                  fontWeight: '600',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatDuration(s.durationSec ?? 0)}
              </Text>
              <View style={{ flex: 1 }} />
              {s.avgBpm !== null ? <Caption>{s.avgBpm} bpm avg</Caption> : null}
              {s.caloriesKcal !== null ? (
                <Caption style={{ marginLeft: spacing.sm }}>
                  {Math.round(s.caloriesKcal)} kcal
                </Caption>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {activeSet !== null ? (
        running ? (
          <View>
            <LivePanel
              elapsedSec={elapsed}
              bpm={heartRate.liveBpm}
              zoneColor={zone?.color ?? null}
              zoneLabel={zone === null ? null : `${zone.label} ${zone.name}`}
              maxHr={maxHr}
              samples={samplesRef.current}
              calories={calories}
              palette={palette}
              isDark={isDark}
              font={font}
              onFinish={finish}
            />
            {heartRate.liveBpm === null ? (
              <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                {maxHr === null
                  ? 'No heart-rate strap — calories estimated from weight and time.'
                  : 'No heart-rate signal yet — start moving or pair a strap.'}
              </Caption>
            ) : null}
          </View>
        ) : (
          <View style={styles.idlePanel}>
            <Caption style={{ textAlign: 'center' }}>
              One continuous session per segment. Start moving, then press Start.
            </Caption>
            <Button
              label={elapsed > 0 ? `Continue — ${formatDuration(elapsed)}` : 'Start'}
              onPress={start}
              style={{ marginTop: spacing.md }}
            />
            {heartRate.connected ? (
              <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                {heartRate.deviceName ?? 'Heart-rate'} connected
              </Caption>
            ) : (
              <Button
                label="Pair heart-rate strap"
                variant="secondary"
                onPress={() => setConnectOpen(true)}
                style={{ marginTop: spacing.md }}
              />
            )}
            {missingProfile ? (
              <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                Set your bodyweight in Settings to see calories burned.
              </Caption>
            ) : null}
          </View>
        )
      ) : (
        <Button
          label="Add segment"
          onPress={addSegment}
          style={{ marginTop: spacing.sm }}
        />
      )}

      <HeartRateSheet visible={connectOpen} onClose={() => setConnectOpen(false)} />
    </View>
  );
});

/**
 * The stopwatch half: the big numbers, the live bpm + zone pill, the calorie
 * projection and the live area chart.
 */
function LivePanel({
  elapsedSec,
  bpm,
  zoneColor,
  zoneLabel,
  maxHr,
  samples,
  calories,
  palette,
  isDark,
  font,
  onFinish,
}: {
  elapsedSec: number;
  bpm: number | null;
  zoneColor: string | null;
  zoneLabel: string | null;
  maxHr: number | null;
  samples: readonly { recordedAt: number; bpm: number }[];
  calories: number | null;
  palette: ReturnType<typeof usePalette>;
  isDark: boolean;
  font: ReturnType<typeof useChartFont>;
  onFinish: () => void;
}) {
  const hrBpms = samples.map((s) => s.bpm);
  const chartData =
    samples.length > 0 ? samples : [{ recordedAt: Date.now(), bpm: bpm ?? 0 }];
  const maxSample = hrBpms.length > 0 ? Math.max(...hrBpms) : (bpm ?? 0);
  const yFloor = 40;
  const yCeil = Math.max(
    60,
    Math.ceil((Math.max(maxSample, maxHr ?? 0, bpm ?? 0) + 10) / 10) * 10,
  );
  const ceiling = maxHr ?? Math.max(maxSample, bpm ?? 0, 100);
  const zoneOpacity = isDark ? 0.17 : 0.11;

  return (
    <View style={styles.livePanel}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.timer}>{formatDuration(elapsedSec)}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.bpm, { color: palette.text }]}>{bpm ?? '--'}</Text>
          {zoneLabel !== null && zoneColor !== null ? (
            <View style={[styles.zonePill, { borderColor: zoneColor }]}>
              <Text style={{ color: zoneColor, fontSize: fontSize.xs, fontWeight: '800' }}>
                {zoneLabel.toUpperCase()}
              </Text>
            </View>
          ) : (
            <Caption>no zone</Caption>
          )}
        </View>
      </Row>

      <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
        <Stat label="CALORIES" value={calories === null ? '—' : `${Math.round(calories)}`} />
        <Stat label="BPM AVG" value={avgFromSamples(samples) === null ? '—' : `${avgFromSamples(samples)}`} />
      </Row>

      <View style={{ height: 140, marginTop: spacing.sm }}>
        <CartesianChart
          data={chartData.map((d) => ({ x: d.recordedAt, y: d.bpm }))}
          xKey="x"
          yKeys={['y']}
          domain={{ y: [yFloor, yCeil] }}
          axisOptions={{ font, lineColor: 'transparent', labelColor: 'transparent' }}
        >
          {({ points, chartBounds }) => {
            const yFor = (hr: number) =>
              chartBounds.bottom -
              ((hr - yFloor) / (yCeil - yFloor)) * (chartBounds.bottom - chartBounds.top);
            const plotWidth = chartBounds.right - chartBounds.left;
            return (
              <>
                {HR_ZONES.map((band) => {
                  const bandTop = Math.min(Math.max(ceiling * band.max, yFloor), yCeil);
                  const bandBottom = Math.min(Math.max(ceiling * band.min, yFloor), yCeil);
                  if (bandBottom <= bandTop) return null;
                  return (
                    <Rect
                      key={band.color}
                      x={chartBounds.left}
                      y={yFor(bandTop)}
                      width={plotWidth}
                      height={Math.max(0, yFor(bandBottom) - yFor(bandTop))}
                      color={withAlpha(band.color, zoneOpacity)}
                    />
                  );
                })}
                <Area points={points.y} y0={chartBounds.bottom} curveType="monotoneX">
                  <LinearGradient
                    start={{ x: 0, y: chartBounds.top }}
                    end={{ x: 0, y: chartBounds.bottom }}
                    colors={[withAlpha(palette.danger, 0.3), withAlpha(palette.danger, 0)]}
                  />
                </Area>
                <Line
                  points={points.y}
                  color={palette.danger}
                  strokeWidth={3}
                  curveType="monotoneX"
                />
              </>
            );
          }}
        </CartesianChart>
      </View>

      <Button
        label="Finish"
        variant="secondary"
        onPress={onFinish}
        style={{ marginTop: spacing.md }}
      />
    </View>
  );
}

function avgFromSamples(samples: readonly { bpm: number }[]): number | null {
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length);
}

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View style={{ alignItems: 'center' }}>
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

const styles = StyleSheet.create({
  idlePanel: { borderRadius: radius.md, padding: spacing.md },
  livePanel: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  segments: { marginBottom: spacing.sm },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timer: {
    fontSize: fontSize.display,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  bpm: { fontSize: fontSize.display, fontWeight: '800', fontVariant: ['tabular-nums'] },
  zonePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 2,
  },
});