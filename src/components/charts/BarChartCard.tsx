import React from 'react';
import { View } from 'react-native';
import { Bar, CartesianChart } from 'victory-native';
import { Caption, H2 } from '../ui';
import { useChartFont } from './useChartFont';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export interface BarDatum {
  readonly label: string;
  readonly value: number;
  /** Sort/positional key; bars need a numeric x. */
  readonly x: number;
}

/** Categorical bar chart — weekly volume, sets per muscle group. */
export function BarChartCard({
  title,
  subtitle,
  data,
  height = 210,
  formatY,
}: {
  title: string;
  subtitle?: string;
  data: readonly BarDatum[];
  height?: number;
  formatY?: (v: number) => string;
}) {
  const palette = usePalette();
  const font = useChartFont();

  const labelFor = new Map(data.map((d) => [d.x, d.label]));

  return (
    <View>
      <H2>{title}</H2>
      {subtitle !== undefined ? <Caption>{subtitle}</Caption> : null}

      {data.length === 0 ? (
        <View style={{ height: height / 2, justifyContent: 'center' }}>
          <Caption>No data yet.</Caption>
        </View>
      ) : (
        <View style={{ height, marginTop: spacing.sm }}>
          <CartesianChart
            data={data.map((d) => ({ x: d.x, value: d.value }))}
            xKey="x"
            yKeys={['value']}
            domainPadding={{ left: 24, right: 24, top: 20, bottom: 8 }}
            axisOptions={{
              font,
              lineColor: palette.border,
              labelColor: palette.textFaint,
              formatXLabel: (v) => labelFor.get(v) ?? '',
              formatYLabel: (v) => (formatY ? formatY(v) : String(Math.round(v))),
            }}
          >
            {({ points, chartBounds }) => (
              <Bar
                points={points.value}
                chartBounds={chartBounds}
                color={palette.accent}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
                innerPadding={0.3}
                animate={{ type: 'timing', duration: 250 }}
              />
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
}
