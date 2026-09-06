import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionSheet } from '@/components/ActionSheet';
import { LineChartCard } from '@/components/charts/LineChartCard';
import { MeasurementGuideSheet } from '@/components/MeasurementGuideSheet';
import { PromptModal } from '@/components/PromptModal';
import { SpanSheet } from '@/components/SpanSheet';
import { Body, Caption, Card, H1, H2, Row } from '@/components/ui';
import { SettingsRow, SettingsSection } from '@/components/settings';
import {
  MEASUREMENT_KINDS,
  MEASUREMENT_LABELS,
  addMeasurement,
  latestMeasurements,
  listMeasurements,
  measurementUnit,
  type Measurement,
  type MeasurementKind,
} from '@/db/repositories/measurements';
import { formatAxisTick, fromKg, toKg, trimNumber } from '@/domain/units';
import { syncBodyCompositionFromHealthConnect } from '@/lib/healthConnectSync';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

type Span = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const SPANS: readonly { key: Span; label: string; ms: number | null }[] = [
  { key: '1W', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '1M', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '3M', label: '3M', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: '6M', label: '6M', ms: 182 * 24 * 60 * 60 * 1000 },
  { key: '1Y', label: '1Y', ms: 365 * 24 * 60 * 60 * 1000 },
  { key: 'ALL', label: 'All', ms: null },
];

