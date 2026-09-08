import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import {
  Area,
  CartesianChart,
  Line,
  useChartPressState,
} from 'victory-native';
import {
  Line as SkiaLine,
  LinearGradient,
  Rect,
  DashPathEffect,
} from '@shopify/react-native-skia';
import { Caption, H2 } from '../ui';
import { useChartFont } from './useChartFont';
import { summariseHeartRate } from '@/domain/heartRate';
import { HR_ZONES } from '@/domain/heartRateZones';
import { usePalette, useTheme } from '@/theme/ThemeProvider';
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

/** Append an alpha byte to a #rrggbb colour. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/**
 * Heart rate over a single workout: AVG / MAX / ZONE 2+ stats plus the
 * time-series curve — a single smooth area line (no per-sample dots, no
 * jagged connect-the-points look), with WHOOP's zone bands behind it. Zone 2
 * floor defaults to the classic 220 − age when `maxHr` is given, otherwise
 * the measured max.
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
  const { isDark } = useTheme();
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
  // Zone bands and the area gradient stay tied to the athlete's HR ceiling.
  const hrCeiling = maxHr ?? Math.max(...bpm);
  // A single red companion to the theme accent, so the trace reads as a
  // heart-rate line in either theme.
  const trace = palette.danger;
  const zoneOpacity = isDark ? 0.17 : 0.11;

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
            {({ points, chartBounds }) => {
              // Canvas-space y for a given HR, mirroring the domain mapping.
              const yFor = (hr: number) =>
                chartBounds.bottom -
                ((hr - yFloor) / (yCeil - yFloor)) *
                  (chartBounds.bottom - chartBounds.top);
              const plotWidth = chartBounds.right - chartBounds.left;
              return (
                <>
                  {HR_ZONES.map((band) => {
                    const bandTop = Math.min(
                      Math.max(hrCeiling * band.max, yFloor),
                      yCeil,
                    );
                    const bandBottom = Math.min(
                      Math.max(hrCeiling * band.min, yFloor),
                      yCeil,
                    );
                    if (bandBottom <= bandTop) return null;
                    const y1 = yFor(bandTop);
                    const y2 = yFor(bandBottom);
                    return (
                      <Rect
                        key={band.color}
                        x={chartBounds.left}
                        y={y1}
                        width={plotWidth}
                        height={Math.max(0, y2 - y1)}
                        color={withAlpha(band.color, zoneOpacity)}
                      />
                    );
                  })}
                  <Area
                    points={points.y}
                    y0={chartBounds.bottom}
                    curveType="monotoneX"
                  >
                    <LinearGradient
                      start={{ x: 0, y: chartBounds.top }}
                      end={{ x: 0, y: chartBounds.bottom }}
                      colors={[withAlpha(trace, 0.3), withAlpha(trace, 0)]}
                    />
                  </Area>
                  <Line
                    points={points.y}
                    color={trace}
                    strokeWidth={3}
                    curveType="monotoneX"
                    animate={{ type: 'timing', duration: 250 }}
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
              );
            }}
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