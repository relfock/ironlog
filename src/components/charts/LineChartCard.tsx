import React from 'react';
import { View } from 'react-native';
import { CartesianChart, Line, Scatter } from 'victory-native';
import { Caption, H2 } from '../ui';
import { useChartFont } from './useChartFont';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

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
          <CartesianChart
            data={data.map((d) => ({ x: d.x, y: d.y }))}
            xKey="x"
            yKeys={['y']}
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
              formatYLabel: (v) => (formatY ? formatY(v) : String(Math.round(v))),
            }}
          >
            {({ points }) => (
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
              </>
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
}

