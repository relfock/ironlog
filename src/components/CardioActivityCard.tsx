/**
 * The in-workout control for HR-tracked cardio machines (Elliptical).
 *
 * A cardio exercise has no sets — one continuous segment per session. This card
 * replaces the set rows with a stopwatch that:
 *
 *   • samples heart rate once a second from the BLE strap (when paired) and
 *     shows the live bpm plus its zone,
 *   • draws a live zone-banded area chart behind the session,
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
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { Group, Rect, Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { HeartRateSheet } from '@/components/HeartRateSheet';
import { Button, Caption, Row } from '@/components/ui';
import { useChartFont } from '@/components/charts/useChartFont';
import { densifyMonotone } from '@/components/charts/zoneCurve';
import { runningCaloriesKcal, type CalorieProfile } from '@/domain/calories';
import {
  estimateMaxHr,
  hrZone,
  zoneIndexForHr,
  type HrZoneSet,
} from '@/domain/heartRateZones';
import { formatDuration, formatDurationCompact } from '@/domain/units';
import type { WorkoutExerciseData, WorkoutSetData } from '@/db/repositories/workouts';
import { useActiveWorkout, useHeartRate, useSettings } from '@/stores/RootStore';
import { usePalette, useTheme } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

interface CardioActivityCardProps {
  we: WorkoutExerciseData;
  /** Expand to fill the screen (the dedicated activity view). */
  fullscreen?: boolean;
}

export interface CardioActivityCardHandle {
  /** Complete the in-flight cardio segment with its current data. */
  completeSegment: () => Promise<void>;
}

export const CardioActivityCard = observer(
  forwardRef<CardioActivityCardHandle, CardioActivityCardProps>(
    function CardioActivityCard({ we, fullscreen = false }, ref) {
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

  const [connectOpen, setConnectOpen] = useState(false);

  // Recording lives in ActiveWorkoutStore so it survives navigating away from
  // the activity screen: minimising never pauses the segment, and returning
  // never clears the HR history captured so far.
  const running = active.cardioRunning;
  const elapsed = active.cardioElapsedSec;
  const avgBpm = active.cardioAvgBpm;
  const dwellSec = active.cardioDwellSec;
  const samples = active.cardioSamples;
  const zoneTotals = active.cardioZoneTotals;

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

  const zones: HrZoneSet = settings.zoneSet;
  const zone =
    running && heartRate.liveBpm !== null && maxHr !== null
      ? hrZone(heartRate.liveBpm, maxHr, zones)
      : null;

  const missingProfile = settings.values.bodyweightKg === null;

  const start = () => {
    if (activeSet === null) return;
    active.cardioStart(activeSet.id);
  };

  const finish = useCallback((): Promise<void> => {
    if (activeSet === null) return Promise.resolve();
    return active.cardioFinish();
  }, [activeSet, active]);

  useImperativeHandle(
    ref,
    () => ({ completeSegment: () => finish() }),
    [finish],
  );

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
    <View style={fullscreen ? styles.fullscreenCard : { marginTop: spacing.lg }}>
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
              dwellSec={dwellSec}
              maxHr={maxHr}
              zones={zones}
              samples={samples}
              zoneTotals={zoneTotals}
              calories={calories}
              palette={palette}
              isDark={isDark}
              font={font}
              fullscreen={fullscreen}
              onFinish={finish}
            />
            {heartRate.liveBpm === null ? (
              <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                {heartRate.status === 'reconnecting'
                  ? 'Heart-rate signal lost — reconnecting…'
                  : maxHr === null
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
              <View style={{ alignItems: 'center' }}>
                <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                  {heartRate.deviceName ?? 'Heart-rate'} connected
                </Caption>
                <Button
                  label={
                    heartRate.emulating
                      ? 'Manage simulated strap'
                      : 'Manage heart-rate strap'
                  }
                  variant="ghost"
                  onPress={() => setConnectOpen(true)}
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            ) : heartRate.status === 'reconnecting' ? (
              <Caption style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                Strap dropped — reconnecting…
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
      ) : fullscreen ? null : (
        <Button
          label="Add segment"
          onPress={addSegment}
          style={{ marginTop: spacing.sm }}
        />
      )}

      <HeartRateSheet visible={connectOpen} onClose={() => setConnectOpen(false)} />
    </View>
  );
    },
  ),
);

/**
 * The stopwatch half: the big numbers, the live bpm + zone pill, the time
 * spent in the current zone, the calorie projection, the live area chart and
 * the running per-zone session split.
 */
