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
import { usePalette } from '@/theme/ThemeProvider';
import { spacing, fontSize } from '@/theme/tokens';

export interface SeriesPoint {
  /** Epoch ms, used as the x value. */
  readonly x: number;
  readonly y: number;
}

/**
 * Time-series line chart.
 *
 * Needs at least two points: a single logged session has no trend to draw, and
 * a one-point line renders as an invisible zero-length path — so it shows an
 * explicit "log it again" message instead of an empty box.
 */
export function LineChartCard({
  title,
  subtitle,
  data,
  height = 200,
  formatY,
}: {
  title: string;
  subtitle?: string;
  data: readonly SeriesPoint[];
  height?: number;
  formatY?: (v: number) => string;
}) {
  const palette = usePalette();
  const font = useChartFont();
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

  return (
    <View>
      <H2>{title}</H2>
      {subtitle !== undefined ? <Caption>{subtitle}</Caption> : null}

      {data.length < 2 ? (
        <View style={{ height: height / 2, justifyContent: 'center' }}>
          <Caption>
            {data.length === 0
              ? 'No data yet.'
              : 'Only one session logged — do this exercise again to see a trend.'}
          </Caption>
        </View>
      ) : (
        <View style={{ height, marginTop: spacing.sm }}>
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
                  {formatY
                    ? formatY(callout.y)
                    : String(Math.round(callout.y))}
                </Text>
                <Text
                  style={{
                    color: palette.textMuted,
                    fontSize: fontSize.xs,
                    marginTop: 1,
                  }}
                >
                  {new Date(callout.x).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          ) : null}
          <CartesianChart
            data={data.map((d) => ({ x: d.x, y: d.y }))}
            xKey="x"
            yKeys={['y']}
            chartPressState={state}
            domainPadding={{ left: 12, right: 12, top: 20, bottom: 12 }}
            axisOptions={{
              font,
              lineColor: palette.border,
              labelColor: palette.textFaint,
              formatXLabel: (v) =>
                new Date(v).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                }),
              formatYLabel: (v) =>
                formatY ? formatY(v) : String(Math.round(v)),
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
                  radius={3.5}
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