export const MeasurementsScreen = observer(function MeasurementsScreen() {
  const palette = usePalette();
  const settings = useSettings();
  const [latest, setLatest] = useState<Map<MeasurementKind, Measurement>>(new Map());
  const [selected, setSelected] = useState<MeasurementKind>('weight');
  const [span, setSpan] = useState<Span>('1M');
  const [history, setHistory] = useState<Measurement[]>([]);
  const [entering, setEntering] = useState<MeasurementKind | null>(null);
  const [guideKind, setGuideKind] = useState<MeasurementKind | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [kindSheetOpen, setKindSheetOpen] = useState(false);
  const [spanSheetOpen, setSpanSheetOpen] = useState(false);

  const reload = useCallback(() => {
    void latestMeasurements().then(setLatest);
    void listMeasurements(selected).then(setHistory);
  }, [selected]);

  useEffect(reload, [reload]);

  const spanMs = SPANS.find((s) => s.key === span)!.ms;
  const filtered =
    spanMs === null ? history : history.filter((m) => m.measuredAt >= Date.now() - spanMs);

  const handleHealthConnectSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncBodyCompositionFromHealthConnect();
      if (result.status === 'unavailable') {
        Alert.alert(
          'Health Connect unavailable',
          'Health Connect sync is only available on Android.',
        );
      } else if (result.status === 'not-authorized') {
        Alert.alert(
          'Permission needed',
          'Grant read access to body measurements in Health Connect to sync.',
        );
      } else if (result.status === 'no-data') {
        Alert.alert(
          'No data found',
          `No body-composition data found in Health Connect${
            result.denied.length > 0
              ? ` (no access to ${result.denied.join(', ')})`
              : ''
          }.`,
        );
      } else {
        const imported = result.imported;
        const skipped = result.skipped;
        Alert.alert(
          'Sync complete',
          `Imported ${imported} new entr${imported === 1 ? 'y' : 'ies'}${
            skipped > 0
              ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}`
              : ''
          }${
            result.denied.length > 0
              ? `.\nNo access to: ${result.denied.join(', ')}`
              : '.'
          }`,
        );
        reload();
        if (imported > 0) {
          // Keep the bodyweight-exercise volume setting in sync with the
          // most recent synced weight, same as logging one manually.
          void latestMeasurements().then((m) => {
            const w = m.get('weight');
            if (w !== undefined) void settings.set('bodyweightKg', w.value);
          });
        }
      }
    } catch (e) {
      Alert.alert(
        'Sync failed',
        e instanceof Error && e.message
          ? e.message
          : 'Something went wrong while reading Health Connect.',
      );
    } finally {
      setSyncing(false);
    }
  }, [syncing, reload]);

  const unitFor = useCallback(
    (kind: MeasurementKind): string => {
      const type = measurementUnit(kind);
      if (type === 'mass') return settings.values.weightUnit;
      if (type === 'percent') return '%';
      return 'cm';
    },
    [settings.values.weightUnit],
  );

  /** Mass is stored in kg; lengths and percentages are stored as entered. */
  const display = useCallback(
    (kind: MeasurementKind, value: number): number =>
      measurementUnit(kind) === 'mass'
        ? fromKg(value, settings.values.weightUnit)
        : value,
    [settings.values.weightUnit],
  );

  const series = filtered.map((m) => ({
    x: m.measuredAt,
    y: display(selected, m.value),
  }));

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Measurements</H1>
        <Caption style={{ marginTop: 2 }}>
          Tap a measurement to log a new value — tap the ? to read how to measure it correctly.
        </Caption>

        <Card style={{ marginTop: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <H2>Measurements</H2>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setGuideKind(selected)}
                accessibilityRole="button"
                accessibilityLabel={`How to measure ${MEASUREMENT_LABELS[selected]}`}
                style={[styles.guide, { borderColor: palette.border }]}
              >
                <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '800' }}>
                  ?
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSpanSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Chart time span"
                style={[styles.chip, { borderColor: palette.border }]}
              >
                <Text style={{ color: palette.textMuted, fontSize: fontSize.sm, fontWeight: '600' }}>
                  {SPANS.find((s) => s.key === span)!.label}
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: fontSize.sm, fontWeight: '600' }}>
                  ▾
                </Text>
              </Pressable>
            </View>
          </Row>

          <Pressable
            onPress={() => setKindSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Select measurement"
            style={({ pressed }) => [
              styles.selector,
              { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={{ color: palette.text, fontSize: fontSize.md, fontWeight: '700' }}>
              {MEASUREMENT_LABELS[selected]}
            </Text>
            <Text style={{ color: palette.textMuted, fontSize: fontSize.sm, fontWeight: '600' }}>
              ▾
            </Text>
          </Pressable>

          <LineChartCard
            title=""
            subtitle={`${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'} · ${unitFor(selected)}`}
            data={series}
            formatY={formatAxisTick}
          />
          {filtered.length > 0 ? (
            <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
              <View>
                <Caption>FIRST</Caption>
                <Body>
                  {trimNumber(display(selected, filtered[0]!.value), 1)} {unitFor(selected)}
                </Body>
              </View>
              <View>
                <Caption>LATEST</Caption>
                <Body style={{ fontWeight: '700' }}>
                  {trimNumber(display(selected, filtered[filtered.length - 1]!.value), 1)}{' '}
                  {unitFor(selected)}
                </Body>
              </View>
              <View>
                <Caption>CHANGE</Caption>
                <Body
                  style={{
                    color:
                      filtered[filtered.length - 1]!.value - filtered[0]!.value >= 0
                        ? palette.success
                        : palette.danger,
                  }}
                >
                  {(() => {
                    const delta =
                      display(selected, filtered[filtered.length - 1]!.value) -
                      display(selected, filtered[0]!.value);
                    return `${delta >= 0 ? '+' : ''}${trimNumber(delta, 1)}`;
                  })()}
                </Body>
              </View>
            </Row>
          ) : null}
        </Card>

        {Platform.OS === 'android' ? (
          <SettingsSection title="Health Connect">
            <SettingsRow
              label="Sync body composition"
              description="Imports weight, body fat, lean mass and bone mass. Read only."
              value={syncing ? 'Syncing…' : 'From Health Connect'}
              onPress={handleHealthConnectSync}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="All measurements">
          {MEASUREMENT_KINDS.map((kind) => {
            const m = latest.get(kind);
            return (
              <SettingsRow
                key={kind}
                label={MEASUREMENT_LABELS[kind]}
                description={
                  m === undefined
                    ? 'No entries'
                    : `Last logged ${new Date(m.measuredAt).toLocaleDateString()}`
                }
                value={
                  m === undefined
                    ? '—'
                    : `${trimNumber(display(kind, m.value), 1)} ${unitFor(kind)}`
                }
                onPress={() => setEntering(kind)}
                onInfoPress={() => setGuideKind(kind)}
              />
            );
          })}
        </SettingsSection>
      </ScrollView>

      <MeasurementGuideSheet
        visible={guideKind !== null}
        kind={guideKind}
        onClose={() => setGuideKind(null)}
      />

      <ActionSheet
        visible={kindSheetOpen}
        title="Measurement"
        actions={MEASUREMENT_KINDS.map((kind) => ({
          key: kind,
          label: MEASUREMENT_LABELS[kind],
          onPress: () => {
            setKindSheetOpen(false);
            setSelected(kind);
          },
        }))}
        onClose={() => setKindSheetOpen(false)}
      />

      <SpanSheet
        visible={spanSheetOpen}
        options={SPANS.map((s) => ({ key: s.key, label: s.label }))}
        current={span}
        onSelect={(k) => {
          setSpanSheetOpen(false);
          setSpan(k);
        }}
        onClose={() => setSpanSheetOpen(false)}
      />

      <PromptModal
        visible={entering !== null}
        title={
          entering === null
            ? ''
            : `${MEASUREMENT_LABELS[entering]} (${unitFor(entering)})`
        }
        placeholder="Enter a value"
        onCancel={() => setEntering(null)}
        onSubmit={(text) => {
          const kind = entering;
          setEntering(null);
          if (kind === null) return;
          const n = Number(text.replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) {
            Alert.alert('Not a valid number', 'Enter a positive value.');
            return;
          }
          const stored =
            measurementUnit(kind) === 'mass' ? toKg(n, settings.values.weightUnit) : n;
          void addMeasurement(kind, stored).then(() => {
            // Logging bodyweight also updates the setting used for
            // bodyweight-exercise volume, so the two cannot drift apart.
            if (kind === 'weight') void settings.set('bodyweightKg', stored);
            reload();
          });
        }}
      />
    </>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guide: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.6 },
});