function LivePanel({
  elapsedSec,
  bpm,
  zoneColor,
  zoneLabel,
  dwellSec,
  maxHr,
  zones,
  samples,
  zoneTotals,
  calories,
  palette,
  isDark: _isDark,
  font,
  fullscreen,
  onFinish,
}: {
  elapsedSec: number;
  bpm: number | null;
  zoneColor: string | null;
  zoneLabel: string | null;
  dwellSec: number | null;
  maxHr: number | null;
  zones: HrZoneSet;
  samples: readonly { recordedAt: number; bpm: number }[];
  zoneTotals: readonly number[];
  calories: number | null;
  palette: ReturnType<typeof usePalette>;
  isDark: boolean;
  font: ReturnType<typeof useChartFont>;
  fullscreen: boolean;
  onFinish: () => void;
}) {
  const hrBpms = samples.map((s) => s.bpm);
  const chartData =
    samples.length > 0 ? samples : [{ recordedAt: Date.now(), bpm: bpm ?? 0 }];
  const maxSample = hrBpms.length > 0 ? Math.max(...hrBpms) : (bpm ?? 0);
  const minSample = hrBpms.length > 0 ? Math.min(...hrBpms) : (bpm ?? 0);
  // Data-driven floor: hug the lowest HR recorded (with ~10% of slack) instead
  // of parking the axis at a fixed 40 bpm. 40 stays as a hard show-even-when-idle
  // floor so the live panel is always comfortable to read.
  const yFloor = Math.max(40, Math.floor((minSample * 0.9) / 10) * 10);
  // Data-driven ceiling: like the x-domain, it grows on demand to fit the
  // highest HR reached this session (samples only ever accumulate during an
  // activity), instead of being pinned to the athlete's max-HR estimate.
  const yCeil = Math.max(
    60,
    Math.ceil((Math.max(maxSample, bpm ?? 0, 90) + 10) / 10) * 10,
  );
  const ceiling = maxHr ?? Math.max(maxSample, bpm ?? 0, 100);

  return (
    <View style={fullscreen ? styles.livePanelFull : styles.livePanel}>
      <Row style={styles.liveHeader}>
        <View style={styles.liveHeaderLeft}>
          <Caption>IN ZONE</Caption>
          <Text
            style={{
              color: zoneColor ?? palette.text,
              fontSize: fontSize.display,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {dwellSec === null ? '—:—' : formatDuration(dwellSec)}
          </Text>
        </View>
        <View style={styles.liveHeaderCenter}>
          <Caption>TOTAL</Caption>
          <Text
            style={[
              styles.timer,
              { color: palette.text },
              fullscreen && styles.timerFull,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatDuration(elapsedSec)}
          </Text>
        </View>
        <View style={styles.liveHeaderCell}>
          <Text
            style={[styles.bpm, { color: zoneColor ?? palette.text }, fullscreen && styles.bpmFull]}
          >
            {bpm ?? '--'}
          </Text>
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

      <View style={{ height: fullscreen ? 380 : 180, marginTop: spacing.sm }}>
        <CartesianChart
          key={zones.map((z) => `${z.min}-${z.max}`).join('|')}
          data={chartData.map((d) => ({ x: d.recordedAt, y: d.bpm }))}
          xKey="x"
          yKeys={['y']}
          domain={{ y: [yFloor, yCeil] }}
          domainPadding={{ left: 8, right: 8, top: 12, bottom: 20 }}
          axisOptions={{
            font,
            lineColor: palette.border,
            labelColor: palette.textFaint,
            formatXLabel: (v) => formatClock(v),
            formatYLabel: (v) => String(Math.round(v)),
          }}
        >
          {({ points, yScale, chartBounds }) => {
            const yFor = (hr: number) => yScale(hr);
            // Zone-coloured trace: resample the whole curve onto monotone-cubic
            // frames first (densifyMonotone), then split the dense points into
            // same-zone runs. Every run is straight-line through on-curve points,
            // so the trace reads as one smooth curve — no angular corner where
            // the zone colour changes, and the fill below sits exactly on it.
            const tracePts: {
              x: number;
              y: number;
              xValue: number;
              yValue: number;
            }[] = [];
            for (const p of points.y) {
              if (
                typeof p.x === 'number' &&
                typeof p.y === 'number' &&
                typeof p.xValue === 'number' &&
                typeof p.yValue === 'number'
              ) {
                tracePts.push({ x: p.x, y: p.y, xValue: p.xValue, yValue: p.yValue });
              }
            }
            const smooth = densifyMonotone(tracePts);
            const traceSegments: Array<{
              pts: { x: number; y: number; xValue: number; yValue: number }[];
              color: string;
            }> = [];
            if (smooth.length >= 2) {
              const zoneColor = (bpm: number) =>
                zones[zoneIndexForHr(bpm, ceiling, zones) ?? 0]?.color ??
                palette.danger;
              let runColor: string | undefined;
              let run: { x: number; y: number; xValue: number; yValue: number }[] = [];
              const flush = () => {
                if (run.length > 0 && runColor !== undefined) {
                  traceSegments.push({ pts: run, color: runColor });
                  run = [];
                }
              };
              for (const p of smooth) {
                const c = zoneColor(p.yValue);
                if (c !== runColor) {
                  flush();
                  runColor = c;
                }
                run.push(p);
              }
              flush();
            }
            const zoneRows = zones
              .map((band): Array<[number, number, string]> | null => {
                const bandTop = Math.min(Math.max(ceiling * band.max, yFloor), yCeil);
                const bandBottom = Math.min(
                  Math.max(ceiling * band.min, yFloor),
                  yCeil,
                );
                if (bandTop <= bandBottom) return null;
                return [[yFor(bandTop), yFor(bandBottom), band.color]];
              })
              .filter((r): r is Array<[number, number, string]> => r !== null)
              .flat();
            const underCurvePath = ((): SkPath | undefined => {
              const first = smooth[0];
              if (!first || smooth.length < 2) {
                return undefined;
              }
              const last = smooth[smooth.length - 1];
              if (!last) {
                return undefined;
              }
              const path = Skia.Path.Make();
              path.moveTo(first.x, first.y);
              for (const p of smooth.slice(1)) {
                path.lineTo(p.x, p.y);
              }
              // Close along vertical plot edges (not diagonal corner ramps) so
              // the band doesn't look tilted at the start/end of the trace.
              path.lineTo(chartBounds.right, last.y);
              path.lineTo(chartBounds.right, chartBounds.bottom);
              path.lineTo(chartBounds.left, chartBounds.bottom);
              path.lineTo(chartBounds.left, first.y);
              path.close();
              return path;
            })();
return (
                <>
                  {/* Zone bands clipped to the under-curve polygon (trace +
                      plot left/right edges, no diagonal end ramps), so zone
                      colours appear only below the trace, matching the curve's
                      own shape, without semi-transparent red glow muddying the
                      zone colours. Rects are the only fills this build's skia
                      reliably paints (color-Areas silently no-op here), and
                      clipping is core skia. */}
                  {zoneRows.length > 0 && underCurvePath ? (
                    <Group clip={underCurvePath}>
                      {zoneRows.map(([yTop, yBottom, color], bi) => (
                        <Rect
                          key={`zone-${bi}`}
                          x={chartBounds.left}
                          y={yTop}
                          width={chartBounds.right - chartBounds.left}
                          height={yBottom - yTop}
                          color={color}
                        />
                      ))}
                    </Group>
                  ) : null}
                  {traceSegments.map((seg, i) => (
                  <Line
                    key={`trace-${i}`}
                    points={seg.pts}
                    color={seg.color}
                    strokeWidth={1}
                  />
                ))}
              </>
            );
          }}
        </CartesianChart>
      </View>

      <ZoneSessionSplit zones={zones} totals={zoneTotals} palette={palette} />

      {fullscreen ? null : (
        <Button
          label="Finish"
          variant="secondary"
          onPress={onFinish}
          style={{ marginTop: spacing.md }}
        />
      )}
    </View>
  );
}

/**
 * Live per-zone breakdown for the whole session — the same split the summary
 * persists, shown as the session accrues. Hidden until at least one second has
 * been credited to any zone.
 */
function ZoneSessionSplit({
  zones,
  totals,
  palette,
}: {
  zones: HrZoneSet;
  totals: readonly number[];
  palette: ReturnType<typeof usePalette>;
}) {
  const total = totals.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  return (
    <View style={{ marginTop: spacing.md }}>
      <Caption>TIME IN EACH ZONE</Caption>
      <View
        style={{
          marginTop: spacing.xs,
          flexDirection: 'row',
          overflow: 'hidden',
          borderRadius: 6,
        }}
      >
        {zones.map((z, i) => {
          const t = totals[i] ?? 0;
          if (t <= 0) return null;
          return (
            <View key={z.label} style={{ flex: t / total, height: 10, backgroundColor: z.color }} />
          );
        })}
      </View>
      <View
        style={{
          marginTop: spacing.xs,
          flexWrap: 'wrap',
          flexDirection: 'row',
          justifyContent: 'center',
        }}
      >
        {zones.map((z, i) => {
          const t = totals[i] ?? 0;
          return t > 0 ? (
            <View
              key={z.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginRight: spacing.md,
                marginTop: spacing.xs,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: z.color,
                  marginRight: 4,
                }}
              />
              <Text style={{ color: palette.textMuted, fontSize: fontSize.xs }}>
                {z.label} {formatDurationCompact(t)}
              </Text>
            </View>
          ) : null;
        })}
      </View>
    </View>
  );
}

function avgFromSamples(samples: readonly { bpm: number }[]): number | null {
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length);
}

function formatClock(v: number): string {
  return new Date(v).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
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
  liveHeader: { justifyContent: 'space-between', alignItems: 'flex-start' },
  liveHeaderLeft: { alignItems: 'flex-start', flex: 1 },
  liveHeaderCell: { alignItems: 'flex-end', flex: 1 },
  liveHeaderCenter: { alignItems: 'center', flex: 1 },
  livePanel: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  // Full-screen activity view: avoid forcing a flex-grow so the card's own
  // content never gets squeezed/clipped inside the activity ScrollView — it
  // scrolls instead of shrinking. Content fills naturally.
  fullscreenCard: { justifyContent: 'center' },
  livePanelFull: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00000000',
    padding: spacing.lg,
  },
  segments: { marginBottom: spacing.sm },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timer: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timerFull: { fontSize: fontSize.xxl },
  bpm: { fontSize: fontSize.display, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bpmFull: { fontSize: fontSize.display * 1.35 },
  zonePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 2,
  },
});