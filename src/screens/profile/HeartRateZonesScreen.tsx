import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Caption, Card, H1, Row } from '@/components/ui';
import { NumberField } from '@/components/NumberField';
import {
  DEFAULT_HR_ZONES,
  MAX_ZONE_FRACTION,
  boundaryFractionToBpm,
  bpmToBoundaryFraction,
  estimateMaxHr,
  type HrZone,
} from '@/domain/heartRateZones';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

const ZONE_COUNT = 6;

/**
 * Whole-bpm boundaries: [Z0.min, Z1.min, …, Z5.min, Z5.max], derived from the
 * fraction model and the estimated max HR. Null when max HR is unknown.
 */
function boundsBpmFromZones(
  zones: readonly HrZone[],
  maxHr: number | null,
): (number | null)[] {
  const fallback = maxHr === null ? DEFAULT_HR_ZONES : zones;
  if (fallback.length !== ZONE_COUNT) {
    const base = DEFAULT_HR_ZONES.map((z) =>
      boundaryFractionToBpm(z.min, maxHr),
    );
    base.push(boundaryFractionToBpm(DEFAULT_HR_ZONES[ZONE_COUNT - 1]?.max ?? 1.05, maxHr));
    return base;
  }
  const bounds: (number | null)[] = fallback.map((z) => boundaryFractionToBpm(z.min, maxHr));
  bounds.push(boundaryFractionToBpm(fallback[ZONE_COUNT - 1]!.max, maxHr));
  return bounds;
}

function validateBounds(bounds: readonly (number | null)[], topMaxBpm: number): string | null {
  // Returns an error string when invalid, or a reason to disable save.
  for (let i = 0; i < bounds.length; i++) {
    const v = bounds[i];
    if (v === undefined || v === null) return 'Fill in every boundary before saving.';
    if (v < 0) return 'Zone boundaries cannot be negative.';
    if (i === bounds.length - 1 && v > topMaxBpm) {
      return `The top of Z5 cannot exceed ${topMaxBpm} bpm.`;
    }
    if (i < bounds.length - 1 && v >= (bounds[i + 1] ?? 0)) {
      return 'Zone boundaries must be in ascending order.';
    }
  }
  return null;
}

function zonesFromBpmBounds(
  bounds: readonly (number | null)[],
  maxHr: number,
): { min: number; max: number }[] {
  const nums = bounds.map((b) => bpmToBoundaryFraction(b, maxHr));
  const zones: { min: number; max: number }[] = [];
  for (let i = 0; i < ZONE_COUNT; i++) {
    const min = nums[i] ?? 0;
    const rawMax = nums[i + 1];
    const max =
      rawMax === undefined || rawMax === null || rawMax <= min ? min + 0.001 : rawMax;
    zones.push({ min, max });
  }
  return zones;
}

/** "57–74", "75–93", …, with the last band rendered from its lower edge. */
function rangeLabel(z: HrZone, maxHr: number): string {
  const lo = boundaryFractionToBpm(z.min, maxHr) ?? 0;
  const hi = boundaryFractionToBpm(z.max, maxHr) ?? 0;
  return z.max >= MAX_ZONE_FRACTION
    ? `≥ ${lo} bpm`
    : `${lo}–${Math.max(lo, hi - 1)} bpm`;
}

/**
 * Edit the six heart-rate zones (Z0…Z5) as whole-bpm ranges. Boundaries are
 * stored contiguous and ascending, relative to the estimated max HR from the
 * profile. Every zone feeds the live pill, the graphs and the post-workout
 * zone minutes.
 */
