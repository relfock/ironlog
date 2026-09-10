import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import {
  CartesianChart,
  Line,
  useChartPressState,
} from 'victory-native';
import {
  Circle,
  DashPathEffect,
  Group,
  Line as SkiaLine,
  Rect,
  Skia,
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { Caption, H2 } from '../ui';
import { useChartFont } from './useChartFont';
import { densifyMonotone } from './zoneCurve';
import {
  type HrZoneSet,
  zoneIndexForHr,
} from '@/domain/heartRateZones';
import { usePalette, useTheme } from '@/theme/ThemeProvider';
import { useSettings } from '@/stores/RootStore';
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
 * Heart rate over a single workout: AVG / MAX / ZONE 2+ stats plus the
 * time-series curve — a single smooth area line (no per-sample dots, no
 * jagged connect-the-points look), with the zone bands behind it. The bands
 * and the trace share the same y-domain, anchored to the athlete's HR ceiling
 * (`maxHr`) so the coloured zones always line up with the curve.
 */
export function HeartRateChartCard({
  title = 'HEART RATE',
  subtitle,
  samples,
  maxHr,
  zones,
  chartHeight = 190,
}: {
  title?: string;
  subtitle?: string;
  samples: readonly HeartRateSamplePoint[];
  maxHr?: number;
  zones?: HrZoneSet;
  chartHeight?: number;
}) {
  const palette = usePalette();
  const { isDark: _isDark } = useTheme();
  const font = useChartFont();
  const settings = useSettings();
  const resolvedZones = zones ?? settings.zoneSet;
  const chartData = React.useMemo(
    () => samples.map((d) => ({ x: d.recordedAt, y: d.bpm })),
    [samples],
  );
  const { state } = useChartPressState({ x: 0, y: { y: 0 } });

  const [callout, setCallout] = useState<{
    y: number;
    x: number;
    xPos: number;
    yPos: number;
  } | null>(null);

  const syncCallout = (y: number, x: number, xPos: number, yPos: number) =>
    setCallout({ y, x, xPos, yPos });
  const clearCallout = () => setCallout(null);

  useAnimatedReaction(
    () => ({
      active: state.isActive.get(),
      x: state.x.value.get(),
      y: state.y.y.value.get(),
      xPos: state.x.position.get(),
      yPos: state.y.y.position.get(),
    }),
    (cur) => {
      if (cur.active) {
        runOnJS(syncCallout)(cur.y, cur.x, cur.xPos, cur.yPos);
      } else {
        runOnJS(clearCallout)();
      }
    },
  );

  const bpm = samples.map((d) => d.bpm);
  // Zone bands and the trace share the same y-domain, hugging the measured
  // range: the floor sits ~10% below the lowest HR on the curve and the
  // ceiling rounds up past the measurement max. Like the live chart, the
  // ceiling is data-driven — it hugs the highest HR on the curve instead of
  // being stretched by the athlete's max-HR estimate, so unreached zones don't
  // flatten the visible plot.
  const measuredMax = Math.max(...bpm);
  const measuredMin = Math.min(...bpm);
  const hrCeiling = maxHr ?? measuredMax;
  // Data-driven floor: edge the axis down to ~10% below the lowest HR on the
  // curve (rounded to 10 s) instead of pinning it at 0, so a session that
  // stayed above 60 bpm never wastes the bottom of the plot.
  const yFloor = Math.max(0, Math.floor((measuredMin * 0.9) / 10) * 10);
  const yCeil = Math.max(60, Math.ceil((measuredMax + 5) / 5) * 5);
  // A single red companion to the theme accent, so the trace reads as a
  // heart-rate line in either theme.
  const trace = palette.danger;

  // Chart container width, needed to keep the finger-following value bubble on
  // the screen. Measured from the chart wrapper (the canvas fills it exactly).
  const [containerWidth, setContainerWidth] = useState(0);

  const BUBBLE_W = 100;
  const BUBBLE_H = 56;
  const BUBBLE_GAP = 8;
  const bubbleLeft =
    callout !== null && containerWidth > 0
      ? Math.max(
          BUBBLE_W / 2,
          Math.min(containerWidth - BUBBLE_W / 2, callout.xPos),
        ) -
        BUBBLE_W / 2
      : 0;
  const showBelow = callout !== null && callout.yPos < BUBBLE_H + BUBBLE_GAP + 16;
  const bubbleTop =
    callout !== null
      ? Math.max(
          4,
          Math.min(
            chartHeight - BUBBLE_H - 4,
            showBelow
              ? callout.yPos + 12
              : callout.yPos - BUBBLE_H - BUBBLE_GAP,
          ),
        )
      : 0;

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <H2 style={{ flex: 1 }}>{title}</H2>
        {subtitle !== undefined ? (
          <Caption style={{ marginLeft: spacing.sm, textAlign: 'right' }}>
            {subtitle}
          </Caption>
        ) : null}
      </View>

      {samples.length < 2 ? (
        <View style={{ height: 80, justifyContent: 'center' }}>
          <Caption>Not enough readings to draw a curve yet.</Caption>
        </View>
      ) : (
        <View
          style={{ height: chartHeight, marginTop: spacing.sm }}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {callout !== null ? (
            <View
              style={{
                position: 'absolute',
                top: bubbleTop,
                left: bubbleLeft,
                width: BUBBLE_W,
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
            key={resolvedZones.map((z) => `${z.min}-${z.max}`).join('|')}
            data={chartData}
            xKey="x"
            yKeys={['y']}
            domain={{ y: [yFloor, yCeil] }}
            chartPressState={state}
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
              // Canvas-space y for a given HR, via the chart's own y-scale
              // (keeps fills aligned with the trace without depending on
              // chartBounds arriving after layout).
              const yFor = (hr: number) => yScale(hr);
              // Zone-coloured trace: resample the whole curve onto monotone-cubic
              // frames first (densifyMonotone), then split the dense points into
              // same-zone runs. Drawing the on-curve samples as straight segments
              // reproduces the smooth curve with no angular corner where the zone
              // colour changes, and the fill below sits exactly on it.
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
                  resolvedZones[
                    zoneIndexForHr(bpm, hrCeiling, resolvedZones) ?? 0
                  ]?.color ?? trace;
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
              // Simple plain-data band rows (a MobX-observable array passed
              // straight into an Area's `points` does not paint reliably).
              const zoneRows = resolvedZones
                .map((band): Array<[number, number, string]> | null => {
                  const bandTop = Math.min(
                    Math.max(hrCeiling * band.max, yFloor),
                    yCeil,
                  );
                  const bandBottom = Math.min(
                    Math.max(hrCeiling * band.min, yFloor),
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
                // Close along vertical plot edges (not diagonal corner ramps)
                // so the band doesn't look tilted at the start/end of the
                // trace.
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
                      colours appear only below the curve, without
                      semi-transparent red glow muddying the zone colours.
                      Rects are the only fills this build's skia reliably
                      paints (color-Areas silently no-op here), and clipping is
                      core skia. */}
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
                  {callout !== null && (
                    <>
                      <SkiaLine
                        p1={{ x: callout.xPos, y: yFor(yCeil) }}
                        p2={{ x: callout.xPos, y: yFor(yFloor) }}
                        color={palette.textFaint}
                        strokeWidth={1}
                      >
                        <DashPathEffect intervals={[4, 4]} />
                      </SkiaLine>
                      <Circle
                        cx={callout.xPos}
                        cy={callout.yPos}
                        r={6}
                        color={palette.surface}
                        style="fill"
                      />
                      <Circle
                        cx={callout.xPos}
                        cy={callout.yPos}
                        r={3.5}
                        color={trace}
                        style="fill"
                      />
                    </>
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