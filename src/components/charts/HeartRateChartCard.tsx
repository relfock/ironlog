import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import {
  CartesianChart,
  Line,
  Scatter,
  useChartPressState,
} from 'victory-native';
import { Line as SkiaLine, DashPathEffect } from '@shopify/react-native-skia';
import { Caption, H2 } from '../ui';
import { useChartFont } from './useChartFont';
import { summariseHeartRate } from '@/domain/heartRate';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

export interface HeartRateSamplePoint {
  /** Epoch ms. */
  readonly recordedAt: number;
  readonly bpm: number;
}

function formatClock(v: number): string {
  return new Date(v).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Heart rate over a single workout: AVG / MAX / ZONE 2 summary stats plus the
 * time-series curve. Zone 2 floor defaults to the classic 220 − age when
 * `maxHr` is given, otherwise the measured max.
 */
export function HeartRateChartCard({
  title = 'HEART RATE',
  samples,
  maxHr,
}: {
  title?: string;
  samples: readonly HeartRateSamplePoint[];
  maxHr?: number;
}) {
  const palette = usePalette();
  const font = useChartFont();
  const summary = summariseHeartRate(
    samples.map((s) => ({ recordedAt: s.recordedAt, bpm: s.bpm })),
    maxHr,
  );
  const { state } = useChartPressState({ x: 0, y: { y: 0 } });

  const [callout, setCallout] = useState<{
    y: number;
    x: number;
    xPos: number;
  } | null>(null);

  const syncCallout = (y: number, x: number, xPos: number) =>
    setCallout({ y, x, xPos });

  useAnimatedReaction(
    () => ({
      active: state.isActive.get(),
      x: state.x.value.get(),
      y: state.y.y.value.get(),
      xPos: state.x.position.get(),
    }),
    (cur) => {
      if (cur.active) {
        runOnJS(syncCallout)(cur.y, cur.x, cur.xPos);
      }
    },
  );

  const bpm = samples.map((d) => d.bpm);
  const yFloor = Math.max(0, Math.floor((Math.min(...bpm) - 10) / 10) * 10);
  const yCeil = Math.ceil((Math.max(...bpm) + 10) / 10) * 10;

  return (
    <View>
      <H2>{title}</H2>
      {summary !== null ? (
        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          <Stat label="AVG" value={`${summary.avgBpm}`} />
          <Stat label="MAX" value={`${summary.maxBpm}`} />
          <Stat
            label="ZONE 2+"
            value={`${Math.round(summary.zone2Sec / 60)} min`}
          />
        </View>
      ) : null}

      {samples.length < 2 ? (
        <View style={{ height: 80, justifyContent: 'center' }}>
          <Caption>Not enough readings to draw a curve yet.</Caption>
        </View>
      ) : (
        <View style={{ height: 190, marginTop: spacing.sm }}>
          {callout !== null ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                alignItems: 'center',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <View
                style={{
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                }}
              >
                <Text
                  style={{
                    color: palette.text,
                    fontSize: fontSize.sm,
                    fontWeight: '700',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {String(Math.round(callout.y))} bpm
                </Text>
                <Text
                  style={{
                    color: palette.textMuted,
                    fontSize: fontSize.xs,
                    marginTop: 1,
                  }}
                >
                  {formatClock(callout.x)}
                </Text>
              </View>
            </View>
          ) : null}
          <CartesianChart
            data={samples.map((d) => ({ x: d.recordedAt, y: d.bpm }))}
            xKey="x"
            yKeys={['y']}
            domain={{ y: [yFloor, yCeil] }}
            chartPressState={state}
            domainPadding={{ left: 12, right: 12, top: 20, bottom: 12 }}
            axisOptions={{
              font,
              lineColor: palette.border,
              labelColor: palette.textFaint,
              formatXLabel: (v) => formatClock(v),
              formatYLabel: (v) => String(Math.round(v)),
            }}
          >
            {({ points, chartBounds }) => (
              <>
                <Line
                  points={points.y}
                  color={palette.accent}
                  strokeWidth={2.5}
                  curveType="monotoneX"
                  animate={{ type: 'timing', duration: 250 }}
                />
                <Scatter
                  points={points.y}
                  color={palette.accent}
                  radius={3}
                  style="fill"
                />
                {callout !== null && (
                  <SkiaLine
                    p1={{ x: callout.xPos, y: chartBounds.top }}
                    p2={{ x: callout.xPos, y: chartBounds.bottom }}
                    color={palette.textFaint}
                    strokeWidth={1}
                  >
                    <DashPathEffect intervals={[4, 4]} />
                  </SkiaLine>
                )}
              </>
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View style={{ marginRight: spacing.xl }}>
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