export const HeartRateZonesScreen = observer(function HeartRateZonesScreen() {
  const palette = usePalette();
  const settings = useSettings();
  const profileZones = settings.zoneSet;

  const age =
    settings.values.birthYear === null
      ? null
      : new Date().getFullYear() - settings.values.birthYear;
  const maxHr = age === null || age <= 0 ? null : estimateMaxHr(age, settings.values.sex);
  const topMaxBpm = Math.round((maxHr ?? 200) * MAX_ZONE_FRACTION);

  const [bounds, setBounds] = useState<(number | null)[]>(() =>
    boundsBpmFromZones(profileZones, maxHr),
  );
  const [saved, setSaved] = useState(false);

  const invalid = validateBounds(bounds, topMaxBpm);

  const setBound = (idx: number, value: number | null) => {
    setSaved(false);
    const next = [...bounds];
    const clamped = value === null ? null : Math.max(0, Math.round(value));
    next[idx] = clamped;
    setBounds(next);
  };

  const save = () => {
    if (invalid !== null || maxHr === null) return;
    void settings
      .setHeartRateZones(zonesFromBpmBounds(bounds, maxHr))
      .then(() => setSaved(true));
  };

  const reset = () => {
    setSaved(false);
    setBounds(boundsBpmFromZones(DEFAULT_HR_ZONES, maxHr));
  };

  // Preview bands using the draft boundaries.
  const preview = zonesFromBpmBounds(bounds, maxHr ?? 200);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <H1>Heart rate zones</H1>
      <Body muted style={{ marginTop: spacing.xs }}>
        Six zones (Z0–Z5) as beats-per-minute ranges. Boundaries are stored
        relative to your estimated max HR{maxHr === null ? '' : ` of ${maxHr} bpm`}
        ; every zone feeds the live pill, the graphs and the post-workout zone
        minutes.
      </Body>

      {maxHr === null ? (
        <Card style={{ marginTop: spacing.md }}>
          <Body style={{ fontWeight: '700' }}>Set your profile first</Body>
          <Body muted style={{ marginTop: spacing.xs, fontSize: fontSize.sm }}>
            Zone boundaries are expressed in beats per minute, so this screen
            needs your birth year and sex to estimate your max heart rate. Add
            them in Profile → Settings and come back here.
          </Body>
        </Card>
      ) : null}

      {maxHr !== null ? (
      <Card style={{ marginTop: spacing.lg, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', height: 12 }}>
          {preview.map((z, i) => {
            const span = (z.max - z.min) * 100;
            if (!(span > 0)) return null;
            return (
              <View
                key={profileZones[i]?.label ?? i}
                style={{
                  flex: span,
                  backgroundColor: profileZones[i]?.color ?? '#888',
                }}
              />
            );
          })}
        </View>
        <View style={{ marginTop: spacing.sm }}>
            {profileZones.map((z) => (
              <Row key={z.label} gap={spacing.sm} style={{ marginTop: spacing.xs }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: z.color,
                  }}
                />
                <Text
                  style={{
                    color: palette.text,
                    fontSize: fontSize.sm,
                    fontWeight: '700',
                    width: 48,
                  }}
                >
                  {z.label}
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: fontSize.sm, flex: 1 }}>
                  {z.name}
                </Text>
                <Text
                  style={{
                    color: palette.text,
                    fontSize: fontSize.sm,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {rangeLabel(z, maxHr)}
                </Text>
              </Row>
            ))}
            <Caption style={{ marginTop: spacing.sm }}>
              Ranges track this estimate; they shift if you change your birth
              year or sex.
            </Caption>
          </View>
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.md }}>
        <View
          style={[
            styles.row,
            styles.columnHeader,
            { borderBottomColor: palette.border },
          ]}
        >
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Caption style={{ paddingLeft: 18 }}>ZONE</Caption>
          </View>
          <Caption style={styles.columnLabel}>ZONE MIN</Caption>
          <Caption style={styles.columnLabel}>ZONE MAX</Caption>
        </View>
        {profileZones.map((z, i) => {
          const isLast = i === ZONE_COUNT - 1;
          const minIdx = i;
          const maxIdx = isLast ? ZONE_COUNT : i + 1;
          const minBpm = bounds[minIdx] ?? null;
          const maxBpm =
            bounds[maxIdx] === undefined || bounds[maxIdx] === null
              ? null
              : isLast
                ? bounds[maxIdx]
                : (bounds[maxIdx] as number) - 1;
          const onMaxChange = (v: number | null) => {
            if (v === null) {
              setBound(maxIdx, null);
            } else if (isLast) {
              setBound(maxIdx, Math.min(Math.max(0, Math.round(v)), topMaxBpm));
            } else {
              setBound(maxIdx, Math.min(Math.max(0, Math.round(v + 1)), topMaxBpm));
            }
          };
          return (
            <View
              key={z.label}
              style={[
                styles.row,
                i < ZONE_COUNT - 1
                  ? {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: palette.border,
                    }
                  : null,
              ]}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: z.color,
                    marginRight: spacing.sm,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{z.label}</Body>
                  <Caption>{z.name}</Caption>
                </View>
              </View>
              <NumberField
                value={minBpm}
                onChange={(v) => setBound(minIdx, v)}
                decimals={0}
                editable={maxHr !== null}
                style={{ width: 72, marginLeft: spacing.xs }}
                accessibilityLabel={`${z.label} zone min bpm`}
              />
              <NumberField
                value={maxBpm}
                onChange={onMaxChange}
                decimals={0}
                editable={maxHr !== null}
                style={{ width: 72, marginLeft: spacing.xs }}
                accessibilityLabel={`${z.label} zone max bpm`}
              />
            </View>
          );
        })}
      </Card>

      {invalid !== null && maxHr !== null ? (
        <Caption style={{ marginTop: spacing.sm, color: palette.danger }}>{invalid}</Caption>
      ) : saved ? (
        <Caption style={{ marginTop: spacing.sm }}>Saved.</Caption>
      ) : null}

      <Row style={{ marginTop: spacing.lg }} gap={spacing.sm}>
        <Button
          label="Reset to default zones"
          variant="secondary"
          onPress={reset}
          disabled={maxHr === null}
          style={{ flex: 1 }}
        />
        <Button
          label="Save"
          onPress={save}
          disabled={invalid !== null || maxHr === null}
          style={{ flex: 1 }}
        />
      </Row>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  columnHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
  },
  columnLabel: {
    width: 72,
    textAlign: 'center',
    marginLeft: spacing.xs,
  },
});
